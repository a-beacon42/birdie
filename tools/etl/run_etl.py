"""Birdie ETL Pipeline — Main orchestrator.

Runs all ETL steps in sequence:
  A. Fetch eBird taxonomy
  B. Match iNaturalist photos
  C. Fill gaps with Wikimedia Commons
  D. Fetch Xeno-canto audio
  E. Build Wikipedia URLs
  F. Upsert to Cosmos DB

Usage:
  python run_etl.py                    # Run all steps
  python run_etl.py --from-step c      # Resume from step C
  python run_etl.py --skip-audio       # Skip the slow Xeno-canto step
  python run_etl.py --cosmos-each-step # Upsert to Cosmos DB after every step
"""

import argparse
import json
import os
import sys
import time

from config import DATA_DIR


def main():
    parser = argparse.ArgumentParser(description="Birdie ETL Pipeline")
    parser.add_argument(
        "--from-step",
        choices=["a", "b", "c", "d", "e", "f"],
        default="a",
        help="Resume from a specific step (default: a)",
    )
    parser.add_argument(
        "--skip-audio",
        action="store_true",
        help="Skip Step D (Xeno-canto audio) — useful for faster test runs",
    )
    parser.add_argument(
        "--skip-cosmos",
        action="store_true",
        help="Skip Step F (Cosmos DB upsert) — useful for local testing",
    )
    parser.add_argument(
        "--cosmos-each-step",
        action="store_true",
        help="Upsert to Cosmos DB after every step so data is available immediately",
    )
    args = parser.parse_args()

    steps = ["a", "b", "c", "d", "e", "f"]
    start_idx = steps.index(args.from_step)
    start_time = time.time()

    species: list[dict] = []

    def _cosmos_sync(step_label: str):
        """Push current species to Cosmos if --cosmos-each-step is enabled."""
        if not args.cosmos_each_step or not species:
            return
        print(
            f"  >> Syncing {len(species)} species to Cosmos DB after step {step_label}..."
        )
        import step_f_cosmos_upsert

        ok, err = step_f_cosmos_upsert.upsert_batch(
            species, label=f"after-{step_label}", quiet=False
        )
        print(f"  >> Cosmos sync: {ok} succeeded, {err} failed\n")

    # Load intermediate data if resuming
    if start_idx > 0:
        resume_files = {
            1: "ebird_taxonomy.json",  # Resume from B
            2: None,  # Step C queries Cosmos DB directly — no input file needed
            3: "species_with_images.json",  # Resume from D
            4: "species_with_audio.json",  # Resume from E
            5: "species_complete.json",  # Resume from F
        }
        resume_file_name = resume_files[start_idx]
        if resume_file_name is not None:
            resume_file = os.path.join(DATA_DIR, resume_file_name)
            if not os.path.exists(resume_file):
                print(
                    f"ERROR: Cannot resume from step {args.from_step} — "
                    f"missing intermediate file: {resume_file}"
                )
                sys.exit(1)
            print(f"Loading intermediate data from {resume_file}...")
            with open(resume_file) as f:
                species = json.load(f)
            print(f"  Loaded {len(species)} species\n")
        else:
            print(
                f"Step {args.from_step.upper()} queries the database directly — no intermediate file needed.\n"
            )

    # Step A
    if start_idx <= 0:
        print("=" * 60)
        print("STEP A: eBird Taxonomy")
        print("=" * 60)
        import step_a_ebird_taxonomy

        species = step_a_ebird_taxonomy.run()
        _cosmos_sync("A")
        print()

    # Step B
    if start_idx <= 1:
        print("=" * 60)
        print("STEP B: iNaturalist Photos")
        print("=" * 60)
        import step_b_inaturalist_photos

        species = step_b_inaturalist_photos.run(
            species, cosmos_batch=args.cosmos_each_step
        )
        _cosmos_sync("B")
        print()

    # Step C
    if start_idx <= 2:
        print("=" * 60)
        print("STEP C: Wikimedia Commons Gap Fill")
        print("=" * 60)
        import step_c_wikimedia_images

        step_c_wikimedia_images.run()
        # Step C queries Cosmos directly and upserts — no _cosmos_sync needed
        print()

    # Step D
    if start_idx <= 3:
        if args.skip_audio:
            print("=" * 60)
            print("STEP D: Xeno-canto Audio (SKIPPED)")
            print("=" * 60)
        else:
            print("=" * 60)
            print("STEP D: Xeno-canto Audio")
            print("=" * 60)
            import step_d_xenocanto_audio

            species = step_d_xenocanto_audio.run(species)
        _cosmos_sync("D")
        print()

    # Step E
    if start_idx <= 4:
        print("=" * 60)
        print("STEP E: Wikipedia URLs")
        print("=" * 60)
        import step_e_wikipedia_urls

        species = step_e_wikipedia_urls.run(species)
        _cosmos_sync("E")
        print()

    # Step F
    if start_idx <= 5:
        if args.skip_cosmos:
            print("=" * 60)
            print("STEP F: Cosmos DB Upsert (SKIPPED)")
            print("=" * 60)
        else:
            print("=" * 60)
            print("STEP F: Cosmos DB Upsert")
            print("=" * 60)
            import step_f_cosmos_upsert

            step_f_cosmos_upsert.run(species)
        print()

    elapsed = time.time() - start_time
    hours, remainder = divmod(elapsed, 3600)
    minutes, seconds = divmod(remainder, 60)
    print(f"ETL pipeline complete in {int(hours)}h {int(minutes)}m {int(seconds)}s")


if __name__ == "__main__":
    main()
