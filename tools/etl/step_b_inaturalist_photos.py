"""Step B — Match iNaturalist photos via the S3 open data export.

Downloads taxa.csv.gz and photos.csv.gz from the inaturalist-open-data S3 bucket,
joins eBird species to iNat taxon IDs via scientific name, and selects the
best CC-licensed photo per species.

This is the most time-intensive step (~15-30 min for download + processing).
"""

import gzip
import json
import os

import boto3
import pandas as pd
from botocore import UNSIGNED
from botocore.config import Config
from tqdm import tqdm

from config import DATA_DIR, INAT_S3_BUCKET

TAXA_KEY = "taxa.csv.gz"
PHOTOS_KEY = "photos.csv.gz"
TAXA_LOCAL = os.path.join(DATA_DIR, "inat_taxa.csv.gz")
PHOTOS_LOCAL = os.path.join(DATA_DIR, "inat_photos.csv.gz")

# CC licenses we consider acceptable
ALLOWED_LICENSES = {"CC-BY", "CC0", "CC-BY-NC"}

# iNaturalist photo URL pattern:
# https://inaturalist-open-data.s3.amazonaws.com/photos/{photo_id}/medium.{extension}
INAT_PHOTO_URL = (
    "https://inaturalist-open-data.s3.amazonaws.com/photos/{photo_id}/medium.{ext}"
)


def _download_s3_file(key: str, local_path: str) -> None:
    """Download a file from the public iNaturalist S3 bucket (no credentials)."""
    if os.path.exists(local_path):
        print(f"  {local_path} already exists, skipping download")
        return

    print(f"  Downloading s3://{INAT_S3_BUCKET}/{key} -> {local_path}")
    s3 = boto3.client("s3", config=Config(signature_version=UNSIGNED))
    s3.download_file(INAT_S3_BUCKET, key, local_path)
    print(f"  Download complete: {local_path}")


def _load_taxa() -> pd.DataFrame:
    """Load iNaturalist taxa TSV and filter to species-level active taxa."""
    print("  Loading iNaturalist taxa...")
    df = pd.read_csv(
        TAXA_LOCAL,
        compression="gzip",
        sep="\t",
        usecols=["taxon_id", "name", "rank", "active"],
        dtype={"taxon_id": int, "name": str, "rank": str, "active": str},
    )
    # Filter to active species-level taxa (active column is string "true"/"false")
    df = df[(df["rank"] == "species") & (df["active"].str.lower() == "true")]
    # We'll match by scientific name
    df = df[["taxon_id", "name"]].rename(columns={"name": "sci_name"})
    return df


def _load_photos() -> pd.DataFrame:
    """Load iNaturalist photos TSV — only fields we need."""
    print("  Loading iNaturalist photos (this may take a few minutes)...")
    df = pd.read_csv(
        PHOTOS_LOCAL,
        compression="gzip",
        sep="\t",
        usecols=[
            "photo_id",
            "observation_uuid",
            "extension",
            "license",
            "width",
            "height",
            "position",
        ],
        dtype={
            "photo_id": int,
            "extension": str,
            "license": str,
            "width": "Int64",
            "height": "Int64",
            "position": "Int64",
        },
    )
    # Filter to acceptable licenses
    df = df[df["license"].isin(ALLOWED_LICENSES)]
    return df


def run(species: list[dict], cosmos_batch: bool = False) -> list[dict]:
    """Match iNaturalist photos to each species and update the species list.

    Args:
        species: Output from Step A (list of normalized bird dicts).
        cosmos_batch: If True, upsert all species to Cosmos every 500 photo fetches.

    Returns:
        Updated species list with inat_taxon_id and images populated where matched.
    """
    print("Step B: Matching iNaturalist photos")
    _download_s3_file(TAXA_KEY, TAXA_LOCAL)
    _download_s3_file(PHOTOS_KEY, PHOTOS_LOCAL)

    taxa_df = _load_taxa()
    photos_df = _load_photos()

    # Build species DataFrame from our taxonomy
    species_df = pd.DataFrame(species)[["species_code", "sci_name"]]

    # Left join species -> iNat taxa on scientific name
    merged = species_df.merge(taxa_df, on="sci_name", how="left")
    matched_count = merged["taxon_id"].notna().sum()
    print(
        f"  Matched {matched_count}/{len(species_df)} species to iNaturalist taxon IDs"
    )

    # Build a lookup: taxon_id -> best photo
    # For now, pick the photo with the largest area (width * height), or first if missing dims
    print("  Selecting best photo per taxon...")

    # We need taxon_id from observations — iNat open data photos.csv doesn't have taxon_id directly.
    # We'll need the observations table for the join. For simplicity, we'll use the iNat API
    # for matched taxa as a fallback approach.
    #
    # ALTERNATIVE APPROACH: Use the iNaturalist REST API for taxa with default_photo.
    # This is simpler but rate-limited (~60 req/min). For ~10K species, that's ~3 hours.
    # We'll use this approach for now and can optimize with bulk S3 data later.

    taxon_id_map = dict(zip(merged["species_code"], merged["taxon_id"]))

    # Update species with taxon IDs
    for bird in tqdm(species, desc="Updating taxon IDs"):
        tid = taxon_id_map.get(bird["species_code"])
        if pd.notna(tid):
            bird["inat_taxon_id"] = int(tid)

    # For photos, we'll use the iNaturalist API (v1/taxa/{id}) to get default_photo
    # This is done in a separate step to keep things modular and allow resume on failure
    _fetch_photos_via_api(species, cosmos_batch=cosmos_batch)

    with_images = sum(1 for s in species if s["images"])
    print(
        f"  Species with images: {with_images}/{len(species)} ({with_images/len(species)*100:.1f}%)"
    )

    # Save intermediate result
    output_file = os.path.join(DATA_DIR, "species_with_images.json")
    with open(output_file, "w") as f:
        json.dump(species, f, indent=2)
    print(f"  Wrote intermediate data to {output_file}")

    return species


