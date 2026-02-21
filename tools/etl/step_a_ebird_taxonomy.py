"""Step A — Ingest eBird taxonomy via the eBird API.

Calls GET /v2/ref/taxonomy/ebird?fmt=json to fetch the full taxonomy,
then filters to species-level entries (~10,800 rows).
"""

import json
import os

import requests
from tqdm import tqdm

from config import DATA_DIR, EBIRD_API_KEY

EBIRD_TAXONOMY_URL = "https://api.ebird.org/v2/ref/taxonomy/ebird"
OUTPUT_FILE = os.path.join(DATA_DIR, "ebird_taxonomy.json")


def fetch_taxonomy() -> list[dict]:
    """Download the full eBird taxonomy and return species-level rows."""
    print("Fetching eBird taxonomy...")
    resp = requests.get(
        EBIRD_TAXONOMY_URL,
        params={"fmt": "json"},
        headers={"X-eBirdApiToken": EBIRD_API_KEY},
        timeout=120,
    )
    resp.raise_for_status()
    all_taxa = resp.json()
    print(f"  Total taxa returned: {len(all_taxa)}")

    # Filter to species-level only
    species = [t for t in all_taxa if t.get("category") == "species"]
    print(f"  Species-level entries: {len(species)}")
    return species


def normalize_taxonomy(raw_species: list[dict]) -> list[dict]:
    """Normalize eBird taxonomy rows into our standard schema."""
    normalized: list[dict] = []
    for s in tqdm(raw_species, desc="Normalizing taxonomy"):
        normalized.append(
            {
                "id": s["speciesCode"],
                "species_code": s["speciesCode"],
                "sci_name": s["sciName"],
                "com_name": s["comName"],
                "family_code": s.get("familyCode", ""),
                "family_com_name": s.get("familyComName", ""),
                "order": s.get("order", ""),
                "sort_order": s.get("taxonOrder", 0),
                "inat_taxon_id": None,
                "images": [],
                "audio_url": "",
                "audio_attribution": "",
                "wikipedia_url": "",
                "lookalikes": [],
                "data_version": "",
            }
        )
    return normalized


def run() -> list[dict]:
    """Execute Step A and return normalized species data."""
    raw = fetch_taxonomy()
    species = normalize_taxonomy(raw)

    with open(OUTPUT_FILE, "w") as f:
        json.dump(species, f, indent=2)
    print(f"  Wrote {len(species)} species to {OUTPUT_FILE}")

    return species


if __name__ == "__main__":
    run()
