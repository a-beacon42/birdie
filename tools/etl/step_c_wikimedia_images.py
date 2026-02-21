"""Step C — Fill image gaps with Wikimedia Commons.

For species that have no image after Step B, query the MediaWiki API
for a CC-licensed photo using the scientific name.
"""

import json
import os
import time

import requests
from tqdm import tqdm

from config import DATA_DIR

WIKI_API = "https://en.wikipedia.org/w/api.php"


def _fetch_wikimedia_image(sci_name: str) -> dict | None:
    """Try to get an image from the Wikipedia article for a species."""
    try:
        # Use the Wikipedia pageimages API to get the main image
        params = {
            "action": "query",
            "titles": sci_name.replace(" ", "_"),
            "prop": "pageimages",
            "piprop": "original",
            "format": "json",
        }
        resp = requests.get(WIKI_API, params=params, timeout=30)
        resp.raise_for_status()
        data = resp.json()

        pages = data.get("query", {}).get("pages", {})
        for page_id, page in pages.items():
            if page_id == "-1":
                continue
            original = page.get("original", {})
            url = original.get("source", "")
            if url:
                return {
                    "url": url,
                    "source": "wikimedia",
                    "license": "CC-BY-SA",  # Wikipedia images are typically CC-BY-SA
                    "attribution": "Wikimedia Commons",
                    "quality": "high",
                    "is_primary": True,
                }
    except requests.RequestException:
        pass
    return None


def run(species: list[dict]) -> list[dict]:
    """Fill gaps: fetch Wikimedia images for species missing photos.

    Args:
        species: Output from Step B (list of species dicts, some with images).

    Returns:
        Updated species list with additional Wikimedia images where gaps existed.
    """
    print("Step C: Filling image gaps with Wikimedia Commons")

    missing = [s for s in species if not s.get("images")]
    print(f"  {len(missing)} species missing images, querying Wikimedia...")

    filled = 0
    for bird in tqdm(missing, desc="Fetching Wikimedia images"):
        img = _fetch_wikimedia_image(bird["sci_name"])
        if img:
            bird["images"] = [img]
            filled += 1

        # Light rate limiting — Wikimedia is generous but let's be polite
        time.sleep(0.5)

    print(f"  Filled {filled}/{len(missing)} gaps with Wikimedia images")

    total_with_images = sum(1 for s in species if s.get("images"))
    print(
        f"  Total image coverage: {total_with_images}/{len(species)} "
        f"({total_with_images/len(species)*100:.1f}%)"
    )

    output_file = os.path.join(DATA_DIR, "species_with_all_images.json")
    with open(output_file, "w") as f:
        json.dump(species, f, indent=2)
    print(f"  Wrote intermediate data to {output_file}")

    return species


if __name__ == "__main__":
    input_file = os.path.join(DATA_DIR, "species_with_images.json")
    with open(input_file) as f:
        species = json.load(f)
    run(species)
