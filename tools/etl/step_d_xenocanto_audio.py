"""Step D — Fetch audio recordings from Xeno-canto.

Queries Cosmos DB for species missing audio, fetches the top-rated recording
(quality A) from Xeno-canto, and upserts updated documents back to Cosmos.
"""

import json
import os
import time

import requests
from tqdm import tqdm

from config import DATA_DIR, get_container

XENO_CANTO_API = "https://xeno-canto.org/api/2/recordings"


def _fetch_audio(sci_name: str) -> tuple[str, str, str] | None:
    """Get the best Xeno-canto recording for a species.

    Returns (url, attribution, license) or None.
    """
    try:
        # Query for quality A (best) recordings
        query = f"{sci_name} q:A"
        resp = requests.get(
            XENO_CANTO_API,
            params={"query": query},
            timeout=30,
        )
        resp.raise_for_status()
        data = resp.json()

        recordings = data.get("recordings", [])
        if not recordings:
            # Fall back to any quality
            resp = requests.get(
                XENO_CANTO_API,
                params={"query": sci_name},
                timeout=30,
            )
            resp.raise_for_status()
            recordings = resp.json().get("recordings", [])

        if recordings:
            rec = recordings[0]
            # Xeno-canto file URL
            file_url = rec.get("file", "")
            if file_url and not file_url.startswith("http"):
                file_url = "https:" + file_url
            recordist = rec.get("rec", "Unknown")
            lic = rec.get("lic", "")
            attribution = f"{recordist} (Xeno-canto, {lic})"
            return file_url, attribution, lic

    except requests.RequestException:
        pass
    return None


def run() -> list[dict]:
    """Fetch Xeno-canto audio for species missing audio.

    Queries Cosmos DB for species without audio_url, fetches recordings from
    Xeno-canto, and upserts updated documents back to Cosmos.

    Returns:
        List of species dicts that were updated with audio.
    """
    print("Step D: Fetching audio from Xeno-canto")

    container = get_container()

    # Query for species missing audio
    query = "SELECT * FROM c WHERE c.audio_url = '' OR NOT IS_DEFINED(c.audio_url)"
    print("  Querying Cosmos DB for species missing audio...")
    species = list(
        container.query_items(query=query, enable_cross_partition_query=True)
    )
    print(f"  Found {len(species)} species without audio")

    progress_file = os.path.join(DATA_DIR, "xc_audio_progress.json")
    processed: set[str] = set()

    if os.path.exists(progress_file):
        with open(progress_file) as f:
            processed = set(json.load(f))
        print(f"  Resuming from {len(processed)} previously processed species")

    to_process = [s for s in species if s["species_code"] not in processed]
    print(f"  Fetching audio for {len(to_process)} species...")

    found = 0
    updated_species: list[dict] = []
    for i, bird in enumerate(tqdm(to_process, desc="Fetching Xeno-canto audio")):
        result = _fetch_audio(bird["sci_name"])
        if result:
            url, attribution, lic = result
            bird["audio_url"] = url
            bird["audio_attribution"] = attribution
            try:
                container.upsert_item(bird)
                found += 1
                updated_species.append(bird)
            except Exception as e:
                print(f"\n  Error upserting {bird.get('id', '?')}: {e}")

        processed.add(bird["species_code"])
        time.sleep(1.0)  # Rate limiting

        if (i + 1) % 100 == 0:
            with open(progress_file, "w") as f:
                json.dump(list(processed), f)

    with open(progress_file, "w") as f:
        json.dump(list(processed), f)

    print(f"  Added audio to {found}/{len(to_process)} species")
    return updated_species


if __name__ == "__main__":
    run()
