"""Saved deck endpoints — CRUD + play from saved configuration.

All endpoints require an authenticated user JWT.
Tier limits (max saved decks) are enforced server-side by the deck service.
"""

import asyncio
import logging

from fastapi import APIRouter, Depends, HTTPException, Request
from slowapi import Limiter
from slowapi.util import get_remote_address

from app.dependencies.auth import AuthenticatedUser, get_current_user
from app.models.bird import BirdSummary
from app.models.deck import (
    DeckCreateRequest,
    DeckListResponse,
    DeckResponse,
    DeckUpdateRequest,
)
from app.services.bird_service import query_birds
from app.services.deck_service import (
    create_deck,
    delete_deck,
    get_deck,
    list_decks,
    mark_deck_played,
    update_deck,
)
from app.services.difficulty_service import build_deck
from app.services.ebird_service import get_region_frequency

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/decks", tags=["decks"])
limiter = Limiter(key_func=get_remote_address)


# ---------------------------------------------------------------------------
#  CREATE
# ---------------------------------------------------------------------------


@router.post("", response_model=DeckResponse, status_code=201)
@limiter.limit("30/minute")
def create(
    request: Request,
    body: DeckCreateRequest,
    user: AuthenticatedUser = Depends(get_current_user),
) -> DeckResponse:
    """Save a new deck. Enforces per-tier deck limit."""
    try:
        return create_deck(user.user_id, body)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


# ---------------------------------------------------------------------------
#  LIST
# ---------------------------------------------------------------------------


@router.get("", response_model=list[DeckListResponse])
@limiter.limit("60/minute")
def list_all(
    request: Request,
    user: AuthenticatedUser = Depends(get_current_user),
) -> list[DeckListResponse]:
    """List all saved decks for the current user."""
    return list_decks(user.user_id)


# ---------------------------------------------------------------------------
#  GET single
# ---------------------------------------------------------------------------


@router.get("/{deck_id}", response_model=DeckResponse)
@limiter.limit("60/minute")
def get_one(
    request: Request,
    deck_id: str,
    user: AuthenticatedUser = Depends(get_current_user),
) -> DeckResponse:
    """Get a single saved deck by ID."""
    try:
        return get_deck(user.user_id, deck_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))


# ---------------------------------------------------------------------------
#  UPDATE
# ---------------------------------------------------------------------------


@router.put("/{deck_id}", response_model=DeckResponse)
@limiter.limit("30/minute")
def update(
    request: Request,
    deck_id: str,
    body: DeckUpdateRequest,
    user: AuthenticatedUser = Depends(get_current_user),
) -> DeckResponse:
    """Update a saved deck (rename, change type, update filters/species)."""
    try:
        return update_deck(user.user_id, deck_id, body)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


# ---------------------------------------------------------------------------
#  DELETE
# ---------------------------------------------------------------------------


@router.delete("/{deck_id}", status_code=204)
@limiter.limit("30/minute")
def delete(
    request: Request,
    deck_id: str,
    user: AuthenticatedUser = Depends(get_current_user),
) -> None:
    """Delete a saved deck."""
    try:
        delete_deck(user.user_id, deck_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))


# ---------------------------------------------------------------------------
#  PLAY from saved deck
# ---------------------------------------------------------------------------


@router.post("/{deck_id}/play", response_model=list[BirdSummary])
@limiter.limit("60/minute")
async def play(
    request: Request,
    deck_id: str,
    user: AuthenticatedUser = Depends(get_current_user),
) -> list[BirdSummary]:
    """Generate a playable deck from a saved configuration.

    - **Dynamic decks**: re-runs the stored filters against the current bird data,
      returning a fresh shuffled deck each time.
    - **Frozen decks**: fetches the exact stored species, shuffled.

    Updates ``last_played_at`` on the deck.
    """
    try:
        deck = get_deck(user.user_id, deck_id)
    except ValueError:
        raise HTTPException(status_code=404, detail="Deck not found")

    loop = asyncio.get_event_loop()

    if deck.deck_type == "frozen" and deck.species_codes:
        # Frozen: fetch exact species by code
        birds = await loop.run_in_executor(
            None,
            lambda: query_birds(
                species_codes=deck.species_codes,
                limit=len(deck.species_codes),  # type: ignore
                offset=0,
            ),
        )
        import random

        random.shuffle(birds)
    elif deck.deck_type == "dynamic" and deck.filters:
        # Dynamic: re-query with stored filters
        f = deck.filters
        birds = await loop.run_in_executor(
            None,
            lambda: query_birds(
                family_code=f.family,
                limit=500,  # get full pool for difficulty filtering
                offset=0,
            ),
        )

        # Fetch regional frequency if region + difficulty specified
        regional_freq: dict[str, float] | None = None
        if f.region_code and f.difficulty:
            try:
                regional_freq = await get_region_frequency(f.region_code)
            except Exception:
                logger.warning("eBird frequency fetch failed for %s", f.region_code)

        birds = build_deck(
            birds=birds,
            limit=f.limit,
            difficulty=f.difficulty,
            regional_freq=regional_freq,
        )
    else:
        raise HTTPException(
            status_code=400,
            detail="Deck is misconfigured — missing filters or species_codes",
        )

    # Update last_played_at in the background
    await loop.run_in_executor(None, lambda: mark_deck_played(user.user_id, deck_id))

    return birds
