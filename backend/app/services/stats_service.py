"""Stats service — persists game sessions and computes aggregated statistics.

All game session documents live in the ``game_sessions`` Cosmos container,
partitioned by ``/user_id``.

Expensive aggregation queries are cached in-memory with a 5-minute TTL,
following the same pattern used in ``bird_service.py``.
"""

from __future__ import annotations

import logging
import threading
import time
import uuid
from collections import Counter, defaultdict
from datetime import datetime, timedelta, timezone


from app.models.session import (
    ConfusionPair,
    DifficultyStats,
    MasteryTier,
    OverviewStats,
    QuizModeStats,
    RegionalStats,
    SessionCreateRequest,
    SessionResponse,
    SpeciesMastery,
    TrendPoint,
    TrendsResponse,
)
from app.services.cosmos import get_birds_container, get_sessions_container

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
#  In-memory cache (5-minute TTL, matching bird_service pattern)
# ---------------------------------------------------------------------------
_cache_lock = threading.Lock()
_stats_cache: dict[str, tuple[float, object]] = {}  # key → (timestamp, data)
_STATS_TTL: float = 300  # 5 minutes


def _cache_get(key: str) -> object | None:
    with _cache_lock:
        entry = _stats_cache.get(key)
        if entry and (time.time() - entry[0]) < _STATS_TTL:
            return entry[1]
    return None


def _cache_set(key: str, value: object) -> None:
    with _cache_lock:
        _stats_cache[key] = (time.time(), value)


def invalidate_user_cache(user_id: str) -> None:
    """Remove all cached stats for a user (called after new session)."""
    prefix = f"stats:{user_id}:"
    with _cache_lock:
        keys_to_remove = [k for k in _stats_cache if k.startswith(prefix)]
        for k in keys_to_remove:
            del _stats_cache[k]


# ---------------------------------------------------------------------------
#  Session persistence
# ---------------------------------------------------------------------------


def create_session(user_id: str, req: SessionCreateRequest) -> SessionResponse:
    """Persist a completed game session and return a summary."""
    session_id = uuid.uuid4().hex
    doc = {
        "id": session_id,
        "user_id": user_id,
        "deck_id": req.deck_id,
        "quiz_mode": req.quiz_mode,
        "started_at": req.started_at,
        "completed_at": req.completed_at,
        "region_code": req.region_code,
        "difficulty": req.difficulty,
        "answers": [a.model_dump() for a in req.answers],
    }

    container = get_sessions_container()
    container.create_item(body=doc)
    logger.info("Session %s created for user %s", session_id[:8], user_id[:12])

    # Invalidate cached stats for this user
    invalidate_user_cache(user_id)

    correct = sum(1 for a in req.answers if a.result == "correct")
    total = len(req.answers)
    return SessionResponse(
        id=session_id,
        deck_id=req.deck_id,
        quiz_mode=req.quiz_mode,
        started_at=req.started_at,
        completed_at=req.completed_at,
        region_code=req.region_code,
        difficulty=req.difficulty,
        total_answers=total,
        correct_count=correct,
        accuracy=correct / total if total > 0 else 0.0,
    )


# ---------------------------------------------------------------------------
#  Helpers — load all sessions for a user
# ---------------------------------------------------------------------------


def _load_user_sessions(user_id: str) -> list[dict]:
    """Load all session documents for a user (cached)."""
    cache_key = f"stats:{user_id}:sessions"
    cached = _cache_get(cache_key)
    if cached is not None:
        return cached  # type: ignore[return-value]

    container = get_sessions_container()
    items = list(
        container.query_items(
            query="SELECT * FROM c WHERE c.user_id = @uid ORDER BY c.completed_at DESC",
            parameters=[{"name": "@uid", "value": user_id}],
            partition_key=user_id,
        )
    )
    _cache_set(cache_key, items)
    return items


def _flatten_answers(
    sessions: list[dict],
) -> list[tuple[dict, dict]]:
    """Flatten sessions into (session, answer) tuples."""
    result = []
    for s in sessions:
        for a in s.get("answers", []):
            result.append((s, a))
    return result


