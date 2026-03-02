"""Backfill iNaturalist photos for species in Cosmos DB.

Reads all documents from the 'birds' container, identifies species that are
missing iNaturalist images (either no images at all, or only Wikimedia gap-fills),
and attempts to fetch a photo from the iNaturalist API.  Successfully fetched
photos are upserted back to Cosmos immediately.

Usage:
  python backfill_inaturalist.py                   # Backfill all species missing iNat images
  python backfill_inaturalist.py --dry-run          # Preview what would be backfilled
  python backfill_inaturalist.py --replace-wikimedia # Replace wikimedia gap-fills with iNat photos
  python backfill_inaturalist.py --limit 500        # Process at most 500 species
"""

import argparse
import json
import os
import sys
import time
from datetime import datetime, timezone

import requests
from tqdm import tqdm

from config import COSMOS_DATABASE, COSMOS_ENDPOINT, COSMOS_KEY, DATA_DIR

BIRDS_CONTAINER = "birds"
INAT_API_BASE = "https://api.inaturalist.org/v1/taxa"
PROGRESS_FILE = os.path.join(DATA_DIR, "inat_backfill_progress.json")


def get_container():
    """Return the Cosmos DB birds container."""
    from azure.cosmos import CosmosClient, PartitionKey

    if not COSMOS_ENDPOINT or not COSMOS_KEY:
        print("ERROR: COSMOS_ENDPOINT and COSMOS_KEY must be set in .env")
        sys.exit(1)

    client = CosmosClient(COSMOS_ENDPOINT, credential=COSMOS_KEY)
    database = client.create_database_if_not_exists(id=COSMOS_DATABASE)
    container = database.create_container_if_not_exists(
        id=BIRDS_CONTAINER,
        partition_key=PartitionKey(path="/family_code"),
    )
    return container


def load_all_birds(container) -> list[dict]:
    """Read every document from the birds container."""
    print("Reading all birds from Cosmos DB...")
    birds = list(container.read_all_items())
    print(f"  Loaded {len(birds)} species from Cosmos")
    return birds


def needs_inaturalist_image(bird: dict, replace_wikimedia: bool) -> bool:
    """Determine whether this bird should be backfilled.

    Returns True if:
      - The bird has an inat_taxon_id (so we can look it up), AND
      - The bird has no images at all, OR
      - replace_wikimedia is True and all images are from wikimedia (no iNat photo)
    """
    taxon_id = bird.get("inat_taxon_id")
    if not taxon_id:
        return False

    images = bird.get("images", [])
    if not images:
        return True

    if replace_wikimedia:
        has_inat = any(img.get("source") == "inaturalist" for img in images)
        return not has_inat

    return False


def fetch_inat_photo(taxon_id: int) -> dict | None | str:
    """Fetch the default photo for a taxon from the iNaturalist API.

    Returns an image dict matching the Bird.images schema, None, or 'RATE_LIMITED'.
    """
    try:
        resp = requests.get(
            f"{INAT_API_BASE}/{taxon_id}",
            timeout=15,
        )
        if resp.status_code == 200:
            data = resp.json()
            results = data.get("results", [])
            if results:
                default_photo = results[0].get("default_photo")
                if default_photo:
                    photo_url = default_photo.get("medium_url", "")
                    attribution = default_photo.get("attribution", "")
                    license_code = default_photo.get("license_code", "")
                    if photo_url:
                        return {
                            "url": photo_url,
                            "source": "inaturalist",
                            "license": license_code or "",
                            "attribution": attribution,
                            "quality": "high",
                            "is_primary": True,
                        }
        elif resp.status_code == 429:
            return "RATE_LIMITED"
    except requests.RequestException:
        return None
    return None


def load_progress() -> set[str]:
    """Load the set of species_codes already processed in this backfill."""
    if os.path.exists(PROGRESS_FILE):
        with open(PROGRESS_FILE) as f:
            return set(json.load(f))
    return set()


def save_progress(processed: set[str]) -> None:
    """Persist the set of processed species_codes."""
    with open(PROGRESS_FILE, "w") as f:
        json.dump(sorted(processed), f)


