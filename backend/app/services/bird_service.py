"""Service layer for bird data operations against Cosmos DB."""

import time

from app.models.bird import Bird, BirdSummary, DataVersion
from app.services.cosmos import get_birds_container

# In-memory cache for families (static data — rarely changes).
_families_cache: list[dict] | None = None
_families_cache_ts: float = 0.0
_FAMILIES_TTL: float = 3600  # refresh once per hour


def query_birds(
    family_code: str | None = None,
    species_codes: list[str] | None = None,
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

    items = list(
        container.query_items(
            query=query,
            parameters=parameters,
            enable_cross_partition_query=True,
        )
    )

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

    _families_cache = items
    _families_cache_ts = now
    return items


def get_data_version() -> DataVersion:
    """Get metadata about the current dataset."""
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

    return DataVersion(
        version=version,
        total_species=total,
        image_coverage_pct=round(pct, 1),
    )
