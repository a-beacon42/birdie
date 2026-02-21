"""Step F — Upsert species data to Azure Cosmos DB.

Writes species data to the 'birds' container in Cosmos DB using upsert.
Supports both full-pipeline runs and incremental batch upserts from other steps.
"""

import json
import os
from datetime import datetime, timezone

from azure.cosmos import CosmosClient, PartitionKey
from tqdm import tqdm

from config import COSMOS_DATABASE, COSMOS_ENDPOINT, COSMOS_KEY, DATA_DIR

BIRDS_CONTAINER = "birds"

# Module-level cached container reference (lazy init)
_container = None


def get_container():
    """Return the Cosmos DB container, creating database/container if needed.

    Uses a module-level cache so repeated calls reuse the same client.
    """
    global _container
    if _container is not None:
        return _container

    if not COSMOS_ENDPOINT or not COSMOS_KEY:
        raise RuntimeError("COSMOS_ENDPOINT and COSMOS_KEY must be set in .env")

    client = CosmosClient(COSMOS_ENDPOINT, credential=COSMOS_KEY)
    database = client.create_database_if_not_exists(id=COSMOS_DATABASE)
    _container = database.create_container_if_not_exists(
        id=BIRDS_CONTAINER,
        partition_key=PartitionKey(path="/family_code"),
    )
    return _container


def upsert_batch(
    species: list[dict], label: str = "batch", quiet: bool = False
) -> tuple[int, int]:
    """Upsert a batch of species documents to Cosmos DB.

    Args:
        species: List of species dicts to upsert.
        label:   Label for progress bar / logging.
        quiet:   If True, suppress the progress bar.

    Returns:
        (success_count, error_count)
    """
    container = get_container()
    data_version = datetime.now(timezone.utc).strftime("%Y-%m")

    success = 0
    errors = 0
    iterator = species if quiet else tqdm(species, desc=f"Cosmos upsert ({label})")
    for bird in iterator:
        bird["data_version"] = data_version
        try:
            container.upsert_item(bird)
            success += 1
        except Exception as e:
            errors += 1
            if errors <= 5:
                print(f"\n  Error upserting {bird.get('id', '?')}: {e}")

    return success, errors


def run(species: list[dict]) -> None:
    """Upsert all species to Cosmos DB (called as the final pipeline step).

    Args:
        species: Complete species data (output from Step E).
    """
    print("Step F: Upserting to Cosmos DB")

    if not COSMOS_ENDPOINT or not COSMOS_KEY:
        print("  ERROR: COSMOS_ENDPOINT and COSMOS_KEY must be set in .env")
        return

    print(f"  Upserting {len(species)} species...")
    success, errors = upsert_batch(species, label="full")
    print(f"  Done: {success} succeeded, {errors} failed")

    # Print summary stats
    total_with_images = sum(1 for s in species if s.get("images"))
    total_with_audio = sum(1 for s in species if s.get("audio_url"))
    data_version = datetime.now(timezone.utc).strftime("%Y-%m")
    print(f"\n  === ETL Summary ===")
    print(f"  Total species:    {len(species)}")
    print(
        f"  With images:      {total_with_images} ({total_with_images/len(species)*100:.1f}%)"
    )
    print(
        f"  With audio:       {total_with_audio} ({total_with_audio/len(species)*100:.1f}%)"
    )
    print(f"  Data version:     {data_version}")


if __name__ == "__main__":
    # Standalone: load whatever complete data exists and upsert it
    for candidate in [
        "species_complete.json",
        "species_with_audio.json",
        "species_with_all_images.json",
        "species_with_images.json",
        "ebird_taxonomy.json",
    ]:
        path = os.path.join(DATA_DIR, candidate)
        if os.path.exists(path):
            print(f"Loading {candidate}...")
            with open(path) as f:
                species = json.load(f)
            run(species)
            break
    else:
        print("ERROR: No intermediate data files found in data/")
