"""Stats endpoints — session persistence and aggregated performance data.

All endpoints require an authenticated user JWT.
"""

import logging

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from slowapi import Limiter
from slowapi.util import get_remote_address

from app.dependencies.auth import AuthenticatedUser, get_current_user
from app.models.session import (
    ConfusionPair,
    OverviewStats,
    SessionCreateRequest,
    SessionResponse,
    SpeciesMastery,
    TrendsResponse,
)
from app.services.stats_service import (
    create_session,
    get_confusions,
    get_overview,
    get_single_species_stats,
    get_species_stats,
    get_trends,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/stats", tags=["stats"])
limiter = Limiter(key_func=get_remote_address)


# ---------------------------------------------------------------------------
#  POST session
# ---------------------------------------------------------------------------


@router.post("/sessions", response_model=SessionResponse, status_code=201)
@limiter.limit("60/minute")
def submit_session(
    request: Request,
    body: SessionCreateRequest,
    user: AuthenticatedUser = Depends(get_current_user),
) -> SessionResponse:
    """Persist a completed game session."""
    return create_session(user.user_id, body)


# ---------------------------------------------------------------------------
#  GET overview
# ---------------------------------------------------------------------------


@router.get("/overview", response_model=OverviewStats)
@limiter.limit("60/minute")
def overview(
    request: Request,
    user: AuthenticatedUser = Depends(get_current_user),
) -> OverviewStats:
    """Dashboard summary — life list, streaks, weekly delta."""
    return get_overview(user.user_id)


# ---------------------------------------------------------------------------
#  GET species (all)
# ---------------------------------------------------------------------------


@router.get("/species", response_model=list[SpeciesMastery])
@limiter.limit("60/minute")
def species_list(
    request: Request,
    sort: str = Query(
        "accuracy",
        description="Sort field: 'accuracy' (worst→best) or 'attempts' (most→least).",
    ),
    user: AuthenticatedUser = Depends(get_current_user),
) -> list[SpeciesMastery]:
    """All species stats, sorted for study focus (worst accuracy first by default)."""
    stats = get_species_stats(user.user_id)
    if sort == "attempts":
        stats = sorted(stats, key=lambda x: x.attempts, reverse=True)
    # default sort is by accuracy ascending (worst first) — already from service
    return stats


# ---------------------------------------------------------------------------
#  GET species/{species_code}
# ---------------------------------------------------------------------------


@router.get("/species/{species_code}", response_model=SpeciesMastery)
@limiter.limit("60/minute")
def species_detail(
    request: Request,
    species_code: str,
    user: AuthenticatedUser = Depends(get_current_user),
) -> SpeciesMastery:
    """Per-species detail — attempts, accuracy, avg time, mastery level."""
    result = get_single_species_stats(user.user_id, species_code)
    if result is None:
        raise HTTPException(status_code=404, detail="No stats for this species")
    return result


# ---------------------------------------------------------------------------
#  GET trends
# ---------------------------------------------------------------------------


@router.get("/trends", response_model=TrendsResponse)
@limiter.limit("30/minute")
def trends(
    request: Request,
    days: int = Query(30, ge=1, le=365, description="Number of days of trend data."),
    user: AuthenticatedUser = Depends(get_current_user),
) -> TrendsResponse:
    """Time-series data for charts — daily points plus breakdowns."""
    return get_trends(user.user_id, days=days)


# ---------------------------------------------------------------------------
#  GET confusions
# ---------------------------------------------------------------------------


@router.get("/confusions", response_model=list[ConfusionPair])
@limiter.limit("60/minute")
def confusions(
    request: Request,
    limit: int = Query(20, ge=1, le=100, description="Max confusion pairs to return."),
    user: AuthenticatedUser = Depends(get_current_user),
) -> list[ConfusionPair]:
    """Top confusion pairs — species frequently mixed up in multiple-choice."""
    return get_confusions(user.user_id, limit=limit)
