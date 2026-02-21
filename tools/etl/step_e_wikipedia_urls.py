"""Step E — Build Wikipedia URLs for each species."""

import json
import os

from tqdm import tqdm

from config import DATA_DIR


def run(species: list[dict]) -> list[dict]:
    """Construct Wikipedia article URLs from common names.

    Args:
        species: Output from Step D.

    Returns:
        Updated species list with wikipedia_url populated.
    """
    print("Step E: Building Wikipedia URLs")

    for bird in tqdm(species, desc="Building Wikipedia URLs"):
        if not bird.get("wikipedia_url"):
            name = bird["com_name"].replace(" ", "_")
            bird["wikipedia_url"] = f"https://en.wikipedia.org/wiki/{name}"

    output_file = os.path.join(DATA_DIR, "species_complete.json")
    with open(output_file, "w") as f:
        json.dump(species, f, indent=2)
    print(f"  Wrote complete data to {output_file}")

    return species


if __name__ == "__main__":
    input_file = os.path.join(DATA_DIR, "species_with_audio.json")
    with open(input_file) as f:
        species = json.load(f)
    run(species)
