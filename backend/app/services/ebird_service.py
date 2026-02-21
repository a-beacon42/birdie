"""Proxy service for eBird API calls — keeps the API key server-side."""

import httpx

from app.config import settings

EBIRD_BASE = "https://api.ebird.org/v2"


def _headers() -> dict[str, str]:
    return {
        "X-eBirdApiToken": settings.ebird_api_key,
        "Content-Type": "application/json",
    }


async def get_subnational1_regions(country_code: str) -> list[dict]:
    """Get states/provinces for a country."""
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            f"{EBIRD_BASE}/ref/region/list/subnational1/{country_code}",
            headers=_headers(),
        )
        resp.raise_for_status()
        return resp.json()


async def get_subnational2_regions(state_code: str) -> list[dict]:
    """Get counties/regions for a state/province."""
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            f"{EBIRD_BASE}/ref/region/list/subnational2/{state_code}",
            headers=_headers(),
        )
        resp.raise_for_status()
        return resp.json()


async def get_species_list(region_code: str) -> list[str]:
    """Get species codes present in a region."""
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            f"{EBIRD_BASE}/product/spplist/{region_code}",
            headers=_headers(),
        )
        resp.raise_for_status()
        return resp.json()
