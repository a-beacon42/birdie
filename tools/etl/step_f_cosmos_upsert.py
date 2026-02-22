"""Step F — Validate and summarize data in Cosmos DB.

Reads all species from the birds container, stamps a data_version on any
documents that don't have one yet, and prints coverage statistics.

Previously this step was the bulk upsert — now each earlier step upserts
directly, so this step focuses on validation and versioning.
"""

from datetime import datetime, timezone

from tqdm import tqdm

from config import get_container, load_all_species


def run() -> None:
    """Validate data and print summary statistics from Cosmos DB."""
    print("Step F: Validating Cosmos DB data")

    container = get_container()
    species = load_all_species()

    if not species:
        print("  WARNING: No species found in Cosmos DB")
        return

    data_version = datetime.now(timezone.utc).strftime("%Y-%m")

    # Stamp data_version on documents missing it
    needs_version = [s for s in species if not s.get("data_version")]
    if needs_version:
        print(
            f"  Stamping data_version={data_version} on {len(needs_version)} documents..."
        )
        for bird in tqdm(needs_version, desc="Stamping data_version"):
            bird["data_version"] = data_version
            try:
                container.upsert_item(bird)
            except Exception as e:
                print(f"\n  Error upserting {bird.get('id', '?')}: {e}")

    # Print summary stats
    total = len(species)
    total_with_images = sum(1 for s in species if s.get("images"))
    total_with_inat = sum(
        1
        for s in species
        if any(img.get("source") == "inaturalist" for img in s.get("images", []))
    )
    total_with_audio = sum(1 for s in species if s.get("audio_url"))
    total_with_wiki = sum(1 for s in species if s.get("wikipedia_url"))
    total_with_freq = sum(1 for s in species if s.get("global_frequency", 0) > 0)

    pct = lambda n: f"{n/total*100:.1f}%" if total else "N/A"

    print(f"\n  === ETL Summary ===")
    print(f"  Total species:        {total}")
    print(f"  With images:          {total_with_images} ({pct(total_with_images)})")
    print(f"  With iNat images:     {total_with_inat} ({pct(total_with_inat)})")
    print(f"  With audio:           {total_with_audio} ({pct(total_with_audio)})")
    print(f"  With Wikipedia URLs:  {total_with_wiki} ({pct(total_with_wiki)})")
    print(f"  With frequency data:  {total_with_freq} ({pct(total_with_freq)})")
    print(f"  Data version:         {data_version}")


if __name__ == "__main__":
    run()
