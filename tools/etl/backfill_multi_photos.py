"""Backfill multiple iNaturalist photos per species in Cosmos DB.

Fetches research-grade, CC-licensed observation photos from the iNaturalist
observations API and appends them to each bird's ``images`` array.  This
ensures lookalike-mode decks have enough distinct photos so that cards
for the same species never show duplicates.

Usage:
  python backfill_multi_photos.py                    # Backfill all species below target
  python backfill_multi_photos.py --dry-run           # Preview what would be backfilled
  python backfill_multi_photos.py --target 10         # Aim for 10 photos/species (default)
  python backfill_multi_photos.py --limit 500         # Process at most 500 species
  python backfill_multi_photos.py --reset-progress    # Start fresh, ignoring prior runs
"""

import argparse
import json
import os
import re
import sys
import time

import requests
from tqdm import tqdm

from config import COSMOS_DATABASE, COSMOS_ENDPOINT, COSMOS_KEY, DATA_DIR

BIRDS_CONTAINER = "birds"
INAT_API_BASE = "https://api.inaturalist.org/v1"
PROGRESS_FILE = os.path.join(DATA_DIR, "multi_photo_progress.json")

# Same CC-licence allowlist used by the backend inaturalist_service.py
ACCEPTED_LICENSES = {"cc0", "cc-by", "cc-by-nc", "cc-by-sa", "cc-by-nc-sa"}

# Regex to normalise iNat photo size qualifiers to "medium" (max 500 px)
_SIZE_RE = re.compile(r"/(square|small|thumb|large|original)\.")

DEFAULT_TARGET = 10  # photos per species


# ---------------------------------------------------------------------------
#  Cosmos helpers
# ---------------------------------------------------------------------------


def get_container():
    """Return the Cosmos DB birds container."""
    from azure.cosmos import CosmosClient, PartitionKey

    if not COSMOS_ENDPOINT or not COSMOS_KEY:
        print("ERROR: COSMOS_ENDPOINT and COSMOS_KEY must be set in .env")
        sys.exit(1)

    client = CosmosClient(COSMOS_ENDPOINT, credential=COSMOS_KEY)
    database = client.create_database_if_not_exists(id=COSMOS_DATABASE)
    return database.create_container_if_not_exists(
        id=BIRDS_CONTAINER,
        partition_key=PartitionKey(path="/family_code"),
    )


def load_all_birds(container) -> list[dict]:
    """Read every document from the birds container."""
    print("Reading all birds from Cosmos DB...")
    birds = list(container.read_all_items())
    print(f"  Loaded {len(birds)} species from Cosmos")
    return birds


# ---------------------------------------------------------------------------
#  iNaturalist helpers
# ---------------------------------------------------------------------------


def _to_medium_url(url: str) -> str:
    """Convert an iNaturalist photo URL to medium size (max 500 px)."""
    return _SIZE_RE.sub("/medium.", url)


def fetch_observation_photos(taxon_id: int, count: int = 10) -> list[dict] | str:
    """Fetch CC-licensed research-grade photos for a taxon.

    Returns a list of image dicts matching the ``Bird.images`` schema,
    an empty list on failure, or the string ``'RATE_LIMITED'``.
    """
    params = {
        "taxon_id": taxon_id,
        "quality_grade": "research",
        "photos": "true",
        "photo_licensed": "true",
        "order_by": "votes",
        "per_page": count * 2,  # fetch extra to allow for dedup / filtering
    }

    try:
        resp = requests.get(
            f"{INAT_API_BASE}/observations",
            params=params,
            timeout=30,
        )
        if resp.status_code == 429:
            return "RATE_LIMITED"
        resp.raise_for_status()
    except requests.RequestException:
        return []

    data = resp.json()
    results: list[dict] = []
    seen_urls: set[str] = set()

    for obs in data.get("results", []):
        for op in obs.get("observation_photos", []):
            photo = op.get("photo", {})
            license_code = (photo.get("license_code") or "").lower()
            if license_code not in ACCEPTED_LICENSES:
                continue

            raw_url = photo.get("url", "")
            if not raw_url:
                continue

            url = _to_medium_url(raw_url)
            if url in seen_urls:
                continue
            seen_urls.add(url)

            results.append(
                {
                    "url": url,
                    "source": "inaturalist",
                    "license": license_code,
                    "attribution": photo.get("attribution", ""),
                    "quality": "high",
                    "is_primary": False,
                }
            )

            if len(results) >= count:
                return results

    return results


# ---------------------------------------------------------------------------
#  Progress tracking
# ---------------------------------------------------------------------------


