"""Pydantic models for game sessions and answer records."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field, field_validator

from app.services.difficulty_service import Difficulty

QuizMode = Literal["flashcard", "multiple_choice", "audio"]
AnswerResult = Literal["correct", "incorrect", "skipped"]


class AnswerRecord(BaseModel):
    """A single answer within a game session."""

    species_code: str = Field(
        ..., min_length=1, max_length=10, description="eBird species code."
    )
    result: AnswerResult
    time_ms: int = Field(..., ge=0, le=300_000, description="Response time in ms.")
    presented_options: list[str] | None = Field(
        None,
        description="Species codes shown as choices (multiple-choice mode only).",
    )
    selected_code: str | None = Field(
        None,
        description="The species code the user selected (multiple-choice, when incorrect).",
    )

    @field_validator("species_code", "selected_code")
    @classmethod
    def validate_code_format(cls, v: str | None) -> str | None:
        if v is not None:
            import re

            if not re.match(r"^[a-zA-Z0-9]{1,10}$", v):
                raise ValueError(f"Invalid species code: {v!r}")
        return v

    @field_validator("presented_options")
    @classmethod
    def validate_presented_options(cls, v: list[str] | None) -> list[str] | None:
        if v is not None:
            if len(v) > 8:
                raise ValueError("Too many presented options (max 8)")
            import re

            pattern = re.compile(r"^[a-zA-Z0-9]{1,10}$")
            for code in v:
                if not pattern.match(code):
                    raise ValueError(f"Invalid option code: {code!r}")
        return v


class GameSession(BaseModel):
    """A completed game session document stored in Cosmos DB.

    Partition key: ``user_id``.
    """

    id: str  # UUID4
    user_id: str  # partition key — SHA-256 user ID
    deck_id: str | None = None  # null for ad-hoc games
    quiz_mode: QuizMode
    started_at: str  # ISO-8601
    completed_at: str  # ISO-8601
    region_code: str | None = None
    difficulty: Difficulty | None = None
    answers: list[AnswerRecord] = Field(default_factory=list)


class SessionCreateRequest(BaseModel):
    """Client payload for persisting a completed game session."""

    deck_id: str | None = None
    quiz_mode: QuizMode
    started_at: str = Field(..., description="ISO-8601 timestamp when game started.")
    completed_at: str = Field(..., description="ISO-8601 timestamp when game finished.")
    region_code: str | None = None
    difficulty: Difficulty | None = None
    answers: list[AnswerRecord] = Field(
        ..., min_length=1, max_length=500, description="Answer records for the session."
    )

    @field_validator("started_at", "completed_at")
    @classmethod
    def validate_iso_timestamp(cls, v: str) -> str:
        from datetime import datetime, timezone

        try:
            dt = datetime.fromisoformat(v)
            # Ensure timezone-aware
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
            return dt.isoformat()
        except (ValueError, TypeError) as exc:
            raise ValueError(f"Invalid ISO-8601 timestamp: {v!r}") from exc


class SessionResponse(BaseModel):
    """Public representation of a persisted game session."""

    id: str
    deck_id: str | None = None
    quiz_mode: QuizMode
    started_at: str
    completed_at: str
    region_code: str | None = None
    difficulty: Difficulty | None = None
    total_answers: int
    correct_count: int
    accuracy: float


# ---------------------------------------------------------------------------
#  Stat response models
# ---------------------------------------------------------------------------

MasteryTier = Literal["unfamiliar", "novice", "familiar", "expert", "master"]


class SpeciesMastery(BaseModel):
    """Per-species accuracy and mastery level."""

    species_code: str
    attempts: int
    correct: int
    accuracy: float
    avg_time_ms: float
    mastery: MasteryTier


class OverviewStats(BaseModel):
    """Dashboard summary stats."""

    life_list_count: int
    total_species_available: int
    life_list_pct: float  # fraction 0–1 of available species in the life list
    total_sessions: int
    total_answers: int
    overall_accuracy: float  # fraction 0–1
    current_streak: int  # consecutive correct
    longest_streak: int
    daily_practice_streak: int  # consecutive days with ≥1 game
    games_this_week: int
    accuracy_delta_week: float  # fraction 0–1, accuracy change vs previous week


class TrendPoint(BaseModel):
    """A single data point for time-series charts."""

    date: str  # ISO-8601 date (YYYY-MM-DD)
    sessions: int
    accuracy: float
    avg_time_ms: float
    species_studied: int


class ConfusionPair(BaseModel):
    """A pair of species the user frequently confuses."""

    target_code: str  # the correct species
    confused_with: str  # the species they selected instead
    occurrences: int


class QuizModeStats(BaseModel):
    """Accuracy breakdown by quiz mode."""

    mode: QuizMode
    attempts: int
    correct: int
    accuracy: float


class RegionalStats(BaseModel):
    """Per-region accuracy."""

    region_code: str
    attempts: int
    correct: int
    accuracy: float


class DifficultyStats(BaseModel):
    """Per-difficulty-tier accuracy."""

    difficulty: str
    attempts: int
    correct: int
    accuracy: float


class TrendsResponse(BaseModel):
    """Full trends payload for the frontend."""

    daily: list[TrendPoint]
    by_quiz_mode: list[QuizModeStats]
    by_region: list[RegionalStats]
    by_difficulty: list[DifficultyStats]
