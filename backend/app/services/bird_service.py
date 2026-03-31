"""Service layer for bird data operations against Cosmos DB."""

import asyncio
import logging
import threading
import time

from app.models.bird import (
    Bird,
    BirdImage,
    BirdSummary,
    DataVersion,
    LookalikeBirdSummary,
)
from app.services.cosmos import get_birds_container
from app.services.inaturalist_service import fetch_photos

# In-memory cache for families (static data — rarely changes).
_cache_lock = threading.Lock()
_families_cache: list[dict] | None = None
_families_cache_ts: float = 0.0
_FAMILIES_TTL: float = 3600  # refresh once per hour

# In-memory cache for data version (very static).
_version_cache: DataVersion | None = None
_version_cache_ts: float = 0.0
_VERSION_TTL: float = 3600  # refresh once per hour

logger = logging.getLogger(__name__)


def _unique_image_urls(images: list[dict]) -> tuple[str, list[str]]:
    """Return a primary URL plus a de-duplicated URL list in document order."""
    primary_url = ""
    image_urls: list[str] = []
    seen_urls: set[str] = set()

    for img in images:
        url = img.get("url", "")
        if not url or url in seen_urls:
            continue

        seen_urls.add(url)
        image_urls.append(url)
        if not primary_url and img.get("is_primary"):
            primary_url = url

    if not primary_url and image_urls:
        primary_url = image_urls[0]

    return primary_url, image_urls


def query_birds(
    family_code: str | None = None,
    species_codes: list[str] | None = None,
    search: str | None = None,
    limit: int = 50,
    offset: int = 0,
) -> list[BirdSummary]:
    """Query birds with optional filters, returning lightweight summaries."""
    container = get_birds_container()

    conditions: list[str] = []
    parameters: list[dict] = []

    if family_code:
        conditions.append("c.family_code = @familyCode")
        parameters.append({"name": "@familyCode", "value": family_code})

    if species_codes:
        conditions.append("ARRAY_CONTAINS(@sppCodes, c.species_code)")
        parameters.append({"name": "@sppCodes", "value": species_codes})

    if search:
        conditions.append("CONTAINS(LOWER(c.com_name), @search)")
        parameters.append({"name": "@search", "value": search.lower()})

    where_clause = (" WHERE " + " AND ".join(conditions)) if conditions else ""
    query = (
        f"SELECT c.id, c.species_code, c.sci_name, c.com_name, "
        f"c.family_code, c.family_com_name, c.images, c.wikipedia_url, "
        f"c.global_frequency, c.lookalikes "
        f"FROM c{where_clause} "
        f"ORDER BY c.sort_order "
        f"OFFSET @offset LIMIT @limit"
    )
    parameters.extend(
        [
            {"name": "@offset", "value": offset},
            {"name": "@limit", "value": limit},
        ]
    )

    # When filtering by family, use partition key for efficient single-partition query
    query_kwargs: dict = {"query": query, "parameters": parameters}
    if family_code:
        query_kwargs["partition_key"] = family_code
    else:
        query_kwargs["enable_cross_partition_query"] = True

    items = list(container.query_items(**query_kwargs))

    results: list[BirdSummary] = []
    for item in items:
        images = item.get("images", [])
        image_url = ""
        for img in images:
            if img.get("is_primary"):
                image_url = img["url"]
                break
        if not image_url and images:
            image_url = images[0]["url"]

        results.append(
            BirdSummary(
                id=item["id"],
                species_code=item["species_code"],
                sci_name=item["sci_name"],
                com_name=item["com_name"],
                family_code=item["family_code"],
                family_com_name=item["family_com_name"],
                image_url=image_url,
                wikipedia_url=item.get("wikipedia_url", ""),
                global_frequency=item.get("global_frequency", 0.0),
                lookalike_count=len(item.get("lookalikes", [])),
            )
        )
    return results


def get_bird_by_species_code(species_code: str) -> Bird | None:
    """Get a single bird by its species code."""
    container = get_birds_container()

    query = "SELECT * FROM c WHERE c.species_code = @code"
    parameters = [{"name": "@code", "value": species_code}]

    items = list(
        container.query_items(
            query=query,
            parameters=parameters,
            enable_cross_partition_query=True,
        )
    )
    if not items:
        return None
    return Bird(**items[0])


def get_unique_families() -> list[dict]:
    """Return distinct family codes and common names (cached)."""
    global _families_cache, _families_cache_ts

    now = time.monotonic()
    with _cache_lock:
        if _families_cache is not None and (now - _families_cache_ts) < _FAMILIES_TTL:
            return _families_cache

    container = get_birds_container()

    query = (
        "SELECT DISTINCT c.family_code, c.family_com_name "
        "FROM c ORDER BY c.family_com_name"
    )
    items = list(
        container.query_items(
            query=query,
            enable_cross_partition_query=True,
        )
    )

    with _cache_lock:
        _families_cache = items
        _families_cache_ts = now
    return items