def load_progress() -> set[str]:
    if os.path.exists(PROGRESS_FILE):
        with open(PROGRESS_FILE) as f:
            return set(json.load(f))
    return set()


def save_progress(processed: set[str]) -> None:
    with open(PROGRESS_FILE, "w") as f:
        json.dump(sorted(processed), f)


# ---------------------------------------------------------------------------
#  Main
# ---------------------------------------------------------------------------


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Backfill multiple iNaturalist photos per species"
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Only report candidates; don't fetch or update",
    )
    parser.add_argument(
        "--target",
        type=int,
        default=DEFAULT_TARGET,
        help=f"Target number of photos per species (default: {DEFAULT_TARGET})",
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
        help="Seconds between iNaturalist API calls (default: 1.0)",
    )
    parser.add_argument(
        "--reset-progress",
        action="store_true",
        help="Ignore previous progress and start fresh",
    )
    args = parser.parse_args()

    container = get_container()
    birds = load_all_birds(container)

    # Identify species that need more photos
    candidates = [
        b
        for b in birds
        if b.get("inat_taxon_id") and len(b.get("images", [])) < args.target
    ]

    # Exclude previously processed
    processed = set() if args.reset_progress else load_progress()
    if processed:
        before = len(candidates)
        candidates = [b for b in candidates if b["species_code"] not in processed]
        print(f"  Skipping {before - len(candidates)} already-processed species")

    print(f"\n  Candidates for multi-photo backfill: {len(candidates)}")
    if candidates:
        counts = [len(b.get("images", [])) for b in candidates]
        print(
            f"    Current image counts: min={min(counts)}, max={max(counts)}, "
            f"median={sorted(counts)[len(counts) // 2]}"
        )

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
    enriched = 0
    skipped = 0
    errors = 0
    rate_limited = 0
    total_new_photos = 0

    print(
        f"\n  Fetching iNaturalist observation photos "
        f"(target={args.target}, delay={args.delay}s)...\n"
    )

    try:
        for i, bird in enumerate(tqdm(candidates, desc="Multi-photo backfill")):
            taxon_id = bird["inat_taxon_id"]
            existing_urls = {img["url"] for img in bird.get("images", [])}
            needed = args.target - len(bird.get("images", []))

            result = fetch_observation_photos(taxon_id, count=needed + 4)

            # Handle rate limiting with one retry
            if result == "RATE_LIMITED":
                rate_limited += 1
                tqdm.write(f"  Rate limited at {i}, waiting 60 s...")
                time.sleep(60)
                result = fetch_observation_photos(taxon_id, count=needed + 4)
                if result == "RATE_LIMITED":
                    tqdm.write("  Still rate limited, skipping...")
                    skipped += 1
                    processed.add(bird["species_code"])
                    continue

            if not result or not isinstance(result, list):
                skipped += 1
                processed.add(bird["species_code"])
                continue

            # Deduplicate against existing images
            new_photos = [p for p in result if p["url"] not in existing_urls][:needed]

            if new_photos:
                bird["images"] = bird.get("images", []) + new_photos
                try:
                    container.upsert_item(bird)
                    enriched += 1
                    total_new_photos += len(new_photos)
                except Exception as e:
                    errors += 1
                    if errors <= 5:
                        tqdm.write(f"  Cosmos upsert error for {bird['id']}: {e}")
            else:
                skipped += 1

            processed.add(bird["species_code"])

            if (i + 1) % 100 == 0:
                save_progress(processed)

            time.sleep(args.delay)

    except KeyboardInterrupt:
        print("\n\n  Interrupted! Saving progress...")

    save_progress(processed)

    # Summary
    print("\n  === Multi-Photo Backfill Summary ===")
    print(f"  Processed:        {len(processed)} species")
    print(f"  Enriched:         {enriched}")
    print(f"  New photos added: {total_new_photos}")
    print(f"  Skipped:          {skipped}")
    print(f"  Errors:           {errors}")
    print(f"  Rate limited:     {rate_limited}")

    if enriched:
        all_birds = load_all_birds(container)
        counts = [len(b.get("images", [])) for b in all_birds if b.get("images")]
        at_target = sum(1 for c in counts if c >= args.target)
        print(f"\n  Species at target ({args.target}+): {at_target}/{len(all_birds)}")
        if counts:
            print(
                f"  Image count range: {min(counts)}–{max(counts)}, "
                f"median={sorted(counts)[len(counts) // 2]}"
            )


if __name__ == "__main__":
    main()
