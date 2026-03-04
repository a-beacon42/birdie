"""Bird data endpoints."""

import logging
import re

from fastapi import APIRouter, HTTPException, Path, Query, Request
from pydantic import BaseModel, Field, field_validator
from slowapi import Limiter
from slowapi.util import get_remote_address

from app.config import settings
from app.models.bird import Bird, BirdSummary, DataVersion, FamilySummary
from app.services.bird_service import (
    get_bird_by_species_code,
    get_data_version,
    get_unique_families,
    query_birds,
)
from app.services.difficulty_service import Difficulty, build_deck
from app.services.ebird_service import get_region_frequency, get_species_list

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/birds", tags=["birds"])
limiter = Limiter(key_func=get_remote_address)

# eBird species codes: 1-10 lowercase alphanumeric chars (e.g. "norcar", "baleag1")
_SPECIES_CODE_RE = re.compile(r"^[a-z0-9]{1,10}$", re.IGNORECASE)
# eBird region codes: 2-letter country, optional dash-separated sub-regions
_REGION_RE = re.compile(r"^[A-Z]{2}(-[A-Z0-9]{1,10}){0,2}$")
# Family codes: letters + optional trailing digits (e.g. "Accipitridae", "corvid1")
_FAMILY_RE = re.compile(r"^[A-Za-z]{2,29}[A-Za-z0-9]$")


@router.get("", response_model=list[BirdSummary])
@limiter.limit(settings.default_rate_limit)
def list_birds(
    request: Request,
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


@router.get("/families", response_model=list[FamilySummary])
@limiter.limit(settings.default_rate_limit)
def list_families(request: Request) -> list[dict]:
    """Return all unique bird families."""
    return get_unique_families()


@router.get("/version", response_model=DataVersion)
@limiter.limit(settings.default_rate_limit)
def data_version(request: Request) -> DataVersion:
    """Return metadata about the current bird dataset."""
    return get_data_version()


class DeckRequest(BaseModel):
    """Request body for creating a game deck with difficulty filtering."""

    family: str | None = Field(None, max_length=30, description="Filter by family code")
    species_codes: list[str] | None = Field(
        None,
        max_length=2000,
        description="Species codes to filter by (from region lookup)",
    )
    difficulty: Difficulty | None = Field(
        None, description="Difficulty tier: easy, medium, or hard"
    )
    region_code: str | None = Field(
        None,
        max_length=15,
        description="eBird region code for live regional frequency data",
    )
    limit: int = Field(25, ge=1, le=100, description="Max birds in the deck")

    @field_validator("family")
    @classmethod
    def validate_family(cls, v: str | None) -> str | None:
        if v is not None and not _FAMILY_RE.match(v):
            raise ValueError("family must be 2-30 letters (e.g. 'Accipitridae')")
        return v

    @field_validator("species_codes")
    @classmethod
    def validate_species_codes(cls, v: list[str] | None) -> list[str] | None:
        if v is not None:
            for code in v:
                if not _SPECIES_CODE_RE.match(code):
                    raise ValueError(f"Invalid species code: {code!r}")
        return v

    @field_validator("region_code")
    @classmethod
    def validate_region_code(cls, v: str | None) -> str | None:
        if v is not None and not _REGION_RE.match(v):
            raise ValueError("region_code must match XX, XX-YY, or XX-YY-ZZZ")
        return v


@router.post("/deck", response_model=list[BirdSummary])
@limiter.limit(settings.default_rate_limit)
async def create_deck(request: Request, req: DeckRequest) -> list[BirdSummary]:
    """Build a shuffled game deck with optional difficulty filtering.

    Moves deck creation server-side so large species_codes lists don't
    hit URL length limits, and difficulty scoring can leverage regional
    frequency data.

    Note: query_birds() uses the synchronous Cosmos SDK which runs in
    FastAPI's threadpool via run_in_executor when called from async context.
    The eBird call is genuinely async.
    """
    import asyncio

    # If region_code is provided but species_codes isn't, fetch species
    # list server-side so clients don't need to send huge payloads.
    species_codes = req.species_codes
    if not species_codes and req.region_code:
        try:
            species_codes = await get_species_list(req.region_code)
        except Exception:
            logger.warning(
                "eBird species list fetch failed for %s", req.region_code
            )

    # Run sync Cosmos query in threadpool to avoid blocking the event loop
    loop = asyncio.get_event_loop()
    birds = await loop.run_in_executor(
        None,
        lambda: query_birds(
            family_code=req.family,
            species_codes=species_codes,
            limit=500,
            offset=0,
        ),
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
            logger.warning(
                "eBird frequency fetch failed for %s, falling back to global",
                req.region_code,
            )
            regional_freq = None

    return build_deck(
        birds=birds,
        limit=req.limit,
        difficulty=req.difficulty,
        regional_freq=regional_freq,
    )


@router.get("/{species_code}", response_model=Bird)
@limiter.limit(settings.default_rate_limit)
def get_bird(
    request: Request,
    species_code: str = Path(min_length=1, max_length=10, pattern=r"^[a-zA-Z0-9]+$"),
) -> Bird:
    """Get a single bird by species code."""
    bird = get_bird_by_species_code(species_code)
    if bird is None:
        raise HTTPException(status_code=404, detail="Bird not found")
    return bird