# ---------------------------------------------------------------------------
#  Mastery tiers
# ---------------------------------------------------------------------------

_MASTERY_THRESHOLDS: list[tuple[MasteryTier, int, float]] = [
    # (tier, min_attempts, min_accuracy)
    ("master", 20, 0.95),
    ("expert", 15, 0.85),
    ("familiar", 8, 0.70),
    ("novice", 3, 0.40),
]


def _compute_mastery(attempts: int, accuracy: float) -> MasteryTier:
    """Determine mastery tier from attempt count and accuracy."""
    for tier, min_att, min_acc in _MASTERY_THRESHOLDS:
        if attempts >= min_att and accuracy >= min_acc:
            return tier
    return "unfamiliar"


# ---------------------------------------------------------------------------
#  Aggregation — per-species
# ---------------------------------------------------------------------------


def get_species_stats(user_id: str) -> list[SpeciesMastery]:
    """Compute per-species mastery across all sessions."""
    cache_key = f"stats:{user_id}:species"
    cached = _cache_get(cache_key)
    if cached is not None:
        return cached  # type: ignore[return-value]

    sessions = _load_user_sessions(user_id)
    pairs = _flatten_answers(sessions)

    # Aggregate per species
    species: dict[str, dict] = defaultdict(
        lambda: {"attempts": 0, "correct": 0, "total_time": 0}
    )
    for _s, a in pairs:
        code = a["species_code"]
        species[code]["attempts"] += 1
        if a["result"] == "correct":
            species[code]["correct"] += 1
        species[code]["total_time"] += a.get("time_ms", 0)

    result = []
    for code, data in species.items():
        att = data["attempts"]
        cor = data["correct"]
        acc = cor / att if att > 0 else 0.0
        avg_t = data["total_time"] / att if att > 0 else 0.0
        result.append(
            SpeciesMastery(
                species_code=code,
                attempts=att,
                correct=cor,
                accuracy=round(acc, 4),
                avg_time_ms=round(avg_t, 1),
                mastery=_compute_mastery(att, acc),
            )
        )
    result.sort(key=lambda x: x.accuracy)
    _cache_set(cache_key, result)
    return result


def get_single_species_stats(user_id: str, species_code: str) -> SpeciesMastery | None:
    """Get stats for a single species."""
    all_stats = get_species_stats(user_id)
    for s in all_stats:
        if s.species_code == species_code:
            return s
    return None


# ---------------------------------------------------------------------------
#  Aggregation — overview
# ---------------------------------------------------------------------------


def _count_total_species() -> int:
    """Count total available species in the birds container (cached)."""
    cache_key = "global:total_species"
    cached = _cache_get(cache_key)
    if cached is not None:
        return cached  # type: ignore[return-value]

    container = get_birds_container()
    result = list(
        container.query_items(
            query="SELECT VALUE COUNT(1) FROM c",
            enable_cross_partition_query=True,
        )
    )
    count = result[0] if result else 0
    _cache_set(cache_key, count)
    return count


