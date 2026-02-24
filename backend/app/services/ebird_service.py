"""Proxy service for eBird API calls — keeps the API key server-side."""

import logging
import time

import httpx

from app.config import settings

logger = logging.getLogger(__name__)

EBIRD_BASE = "https://api.ebird.org/v2"

# Simple in-memory cache for regional frequency (expensive to compute)
_freq_cache: dict[str, tuple[float, dict[str, float]]] = {}
_FREQ_TTL: float = 3600  # 1 hour

# Persistent HTTP client — reused across requests for connection pooling
_client: httpx.AsyncClient | None = None


def get_http_client() -> httpx.AsyncClient:
    """Get or create a persistent async HTTP client for eBird API calls."""
    global _client
    if _client is None or _client.is_closed:
        _client = httpx.AsyncClient(
            timeout=30.0,
            limits=httpx.Limits(max_connections=20, max_keepalive_connections=10),
        )
    return _client


async def close_http_client() -> None:
    """Close the HTTP client (call during app shutdown)."""
    global _client
    if _client and not _client.is_closed:
        await _client.aclose()
        _client = None


def _headers() -> dict[str, str]:
    return {
        "X-eBirdApiToken": settings.ebird_api_key,
        "Content-Type": "application/json",
    }


async def get_subnational1_regions(country_code: str) -> list[dict]:
    """Get states/provinces for a country."""
    client = get_http_client()
    resp = await client.get(
        f"{EBIRD_BASE}/ref/region/list/subnational1/{country_code}",
        headers=_headers(),
    )
    resp.raise_for_status()
    return resp.json()


async def get_subnational2_regions(state_code: str) -> list[dict]:
    """Get counties/regions for a state/province."""
    client = get_http_client()
    resp = await client.get(
        f"{EBIRD_BASE}/ref/region/list/subnational2/{state_code}",
        headers=_headers(),
    )
    resp.raise_for_status()
    return resp.json()


async def get_species_list(region_code: str) -> list[str]:
    """Get species codes present in a region."""
    client = get_http_client()
    resp = await client.get(
        f"{EBIRD_BASE}/product/spplist/{region_code}",
        headers=_headers(),
    )
    resp.raise_for_status()
    return resp.json()


async def get_region_frequency(region_code: str) -> dict[str, float]:
    """Get relative observation frequency for species in a region.

    Calls eBird's recent observations (last 30 days) and computes a
    relative frequency score per species based on how many observations
    were reported.  The result is cached for 1 hour.

    Returns a dict mapping species_code → relative frequency (0.0–1.0)
    where 1.0 is the most-reported species in the region.
    """
    now = time.monotonic()

    # Check cache
    if region_code in _freq_cache:
        cached_at, cached_data = _freq_cache[region_code]
        if (now - cached_at) < _FREQ_TTL:
            return cached_data

    client = get_http_client()
    resp = await client.get(
        f"{EBIRD_BASE}/data/obs/{region_code}/recent",
        params={"back": 30},
        headers=_headers(),
    )
    resp.raise_for_status()
    observations = resp.json()

    # Count observations per species
    obs_count: dict[str, int] = {}
    for obs in observations:
        code = obs.get("speciesCode")
        if code:
            obs_count[code] = obs_count.get(code, 0) + obs.get("howMany", 1)

    # Normalize to 0.0–1.0 relative to the max
    max_count = max(obs_count.values()) if obs_count else 1
    frequency: dict[str, float] = {
        code: round(count / max_count, 4) for code, count in obs_count.items()
    }

    # Cache it
    _freq_cache[region_code] = (now, frequency)

    return frequency
