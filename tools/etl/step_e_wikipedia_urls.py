"""Step E — Build Wikipedia URLs for each species.

Queries Cosmos DB for species missing a Wikipedia URL, constructs the URL
from the common name, and upserts updated documents back to Cosmos.
"""

from tqdm import tqdm

from config import get_container


def run() -> list[dict]:
    """Construct Wikipedia article URLs for species missing them.

    Queries Cosmos DB, builds URLs, and upserts updated documents.

    Returns:
        List of species dicts that were updated.
    """
    print("Step E: Building Wikipedia URLs")

    container = get_container()

    query = (
        "SELECT * FROM c WHERE c.wikipedia_url = '' "
        "OR NOT IS_DEFINED(c.wikipedia_url)"
    )
    print("  Querying Cosmos DB for species missing Wikipedia URLs...")
    species = list(
        container.query_items(query=query, enable_cross_partition_query=True)
    )
    print(f"  Found {len(species)} species without Wikipedia URLs")

    if not species:
        print("  Nothing to do")
        return []

    updated = 0
    for bird in tqdm(species, desc="Building Wikipedia URLs"):
        name = bird["com_name"].replace(" ", "_")
        bird["wikipedia_url"] = f"https://en.wikipedia.org/wiki/{name}"
        try:
            container.upsert_item(bird)
            updated += 1
        except Exception as e:
            print(f"\n  Error upserting {bird.get('id', '?')}: {e}")

    print(f"  Updated {updated}/{len(species)} species with Wikipedia URLs")
    return species


if __name__ == "__main__":
    run()
