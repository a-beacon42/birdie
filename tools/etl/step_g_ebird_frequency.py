"""Step G — Compute global observation frequency from eBird.

Uses eBird's recent observations endpoint across major world regions to
estimate how commonly each species is reported globally.  The resulting
frequency score (0.0–1.0) is stored on each bird document in Cosmos DB
as ``global_frequency``.

Strategy:
  1. Query eBird ``/v2/data/obs/{region}/recent?back=30`` for a set of
     high-coverage regions (the top eBird countries by checklist volume).
  2. Count how many regions report each species.
  3. Normalize to 0.0–1.0 where 1.0 means reported in every sampled region.
  4. Upsert the ``global_frequency`` field on each Cosmos DB document.

This is an *approximation* of global reporting frequency — good enough for
difficulty-tier filtering but not a rigorous abundance metric.
"""

import json
import os
import time

import requests
from tqdm import tqdm

from config import DATA_DIR, EBIRD_API_KEY, get_container, load_all_species

OUTPUT_FILE = os.path.join(DATA_DIR, "global_frequency.json")

EBIRD_BASE = "https://api.ebird.org/v2"

# Top eBird countries by checklist volume — enough geographic spread to
# approximate global "commonness".  More regions = better estimate but
# slower run (each is an API call with up to 30 days of recent obs).
SAMPLE_REGIONS = [
    "US",  # United States
    "CA",  # Canada
    "GB",  # United Kingdom
    "AU",  # Australia
    "IN",  # India
    "BR",  # Brazil
    "ZA",  # South Africa
    "CR",  # Costa Rica
    "MX",  # Mexico
    "DE",  # Germany
    "CO",  # Colombia
    "KE",  # Kenya
    "EC",  # Ecuador
    "PE",  # Peru
    "TH",  # Thailand
]


def _headers() -> dict[str, str]:
    return {
        "X-eBirdApiToken": EBIRD_API_KEY,
        "Content-Type": "application/json",
    }


def fetch_region_species(region_code: str) -> set[str]:
    """Fetch species codes recently reported in a region (last 30 days)."""
    resp = requests.get(
        f"{EBIRD_BASE}/data/obs/{region_code}/recent",
        params={"back": 30},
        headers=_headers(),
        timeout=60,
    )
    resp.raise_for_status()
    observations = resp.json()
    return {obs["speciesCode"] for obs in observations if "speciesCode" in obs}


def compute_global_frequency() -> dict[str, float]:
    """Sample eBird regions and compute relative frequency per species."""
    species_region_count: dict[str, int] = {}
    total_regions = len(SAMPLE_REGIONS)

    for region in tqdm(SAMPLE_REGIONS, desc="Fetching recent obs by region"):
        try:
            codes = fetch_region_species(region)
            for code in codes:
                species_region_count[code] = species_region_count.get(code, 0) + 1
        except Exception as e:
            print(f"\n  WARNING: Failed to fetch {region}: {e}")
            total_regions -= 1

        # Be polite to the eBird API
        time.sleep(1.0)

    if total_regions == 0:
        print("  ERROR: All region fetches failed")
        return {}

    # Normalize: fraction of sampled regions where species was recently reported
    frequency: dict[str, float] = {}
    for code, count in species_region_count.items():
        frequency[code] = round(count / total_regions, 4)

    return frequency


def run() -> None:
    """Compute global frequency scores and upsert to Cosmos DB."""
    print("Step G: Computing global observation frequency")

    # 1. Compute frequencies from eBird
    frequency = compute_global_frequency()

    if not frequency:
        print("  No frequency data computed — skipping upsert")
        return

    # Save to data dir for inspection
    with open(OUTPUT_FILE, "w") as f:
        json.dump(frequency, f, indent=2)
    print(f"  Saved frequency data for {len(frequency)} species to {OUTPUT_FILE}")

    # 2. Load all species from Cosmos DB and upsert global_frequency
    container = get_container()
    species = load_all_species()

    updated = 0
    skipped = 0
    for bird in tqdm(species, desc="Upserting global_frequency"):
        code = bird.get("species_code", "")
        freq = frequency.get(code, 0.0)
        old_freq = bird.get("global_frequency", 0.0)

        # Only upsert if the value changed (avoids unnecessary writes)
        if abs(freq - old_freq) < 0.0001:
            skipped += 1
            continue

        bird["global_frequency"] = freq
        try:
            container.upsert_item(bird)
            updated += 1
        except Exception as e:
            print(f"\n  Error upserting {code}: {e}")

    print(f"  Updated: {updated}, Unchanged: {skipped}")

    # Print distribution summary
    scored = [f for f in frequency.values() if f > 0]
    if scored:
        avg = sum(scored) / len(scored)
        high = sum(1 for f in scored if f >= 0.5)
        medium = sum(1 for f in scored if 0.1 <= f < 0.5)
        low = sum(1 for f in scored if f < 0.1)
        print(f"\n  Frequency distribution (species with data):")
        print(f"    High (≥0.5):  {high}")
        print(f"    Medium:       {medium}")
        print(f"    Low (<0.1):   {low}")
        print(f"    Average:      {avg:.4f}")


if __name__ == "__main__":
    run()
