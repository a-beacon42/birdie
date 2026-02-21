"""eBird region proxy endpoints — keeps the eBird API key server-side."""

from fastapi import APIRouter, HTTPException

from app.services.ebird_service import (
    get_species_list,
    get_subnational1_regions,
    get_subnational2_regions,
)

router = APIRouter(prefix="/api/regions", tags=["regions"])


@router.get("/subnational1/{country_code}")
async def subnational1(country_code: str) -> list[dict]:
    """Get states/provinces for a country code (e.g. 'US')."""
    try:
        return await get_subnational1_regions(country_code)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc))


@router.get("/subnational2/{state_code}")
async def subnational2(state_code: str) -> list[dict]:
    """Get counties/regions for a state code (e.g. 'US-NY')."""
    try:
        return await get_subnational2_regions(state_code)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc))


@router.get("/species/{region_code}")
async def species_list(region_code: str) -> list[str]:
    """Get species codes present in a region."""
    try:
        return await get_species_list(region_code)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc))
