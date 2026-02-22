"""Bird data endpoints."""

from typing import Literal

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

from app.models.bird import Bird, BirdSummary, DataVersion
from app.services.bird_service import (
    get_bird_by_species_code,
    get_data_version,
    get_unique_families,
    query_birds,
)
from app.services.difficulty_service import Difficulty, build_deck
from app.services.ebird_service import get_region_frequency

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


class DeckRequest(BaseModel):
    """Request body for creating a game deck with difficulty filtering."""

    family: str | None = Field(None, description="Filter by family code")
    species_codes: list[str] | None = Field(
        None, description="Species codes to filter by (from region lookup)"
    )
    difficulty: Difficulty | None = Field(
        None, description="Difficulty tier: easy, medium, or hard"
    )
    region_code: str | None = Field(
        None,
        description="eBird region code for live regional frequency data",
    )
    limit: int = Field(25, ge=1, le=100, description="Max birds in the deck")


@router.post("/deck", response_model=list[BirdSummary])
async def create_deck(req: DeckRequest) -> list[BirdSummary]:
    """Build a shuffled game deck with optional difficulty filtering.

    Moves deck creation server-side so large species_codes lists don't
    hit URL length limits, and difficulty scoring can leverage regional
    frequency data.
    """
    # Fetch the full candidate pool (up to 500 for scoring)
    birds = query_birds(
        family_code=req.family,
        species_codes=req.species_codes,
        limit=500,
        offset=0,
    )

    if not birds:
        return []

    # Fetch regional frequency if a region is specified and difficulty is set
    regional_freq: dict[str, float] | None = None
    if req.region_code and req.difficulty:
        try:
            regional_freq = await get_region_frequency(req.region_code)
        except Exception:
            # Fall back to global frequency if eBird call fails
            regional_freq = None

    return build_deck(
        birds=birds,
        limit=req.limit,
        difficulty=req.difficulty,
        regional_freq=regional_freq,
    )


@router.get("/{species_code}", response_model=Bird)
def get_bird(species_code: str) -> Bird:
    """Get a single bird by species code."""
    bird = get_bird_by_species_code(species_code)
    if bird is None:
        raise HTTPException(status_code=404, detail="Bird not found")
    return bird