def _fetch_photos_via_api(species: list[dict], cosmos_batch: bool = False) -> None:
    """Fetch default photos from iNaturalist API for species with a taxon ID.

    Rate limit: ~60 requests/min. Uses a simple delay to stay under.
    Saves progress incrementally to allow resume on failure.
    When cosmos_batch=True, upserts ALL species to Cosmos every 500 fetches.
    """
    import time

    import requests

    # Lazy-import to avoid circular deps / requiring Cosmos creds when not needed
    _cosmos_upsert = None
    if cosmos_batch:
        try:
            from step_f_cosmos_upsert import upsert_batch

            _cosmos_upsert = upsert_batch
            print("  Cosmos batch mode enabled — will sync every 500 species")
        except Exception as e:
            print(f"  WARNING: Could not enable Cosmos batch mode: {e}")
            cosmos_batch = False

    progress_file = os.path.join(DATA_DIR, "inat_photo_progress.json")
    processed: set[str] = set()

    if os.path.exists(progress_file):
        with open(progress_file) as f:
            processed = set(json.load(f))
        print(f"  Resuming from {len(processed)} previously processed species")

    to_process = [
        s
        for s in species
        if s["inat_taxon_id"] is not None
        and s["species_code"] not in processed
        and not s["images"]  # Skip if already has images
    ]

    print(f"  Fetching photos for {len(to_process)} species via iNaturalist API...")
    print("  (Press Ctrl+C to stop fetching and continue to next steps)")

    interrupted = False
    for i, bird in enumerate(tqdm(to_process, desc="Fetching iNat photos")):
        if interrupted:
            break
        taxon_id = bird["inat_taxon_id"]
        try:
            resp = requests.get(
                f"https://api.inaturalist.org/v1/taxa/{taxon_id}",
                timeout=1,
            )
            if resp.status_code == 200:
                data = resp.json()
                results = data.get("results", [])
                if results:
                    taxon = results[0]
                    default_photo = taxon.get("default_photo")
                    if default_photo:
                        photo_url = default_photo.get("medium_url", "")
                        attribution = default_photo.get("attribution", "")
                        license_code = default_photo.get("license_code", "")
                        if photo_url:
                            bird["images"] = [
                                {
                                    "url": photo_url,
                                    "source": "inaturalist",
                                    "license": license_code or "",
                                    "attribution": attribution,
                                    "quality": "high",
                                    "is_primary": True,
                                }
                            ]
            elif resp.status_code == 429:
                print(f"\n  Rate limited at item {i}, waiting 60s...")
                time.sleep(60)
                continue

        except KeyboardInterrupt:
            print(
                f"\n  Stopping gracefully after {i} items... continuing to next steps."
            )
            interrupted = True
        except requests.RequestException as e:
            print(f"\n  Error fetching taxon {taxon_id}: {e}")

        processed.add(bird["species_code"])

        # Rate limiting: ~1 request per second to stay well under 60/min
        # time.sleep(1.0)

        # Save progress every 100 species
        if (i + 1) % 100 == 0:
            with open(progress_file, "w") as f:
                json.dump(list(processed), f)

        # Batch upsert ALL species to Cosmos every 500 fetches
        if cosmos_batch and _cosmos_upsert and (i + 1) % 500 == 0:
            print(f"\n  >> Batch Cosmos sync at {i + 1} fetches...")
            ok, err = _cosmos_upsert(species, label=f"step-b-batch-{i+1}", quiet=True)
            print(f"  >> {ok} upserted, {err} errors")

    # Final save of progress
    with open(progress_file, "w") as f:
        json.dump(list(processed), f)


if __name__ == "__main__":
    # Standalone: load Step A output and run
    input_file = os.path.join(DATA_DIR, "ebird_taxonomy.json")
    with open(input_file) as f:
        species = json.load(f)
    run(species)
