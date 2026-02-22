"""eBird region proxy endpoints — keeps the eBird API key server-side."""

import re

from fastapi import APIRouter, HTTPException, Path

from app.services.ebird_service import (
    get_region_frequency,
    get_species_list,
    get_subnational1_regions,
    get_subnational2_regions,
)

router = APIRouter(prefix="/api/regions", tags=["regions"])

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
async def subnational1(
    country_code: str = Path(min_length=2, max_length=2),
) -> list[dict]:
    """Get states/provinces for a country code (e.g. 'US')."""
    _validate_region_code(country_code, "Country code")
    try:
        return await get_subnational1_regions(country_code)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc))


@router.get("/subnational2/{state_code}")
async def subnational2(
    state_code: str = Path(min_length=4, max_length=10),
) -> list[dict]:
    """Get counties/regions for a state code (e.g. 'US-NY')."""
    _validate_region_code(state_code, "State code")
    try:
        return await get_subnational2_regions(state_code)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc))


@router.get("/species/{region_code}")
async def species_list(
    region_code: str = Path(min_length=2, max_length=15),
) -> list[str]:
    """Get species codes present in a region."""
    _validate_region_code(region_code, "Region code")
    try:
        return await get_species_list(region_code)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc))


@router.get("/frequency/{region_code}")
async def region_frequency(
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
        raise HTTPException(status_code=502, detail=str(exc))