def get_overview(user_id: str) -> OverviewStats:
    """Compute dashboard overview stats."""
    cache_key = f"stats:{user_id}:overview"
    cached = _cache_get(cache_key)
    if cached is not None:
        return cached  # type: ignore[return-value]

    sessions = _load_user_sessions(user_id)
    pairs = _flatten_answers(sessions)

    # Life list — unique species correctly identified
    correct_species: set[str] = set()
    total_correct = 0
    total_answers = len(pairs)
    for _s, a in pairs:
        if a["result"] == "correct":
            correct_species.add(a["species_code"])
            total_correct += 1

    total_species = _count_total_species()
    # Fraction 0–1 (formatted as a percentage client-side). Keeping the same
    # unit as overall_accuracy / accuracy_delta_week so all three are consistent.
    life_list_pct = (
        (len(correct_species) / total_species) if total_species > 0 else 0.0
    )

    # Streaks
    current_streak, longest_streak = _compute_answer_streaks(pairs)
    daily_streak = _compute_daily_streak(sessions)

    # Weekly stats
    now = datetime.now(timezone.utc)
    week_ago = now - timedelta(days=7)
    two_weeks_ago = now - timedelta(days=14)

    this_week_pairs = [
        (s, a) for s, a in pairs if _parse_ts(s.get("completed_at", "")) >= week_ago
    ]
    last_week_pairs = [
        (s, a)
        for s, a in pairs
        if two_weeks_ago <= _parse_ts(s.get("completed_at", "")) < week_ago
    ]

    this_week_sessions = [
        s for s in sessions if _parse_ts(s.get("completed_at", "")) >= week_ago
    ]

    this_week_correct = sum(1 for _, a in this_week_pairs if a["result"] == "correct")
    this_week_acc = this_week_correct / len(this_week_pairs) if this_week_pairs else 0.0

    last_week_correct = sum(1 for _, a in last_week_pairs if a["result"] == "correct")
    last_week_acc = last_week_correct / len(last_week_pairs) if last_week_pairs else 0.0

    overview = OverviewStats(
        life_list_count=len(correct_species),
        total_species_available=total_species,
        life_list_pct=round(life_list_pct, 4),
        total_sessions=len(sessions),
        total_answers=total_answers,
        overall_accuracy=round(
            total_correct / total_answers if total_answers > 0 else 0.0, 4
        ),
        current_streak=current_streak,
        longest_streak=longest_streak,
        daily_practice_streak=daily_streak,
        games_this_week=len(this_week_sessions),
        accuracy_delta_week=round(this_week_acc - last_week_acc, 4),
    )
    _cache_set(cache_key, overview)
    return overview


# ---------------------------------------------------------------------------
#  Aggregation — trends
# ---------------------------------------------------------------------------


def get_trends(user_id: str, days: int = 30) -> TrendsResponse:
    """Compute time-series and breakdown stats."""
    cache_key = f"stats:{user_id}:trends:{days}"
    cached = _cache_get(cache_key)
    if cached is not None:
        return cached  # type: ignore[return-value]

    sessions = _load_user_sessions(user_id)
    pairs = _flatten_answers(sessions)
    cutoff = datetime.now(timezone.utc) - timedelta(days=days)

    # --- Daily trend points ---
    daily_data: dict[str, dict] = defaultdict(
        lambda: {"sessions": 0, "correct": 0, "total": 0, "time": 0, "species": set()}
    )
    for s in sessions:
        ts = _parse_ts(s.get("completed_at", ""))
        if ts < cutoff:
            continue
        date_str = ts.strftime("%Y-%m-%d")
        daily_data[date_str]["sessions"] += 1
        for a in s.get("answers", []):
            daily_data[date_str]["total"] += 1
            daily_data[date_str]["time"] += a.get("time_ms", 0)
            daily_data[date_str]["species"].add(a["species_code"])
            if a["result"] == "correct":
                daily_data[date_str]["correct"] += 1

    daily_points = []
    for date_str in sorted(daily_data.keys()):
        d = daily_data[date_str]
        total = d["total"]
        daily_points.append(
            TrendPoint(
                date=date_str,
                sessions=d["sessions"],
                accuracy=round(d["correct"] / total if total > 0 else 0.0, 4),
                avg_time_ms=round(d["time"] / total if total > 0 else 0.0, 1),
                species_studied=len(d["species"]),
            )
        )

    # --- By quiz mode ---
    mode_data: dict[str, dict] = defaultdict(lambda: {"attempts": 0, "correct": 0})
    for s, a in pairs:
        mode = s.get("quiz_mode", "flashcard")
        mode_data[mode]["attempts"] += 1
        if a["result"] == "correct":
            mode_data[mode]["correct"] += 1

    by_quiz_mode = [
        QuizModeStats(
            mode=mode,  # type: ignore[arg-type]
            attempts=d["attempts"],
            correct=d["correct"],
            accuracy=round(
                d["correct"] / d["attempts"] if d["attempts"] > 0 else 0.0, 4
            ),
        )
        for mode, d in sorted(mode_data.items())
    ]

    # --- By region ---
    region_data: dict[str, dict] = defaultdict(lambda: {"attempts": 0, "correct": 0})
    for s, a in pairs:
        region = s.get("region_code")
        if region:
            region_data[region]["attempts"] += 1
            if a["result"] == "correct":
                region_data[region]["correct"] += 1

    by_region = [
        RegionalStats(
            region_code=region,
            attempts=d["attempts"],
            correct=d["correct"],
            accuracy=round(
                d["correct"] / d["attempts"] if d["attempts"] > 0 else 0.0, 4
            ),
        )
        for region, d in sorted(region_data.items())
    ]

    # --- By difficulty ---
    diff_data: dict[str, dict] = defaultdict(lambda: {"attempts": 0, "correct": 0})
    for s, a in pairs:
        diff = s.get("difficulty")
        if diff:
            diff_data[diff]["attempts"] += 1
            if a["result"] == "correct":
                diff_data[diff]["correct"] += 1

    by_difficulty = [
        DifficultyStats(
            difficulty=diff,
            attempts=d["attempts"],
            correct=d["correct"],
            accuracy=round(
                d["correct"] / d["attempts"] if d["attempts"] > 0 else 0.0, 4
            ),
        )
        for diff, d in sorted(diff_data.items())
    ]

    result = TrendsResponse(
        daily=daily_points,
        by_quiz_mode=by_quiz_mode,
        by_region=by_region,
        by_difficulty=by_difficulty,
    )
    _cache_set(cache_key, result)
    return result


