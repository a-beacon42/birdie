"""Bird data endpoints."""

from fastapi import APIRouter, HTTPException, Query

from app.models.bird import Bird, BirdSummary, DataVersion
from app.services.bird_service import (
    get_bird_by_species_code,
    get_data_version,
    get_unique_families,
    query_birds,
)

router = APIRouter(prefix="/api/birds", tags=["birds"])


@router.get("", response_model=list[BirdSummary])
def list_birds(
    family: str | None = Query(None, description="Filter by family code"),
    species_codes: str | None = Query(
        None, description="Comma-separated species codes to filter by"
    ),
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
) -> list[BirdSummary]:
    """List birds with optional filters."""
    codes = (
        [c.strip() for c in species_codes.split(",") if c.strip()]
        if species_codes
        else None
    )
    return query_birds(
        family_code=family,
        species_codes=codes,
        limit=limit,
        offset=offset,
    )


@router.get("/families")
def list_families() -> list[dict]:
    """Return all unique bird families."""
    return get_unique_families()


@router.get("/version", response_model=DataVersion)
def data_version() -> DataVersion:
    """Return metadata about the current bird dataset."""
    return get_data_version()


@router.get("/{species_code}", response_model=Bird)
def get_bird(species_code: str) -> Bird:
    """Get a single bird by species code."""
    bird = get_bird_by_species_code(species_code)
    if bird is None:
        raise HTTPException(status_code=404, detail="Bird not found")
    return bird