def get_data_version() -> DataVersion:
    """Get metadata about the current dataset (cached)."""
    global _version_cache, _version_cache_ts

    now = time.monotonic()
    with _cache_lock:
        if _version_cache is not None and (now - _version_cache_ts) < _VERSION_TTL:
            return _version_cache

    container = get_birds_container()

    count_query = "SELECT VALUE COUNT(1) FROM c"
    total = list(
        container.query_items(query=count_query, enable_cross_partition_query=True)
    )[0]

    with_images_query = "SELECT VALUE COUNT(1) FROM c WHERE ARRAY_LENGTH(c.images) > 0"
    with_images = list(
        container.query_items(
            query=with_images_query, enable_cross_partition_query=True
        )
    )[0]

    # Get the latest data_version from any document
    version_query = (
        "SELECT TOP 1 c.data_version FROM c "
        "WHERE c.data_version != '' ORDER BY c.data_version DESC"
    )
    version_items = list(
        container.query_items(query=version_query, enable_cross_partition_query=True)
    )
    version = version_items[0]["data_version"] if version_items else "unknown"

    pct = (with_images / total * 100) if total > 0 else 0.0

    result = DataVersion(
        version=version,
        total_species=total,
        image_coverage_pct=round(pct, 1),
    )

    with _cache_lock:
        _version_cache = result
        _version_cache_ts = now

    return result


# ---------------------------------------------------------------------------
#  Lookalike helpers — multi-image enrichment
# ---------------------------------------------------------------------------


async def ensure_images(
    species_codes: list[str], min_count: int = 5
) -> dict[str, list[BirdImage]]:
    """Make sure each species has at least *min_count* images.

    For any species below the threshold whose ``inat_taxon_id`` is set,
    fetches additional CC-licensed photos from iNaturalist and appends
    them to the bird document in Cosmos DB.

    Returns a dict mapping species_code -> full images list.
    """
    container = get_birds_container()
    result: dict[str, list[BirdImage]] = {}

    # Load all requested birds in one cross-partition query
    query = "SELECT * FROM c WHERE ARRAY_CONTAINS(@codes, c.species_code)"
    params = [{"name": "@codes", "value": species_codes}]
    docs = list(
        container.query_items(
            query=query, parameters=params, enable_cross_partition_query=True
        )
    )
    doc_map = {d["species_code"]: d for d in docs}

    for code in species_codes:
        doc = doc_map.get(code)
        if not doc:
            continue

        bird = Bird(**doc)
        if len(bird.images) >= min_count or not bird.inat_taxon_id:
            result[code] = bird.images
            continue

        # Fetch more photos from iNaturalist
        needed = min_count - len(bird.images)
        existing_urls = {img.url for img in bird.images}

        new_photos = await fetch_photos(bird.inat_taxon_id, count=needed + 4)
        added = 0
        for photo in new_photos:
            if photo.url in existing_urls:
                continue
            bird.images.append(photo)
            existing_urls.add(photo.url)
            added += 1
            if added >= needed:
                break

        if added > 0:
            doc["images"] = [img.model_dump() for img in bird.images]
            container.upsert_item(body=doc)
            logger.info(
                "Enriched %s with %d iNat photos (%d total)",
                code,
                added,
                len(bird.images),
            )

        result[code] = bird.images

        # Respect iNaturalist rate limits (60 req/min)
        await asyncio.sleep(1.0)

    return result


def query_birds_with_images(species_codes: list[str]) -> list[LookalikeBirdSummary]:
    """Return bird summaries with all image URLs for lookalike mode."""
    container = get_birds_container()

    query = (
        "SELECT c.id, c.species_code, c.sci_name, c.com_name, "
        "c.family_code, c.family_com_name, c.images, c.wikipedia_url, "
        "c.global_frequency, c.lookalikes "
        "FROM c WHERE ARRAY_CONTAINS(@codes, c.species_code) "
        "ORDER BY c.sort_order"
    )
    params = [{"name": "@codes", "value": species_codes}]
    items = list(
        container.query_items(
            query=query, parameters=params, enable_cross_partition_query=True
        )
    )

    results: list[LookalikeBirdSummary] = []
    for item in items:
        images = item.get("images", [])
        image_url, image_urls = _unique_image_urls(images)

        results.append(
            LookalikeBirdSummary(
                id=item["id"],
                species_code=item["species_code"],
                sci_name=item["sci_name"],
                com_name=item["com_name"],
                family_code=item["family_code"],
                family_com_name=item["family_com_name"],
                image_url=image_url,
                image_urls=image_urls,
                wikipedia_url=item.get("wikipedia_url", ""),
                global_frequency=item.get("global_frequency", 0.0),
                lookalike_count=len(item.get("lookalikes", [])),
            )
        )
    return results