# ---------------------------------------------------------------------------
#  Aggregation — confusion pairs
# ---------------------------------------------------------------------------


def get_confusions(user_id: str, limit: int = 20) -> list[ConfusionPair]:
    """Find the top confusion pairs (multiple-choice mode only)."""
    cache_key = f"stats:{user_id}:confusions"
    cached = _cache_get(cache_key)
    if cached is not None:
        return cached[:limit]  # type: ignore[return-value]

    sessions = _load_user_sessions(user_id)
    pairs = _flatten_answers(sessions)

    confusion_counter: Counter[tuple[str, str]] = Counter()
    for _s, a in pairs:
        if a["result"] == "incorrect" and a.get("selected_code"):
            target = a["species_code"]
            selected = a["selected_code"]
            confusion_counter[(target, selected)] += 1

    result = [
        ConfusionPair(
            target_code=target,
            confused_with=selected,
            occurrences=count,
        )
        for (target, selected), count in confusion_counter.most_common(50)
    ]
    _cache_set(cache_key, result)
    return result[:limit]


# ---------------------------------------------------------------------------
#  Streak helpers
# ---------------------------------------------------------------------------


def _parse_ts(iso: str) -> datetime:
    """Parse an ISO-8601 timestamp, defaulting to epoch on failure."""
    try:
        dt = datetime.fromisoformat(iso)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt
    except (ValueError, TypeError):
        return datetime.min.replace(tzinfo=timezone.utc)


def _compute_answer_streaks(
    pairs: list[tuple[dict, dict]],
) -> tuple[int, int]:
    """Compute current and longest consecutive correct answer streaks.

    Pairs are ordered newest-first (from session ordering), so we reverse
    the answer list to walk chronologically.
    """
    # Build chronological list of results
    chronological: list[str] = []
    for _s, a in reversed(pairs):
        chronological.append(a["result"])

    longest = 0
    current = 0
    for result in chronological:
        if result == "correct":
            current += 1
            longest = max(longest, current)
        else:
            current = 0

    return current, longest


def _compute_daily_streak(sessions: list[dict]) -> int:
    """Compute consecutive-day practice streak ending today."""
    if not sessions:
        return 0

    # Get unique dates (UTC) with at least one session
    dates_with_games: set[str] = set()
    for s in sessions:
        ts = _parse_ts(s.get("completed_at", ""))
        dates_with_games.add(ts.strftime("%Y-%m-%d"))

    today = datetime.now(timezone.utc).date()
    streak = 0
    day = today
    while day.isoformat() in dates_with_games:
        streak += 1
        day -= timedelta(days=1)

    return streak