def main():
    parser = argparse.ArgumentParser(
        description="Backfill iNaturalist photos for birds in Cosmos DB"
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Only report how many species need backfilling; don't fetch or update",
    )
    parser.add_argument(
        "--replace-wikimedia",
        action="store_true",
        help="Also try to replace wikimedia gap-fill images with iNaturalist photos",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=0,
        help="Max number of species to process (0 = all)",
    )
    parser.add_argument(
        "--delay",
        type=float,
        default=1.0,
        help="Seconds to wait between iNaturalist API calls (default: 1.0)",
    )
    parser.add_argument(
        "--reset-progress",
        action="store_true",
        help="Ignore previous backfill progress and start fresh",
    )
    args = parser.parse_args()

    container = get_container()
    birds = load_all_birds(container)

    # Identify candidates for backfill
    candidates = [
        b for b in birds if needs_inaturalist_image(b, args.replace_wikimedia)
    ]

    # Filter out previously-processed species (unless --reset-progress)
    processed = set() if args.reset_progress else load_progress()
    if processed:
        before = len(candidates)
        candidates = [b for b in candidates if b["species_code"] not in processed]
        print(f"  Skipping {before - len(candidates)} already-processed species")

    print(f"\n  Candidates for iNaturalist backfill: {len(candidates)}")

    # Break down by reason
    no_images = sum(1 for b in candidates if not b.get("images"))
    wiki_only = len(candidates) - no_images
    print(f"    No images at all:    {no_images}")
    print(f"    Wikimedia only:      {wiki_only}")

    if args.dry_run:
        print("\n  --dry-run mode, exiting without changes.")
        return

    if not candidates:
        print("\n  Nothing to backfill!")
        return

    if args.limit:
        candidates = candidates[: args.limit]
        print(f"  Limited to {len(candidates)} species (--limit {args.limit})")

    # Fetch & upsert
    fetched = 0
    skipped = 0
    errors = 0
    rate_limited_count = 0
    data_version = datetime.now(timezone.utc).strftime("%Y-%m")

    print(
        f"\n  Fetching iNaturalist photos (delay={args.delay}s between requests)...\n"
    )

    try:
        for i, bird in enumerate(tqdm(candidates, desc="Backfilling iNat photos")):
            taxon_id = bird["inat_taxon_id"]
            result = fetch_inat_photo(taxon_id)

            if result == "RATE_LIMITED":
                rate_limited_count += 1
                tqdm.write(f"  Rate limited at {i}, waiting 60s...")
                time.sleep(60)
                # Retry once
                result = fetch_inat_photo(taxon_id)
                if result == "RATE_LIMITED":
                    tqdm.write("  Still rate limited, skipping...")
                    skipped += 1
                    processed.add(bird["species_code"])
                    continue

            if result and isinstance(result, dict):
                # Update the bird document
                if args.replace_wikimedia:
                    # Remove existing wikimedia images, keep any non-wikimedia
                    bird["images"] = [
                        img
                        for img in bird.get("images", [])
                        if img.get("source") != "wikimedia"
                    ]
                bird["images"] = [result] + bird.get("images", [])
                # Mark all others as non-primary
                for img in bird["images"][1:]:
                    img["is_primary"] = False

                bird["data_version"] = data_version

                # Upsert immediately
                try:
                    container.upsert_item(bird)
                    fetched += 1
                except Exception as e:
                    errors += 1
                    if errors <= 5:
                        tqdm.write(f"  Cosmos upsert error for {bird['id']}: {e}")
            else:
                skipped += 1

            processed.add(bird["species_code"])

            # Save progress every 100 species
            if (i + 1) % 100 == 0:
                save_progress(processed)

            # Rate limiting
            time.sleep(args.delay)

    except KeyboardInterrupt:
        print("\n\n  Interrupted! Saving progress...")

    # Final progress save
    save_progress(processed)

    # Summary
    print("\n  === Backfill Summary ===")
    print(f"  Processed:       {len(processed)} species")
    print(f"  Photos fetched:  {fetched}")
    print(f"  Skipped/no photo:{skipped}")
    print(f"  Errors:          {errors}")
    print(f"  Rate limited:    {rate_limited_count}")

    if fetched:
        # Re-read totals from Cosmos for an accurate final count
        all_birds = load_all_birds(container)
        total_with_images = sum(1 for b in all_birds if b.get("images"))
        total_with_inat = sum(
            1
            for b in all_birds
            if any(img.get("source") == "inaturalist" for img in b.get("images", []))
        )
        print(f"\n  Total species:        {len(all_birds)}")
        print(
            f"  With any image:       {total_with_images} ({total_with_images / len(all_birds) * 100:.1f}%)"
        )
        print(
            f"  With iNaturalist img: {total_with_inat} ({total_with_inat / len(all_birds) * 100:.1f}%)"
        )


if __name__ == "__main__":
    main()
