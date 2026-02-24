"""eBird region proxy endpoints — keeps the eBird API key server-side."""

import logging
import re

from fastapi import APIRouter, HTTPException, Path, Request
from slowapi import Limiter
from slowapi.util import get_remote_address

from app.config import settings
from app.services.ebird_service import (
    get_region_frequency,
    get_species_list,
    get_subnational1_regions,
    get_subnational2_regions,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/regions", tags=["regions"])
limiter = Limiter(key_func=get_remote_address)

# eBird region codes: 2-letter country, optional dash-separated sub-regions
# e.g. "US", "US-NY", "US-NY-109"
_REGION_RE = re.compile(r"^[A-Z]{2}(-[A-Z0-9]{1,10}){0,2}$")


def _validate_region_code(code: str, label: str = "Region code") -> str:
    """Raise 422 if the code doesn't look like a valid eBird region code."""
    if not _REGION_RE.match(code):
        raise HTTPException(
            status_code=422,
            detail=f"{label} must match pattern XX, XX-YY, or XX-YY-ZZZ (e.g. US, US-NY, US-NY-109)",
        )
    return code


@router.get("/subnational1/{country_code}")
@limiter.limit(settings.default_rate_limit)
async def subnational1(
    request: Request,
    country_code: str = Path(min_length=2, max_length=2),
) -> list[dict]:
    """Get states/provinces for a country code (e.g. 'US')."""
    _validate_region_code(country_code, "Country code")
    try:
        return await get_subnational1_regions(country_code)
    except Exception as exc:
        logger.exception("eBird subnational1 proxy error for %s", country_code)
        raise HTTPException(status_code=502, detail="Failed to fetch region data. Please try again.")


@router.get("/subnational2/{state_code}")
@limiter.limit(settings.default_rate_limit)
async def subnational2(
    request: Request,
    state_code: str = Path(min_length=4, max_length=10),
) -> list[dict]:
    """Get counties/regions for a state code (e.g. 'US-NY')."""
    _validate_region_code(state_code, "State code")
    try:
        return await get_subnational2_regions(state_code)
    except Exception as exc:
        logger.exception("eBird subnational2 proxy error for %s", state_code)
        raise HTTPException(status_code=502, detail="Failed to fetch region data. Please try again.")


@router.get("/species/{region_code}")
@limiter.limit(settings.default_rate_limit)
async def species_list(
    request: Request,
    region_code: str = Path(min_length=2, max_length=15),
) -> list[str]:
    """Get species codes present in a region."""
    _validate_region_code(region_code, "Region code")
    try:
        return await get_species_list(region_code)
    except Exception as exc:
        logger.exception("eBird species list proxy error for %s", region_code)
        raise HTTPException(status_code=502, detail="Failed to fetch species data. Please try again.")


@router.get("/frequency/{region_code}")
@limiter.limit(settings.default_rate_limit)
async def region_frequency(
    request: Request,
    region_code: str = Path(min_length=2, max_length=15),
) -> dict[str, float]:
    """Get relative observation frequency per species for a region.

    Returns a dict mapping species_code → relative frequency (0.0–1.0)
    based on recent eBird observations.  Results are cached server-side
    for ~1 hour.
    """
    _validate_region_code(region_code, "Region code")
    try:
        return await get_region_frequency(region_code)
    except Exception as exc:
        logger.exception("eBird frequency proxy error for %s", region_code)
        raise HTTPException(status_code=502, detail="Failed to fetch frequency data. Please try again.")
