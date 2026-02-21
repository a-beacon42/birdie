"""Step C — Fill image gaps with Wikimedia Commons.

Queries Cosmos DB for species that have no iNaturalist image, then attempts
to fetch a CC-licensed photo from Wikimedia Commons via the Wikipedia API.
Updated documents are upserted directly back to Cosmos DB.
"""

import sys
import time

import requests
from tqdm import tqdm

from config import get_container

WIKI_API = "https://en.wikipedia.org/w/api.php"


def _query_species_missing_inat_images(container) -> list[dict]:
    """Query Cosmos DB for species that have no iNaturalist image.

    Returns species where:
      - images array is empty, OR
      - images array has no entry with source == 'inaturalist'
    """
    query = (
        "SELECT * FROM c WHERE "
        "ARRAY_LENGTH(c.images) = 0 "
        "OR NOT EXISTS("
        "  SELECT VALUE i FROM i IN c.images WHERE i.source = 'inaturalist'"
        ")"
    )
    print("  Querying Cosmos DB for species missing iNaturalist images...")
    results = list(
        container.query_items(query=query, enable_cross_partition_query=True)
    )
    print(f"  Found {len(results)} species without iNaturalist images")
    return results


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


def run() -> list[dict]:
    """Fill gaps: fetch Wikimedia images for species missing iNat photos.

    Queries Cosmos DB for species without iNaturalist images, fetches a
    Wikimedia image for each, and upserts updated documents back to Cosmos.

    Returns:
        List of species dicts that were updated with Wikimedia images.
    """
    print("Step C: Filling image gaps with Wikimedia Commons")

    container = get_container()
    missing = _query_species_missing_inat_images(container)

    if not missing:
        print("  No species missing images — nothing to do")
        return []

    print(f"  Querying Wikimedia for {len(missing)} species...")
    filled = 0
    updated_species: list[dict] = []

    for bird in tqdm(missing, desc="Fetching Wikimedia images"):
        img = _fetch_wikimedia_image(bird["sci_name"])
        if img:
            # Replace any existing images list with the Wikimedia gap-fill
            bird["images"] = [img]
            try:
                container.upsert_item(bird)
                filled += 1
                updated_species.append(bird)
            except Exception as e:
                print(f"\n  Error upserting {bird.get('id', '?')}: {e}")

        # Light rate limiting — Wikimedia is generous but let's be polite
        time.sleep(0.5)

    print(f"  Filled {filled}/{len(missing)} gaps with Wikimedia images")
    return updated_species


if __name__ == "__main__":
    run()
