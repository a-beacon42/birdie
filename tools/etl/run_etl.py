"""Birdie ETL Pipeline — Main orchestrator.

Runs all ETL steps in sequence:
  A. Fetch eBird taxonomy → upsert to Cosmos DB
  B. Match iNaturalist photos → upsert to Cosmos DB
  C. Fill gaps with Wikimedia Commons → upsert to Cosmos DB
  D. Fetch Xeno-canto audio → upsert to Cosmos DB
  E. Build Wikipedia URLs → upsert to Cosmos DB
  F. Validate data and print summary

Each step queries Cosmos DB directly for its input and upserts results back,
so any step can be run independently or the pipeline can resume from any point.

Usage:
  python run_etl.py                    # Run all steps
  python run_etl.py --from-step c      # Resume from step C
  python run_etl.py --skip-audio       # Skip the slow Xeno-canto step
"""

import argparse
import time


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
    args = parser.parse_args()

    steps = ["a", "b", "c", "d", "e", "f"]
    start_idx = steps.index(args.from_step)
    start_time = time.time()

    # Step A
    if start_idx <= 0:
        print("=" * 60)
        print("STEP A: eBird Taxonomy")
        print("=" * 60)
        import step_a_ebird_taxonomy

        step_a_ebird_taxonomy.run()
        print()

    # Step B
    if start_idx <= 1:
        print("=" * 60)
        print("STEP B: iNaturalist Photos")
        print("=" * 60)
        import step_b_inaturalist_photos

        step_b_inaturalist_photos.run()
        print()

    # Step C
    if start_idx <= 2:
        print("=" * 60)
        print("STEP C: Wikimedia Commons Gap Fill")
        print("=" * 60)
        import step_c_wikimedia_images

        step_c_wikimedia_images.run()
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

            step_d_xenocanto_audio.run()
        print()

    # Step E
    if start_idx <= 4:
        print("=" * 60)
        print("STEP E: Wikipedia URLs")
        print("=" * 60)
        import step_e_wikipedia_urls

        step_e_wikipedia_urls.run()
        print()

    # Step F
    if start_idx <= 5:
        print("=" * 60)
        print("STEP F: Validate & Summarize")
        print("=" * 60)
        import step_f_cosmos_upsert

        step_f_cosmos_upsert.run()
        print()

    elapsed = time.time() - start_time
    hours, remainder = divmod(elapsed, 3600)
    minutes, seconds = divmod(remainder, 60)
    print(f"ETL pipeline complete in {int(hours)}h {int(minutes)}m {int(seconds)}s")


if __name__ == "__main__":
    main()
