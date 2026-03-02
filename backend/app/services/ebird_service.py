"""Proxy service for eBird API calls — keeps the API key server-side."""

import asyncio
import logging
import threading
import time

import httpx

from app.config import settings

logger = logging.getLogger(__name__)

EBIRD_BASE = "https://api.ebird.org/v2"

# Retry settings
_MAX_RETRIES = 2
_RETRY_DELAY = 1.0  # seconds (doubles each retry)
_RETRYABLE_STATUS = {408, 429, 500, 502, 503, 504}

# Simple in-memory cache for regional frequency (expensive to compute)
_freq_cache: dict[str, tuple[float, dict[str, float]]] = {}
_FREQ_TTL: float = 3600  # 1 hour

# Persistent HTTP client — reused across requests for connection pooling
_client_lock = threading.Lock()
_client: httpx.AsyncClient | None = None


def get_http_client() -> httpx.AsyncClient:
    """Get or create a persistent async HTTP client for eBird API calls."""
    global _client
    if _client is None or _client.is_closed:
        with _client_lock:
            if _client is None or _client.is_closed:
                _client = httpx.AsyncClient(
                    timeout=30.0,
                    limits=httpx.Limits(
                        max_connections=20, max_keepalive_connections=10
                    ),
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


async def _get_with_retry(url: str, **kwargs) -> httpx.Response:
    """GET with exponential backoff retry on transient failures."""
    client = get_http_client()
    last_exc: Exception | None = None
    for attempt in range(_MAX_RETRIES + 1):
        try:
            resp = await client.get(url, headers=_headers(), **kwargs)
            if resp.status_code in _RETRYABLE_STATUS and attempt < _MAX_RETRIES:
                delay = _RETRY_DELAY * (2**attempt)
                logger.warning(
                    "eBird API returned %s for %s, retrying in %.1fs (attempt %d/%d)",
                    resp.status_code,
                    url,
                    delay,
                    attempt + 1,
                    _MAX_RETRIES,
                )
                await asyncio.sleep(delay)
                continue
            resp.raise_for_status()
            return resp
        except httpx.HTTPStatusError:
            raise
        except (httpx.ConnectError, httpx.ReadTimeout, httpx.WriteTimeout) as exc:
            last_exc = exc
            if attempt < _MAX_RETRIES:
                delay = _RETRY_DELAY * (2**attempt)
                logger.warning(
                    "eBird API connection error for %s, retrying in %.1fs (attempt %d/%d): %s",
                    url,
                    delay,
                    attempt + 1,
                    _MAX_RETRIES,
                    exc,
                )
                await asyncio.sleep(delay)
            else:
                raise
    raise last_exc or RuntimeError("Retries exhausted")


async def get_subnational1_regions(country_code: str) -> list[dict]:
    """Get states/provinces for a country."""
    resp = await _get_with_retry(
        f"{EBIRD_BASE}/ref/region/list/subnational1/{country_code}",
    )
    return resp.json()


async def get_subnational2_regions(state_code: str) -> list[dict]:
    """Get counties/regions for a state/province."""
    resp = await _get_with_retry(
        f"{EBIRD_BASE}/ref/region/list/subnational2/{state_code}",
    )
    return resp.json()


async def get_species_list(region_code: str) -> list[str]:
    """Get species codes present in a region."""
    resp = await _get_with_retry(
        f"{EBIRD_BASE}/product/spplist/{region_code}",
    )
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

    resp = await _get_with_retry(
        f"{EBIRD_BASE}/data/obs/{region_code}/recent",
        params={"back": 30},
    )
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
