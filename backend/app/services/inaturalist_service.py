"""On-demand photo fetching from the iNaturalist observations API.

Fetches CC-licensed, research-grade observation photos for a given taxon
and returns them as ``BirdImage`` objects ready for storage in Cosmos DB.

Follows the same persistent-client / retry / connection-pooling patterns
used in ``ebird_service.py``.
"""

import asyncio
import logging
import re
import threading

import httpx

from app.models.bird import BirdImage

logger = logging.getLogger(__name__)

INAT_BASE = "https://api.inaturalist.org/v1"

# Acceptable Creative Commons licence codes from iNaturalist
_ACCEPTED_LICENSES = {"cc0", "cc-by", "cc-by-nc", "cc-by-sa", "cc-by-nc-sa"}

# Retry settings (mirrors ebird_service)
_MAX_RETRIES = 2
_RETRY_DELAY = 1.0
_RETRYABLE_STATUS = {408, 429, 500, 502, 503, 504}

# Persistent HTTP client
_client_lock = threading.Lock()
_client: httpx.AsyncClient | None = None

# Regex to swap iNat photo size qualifiers (e.g. "square" -> "medium")
_SIZE_RE = re.compile(r"/(square|small|thumb|large|original)\.")


def get_http_client() -> httpx.AsyncClient:
    """Get or create a persistent async HTTP client for iNaturalist API."""
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


async def _get_with_retry(url: str, params: dict) -> httpx.Response:
    """GET with exponential backoff on transient failures."""
    client = get_http_client()
    last_exc: Exception | None = None
    for attempt in range(_MAX_RETRIES + 1):
        try:
            resp = await client.get(url, params=params)
            if resp.status_code in _RETRYABLE_STATUS and attempt < _MAX_RETRIES:
                delay = _RETRY_DELAY * (2**attempt)
                logger.warning(
                    "iNat API returned %s, retrying in %.1fs (attempt %d/%d)",
                    resp.status_code,
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
                    "iNat API connection error, retrying in %.1fs (attempt %d/%d): %s",
                    delay,
                    attempt + 1,
                    _MAX_RETRIES,
                    exc,
                )
                await asyncio.sleep(delay)
            else:
                raise
    raise last_exc or RuntimeError("Retries exhausted")


def _to_medium_url(url: str) -> str:
    """Convert an iNaturalist photo URL to medium size (max 500px)."""
    return _SIZE_RE.sub("/medium.", url)


async def fetch_photos(inat_taxon_id: int, count: int = 8) -> list[BirdImage]:
    """Fetch CC-licensed research-grade photos for a taxon from iNaturalist.

    Returns up to *count* ``BirdImage`` objects.  Logs and returns partial
    results on network errors — never raises to the caller.
    """
    params = {
        "taxon_id": inat_taxon_id,
        "quality_grade": "research",
        "photos": "true",
        "photo_licensed": "true",
        "order_by": "votes",
        "per_page": count * 2,  # fetch extra to allow for filtering
    }

    try:
        resp = await _get_with_retry(f"{INAT_BASE}/observations", params=params)
    except Exception:
        logger.exception("iNat photo fetch failed for taxon %s", inat_taxon_id)
        return []

    data = resp.json()
    results: list[BirdImage] = []
    seen_urls: set[str] = set()

    for obs in data.get("results", []):
        for op in obs.get("observation_photos", []):
            photo = op.get("photo", {})
            license_code = (photo.get("license_code") or "").lower()
            if license_code not in _ACCEPTED_LICENSES:
                continue

            raw_url = photo.get("url", "")
            if not raw_url:
                continue

            url = _to_medium_url(raw_url)
            if url in seen_urls:
                continue
            seen_urls.add(url)

            attribution = photo.get("attribution", "")
            results.append(
                BirdImage(
                    url=url,
                    source="inaturalist",
                    license=license_code,
                    attribution=attribution,
                    quality="high",
                    is_primary=False,
                )
            )

            if len(results) >= count:
                return results

    return results
