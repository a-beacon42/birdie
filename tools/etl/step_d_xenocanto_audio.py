"""Step D — Fetch audio recordings from Xeno-canto.

For each species, query the Xeno-canto API for the top-rated recording
(quality A) and store the URL + attribution.
"""

import json
import os
import time

import requests
from tqdm import tqdm

from config import DATA_DIR

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


def run(species: list[dict]) -> list[dict]:
    """Fetch Xeno-canto audio for all species.

    Args:
        species: Output from Step C (list of species dicts).

    Returns:
        Updated species list with audio_url and audio_attribution populated.
    """
    print("Step D: Fetching audio from Xeno-canto")

    progress_file = os.path.join(DATA_DIR, "xc_audio_progress.json")
    processed: set[str] = set()

    if os.path.exists(progress_file):
        with open(progress_file) as f:
            processed = set(json.load(f))
        print(f"  Resuming from {len(processed)} previously processed species")

    to_process = [
        s
        for s in species
        if s["species_code"] not in processed and not s.get("audio_url")
    ]

    print(f"  Fetching audio for {len(to_process)} species...")

    found = 0
    for i, bird in enumerate(tqdm(to_process, desc="Fetching Xeno-canto audio")):
        result = _fetch_audio(bird["sci_name"])
        if result:
            url, attribution, lic = result
            bird["audio_url"] = url
            bird["audio_attribution"] = attribution
            found += 1

        processed.add(bird["species_code"])
        time.sleep(1.0)  # Rate limiting

        if (i + 1) % 100 == 0:
            with open(progress_file, "w") as f:
                json.dump(list(processed), f)

    with open(progress_file, "w") as f:
        json.dump(list(processed), f)

    total_with_audio = sum(1 for s in species if s.get("audio_url"))
    print(
        f"  Audio coverage: {total_with_audio}/{len(species)} "
        f"({total_with_audio/len(species)*100:.1f}%)"
    )

    output_file = os.path.join(DATA_DIR, "species_with_audio.json")
    with open(output_file, "w") as f:
        json.dump(species, f, indent=2)
    print(f"  Wrote intermediate data to {output_file}")

    return species


if __name__ == "__main__":
    input_file = os.path.join(DATA_DIR, "species_with_all_images.json")
    with open(input_file) as f:
        species = json.load(f)
    run(species)
