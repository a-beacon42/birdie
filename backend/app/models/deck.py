"""Pydantic models for saved game decks."""

import re
from typing import Literal

from pydantic import BaseModel, Field, field_validator

from app.services.difficulty_service import Difficulty

# Reject control characters (except space/tab/newline), HTML-like tags, and
# common script-injection patterns.  Only printable Unicode (letters, digits,
# punctuation, spaces) is allowed.
_CONTROL_CHARS_RE = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]")
_HTML_TAG_RE = re.compile(r"<[^>]+>", re.IGNORECASE)
_SCRIPT_PATTERN_RE = re.compile(r"(?:javascript|vbscript|data)\s*:", re.IGNORECASE)


def _sanitise_deck_name(v: str) -> str:
    """Collapse whitespace, reject control chars / HTML / script patterns."""
    v = " ".join(v.split()).strip()
    if not v:
        raise ValueError("Deck name must not be blank")
    if _CONTROL_CHARS_RE.search(v):
        raise ValueError("Deck name contains invalid control characters")
    if _HTML_TAG_RE.search(v):
        raise ValueError("Deck name must not contain HTML tags")
    if _SCRIPT_PATTERN_RE.search(v):
        raise ValueError("Deck name contains a disallowed pattern")
    return v


def _validate_species_list(v: list[str] | None) -> list[str] | None:
    """Shared species-codes validator for create and update models."""
    if v is not None:
        if len(v) > 500:
            raise ValueError("A frozen deck can contain at most 500 species")
        pattern = re.compile(r"^[a-zA-Z0-9]{1,10}$")
        for code in v:
            if not pattern.match(code):
                raise ValueError(f"Invalid species code: {code!r}")
    return v


class DeckFilters(BaseModel):
    """Stored filter parameters for a dynamic deck — mirrors the DeckRequest shape."""

    family: str | None = None
    region_code: str | None = None
    difficulty: Difficulty | None = None
    limit: int = Field(25, ge=1, le=100)


class SavedDeck(BaseModel):
    """A saved deck document stored in Cosmos DB.

    Two types:
      - **dynamic**: stores ``filters`` — regenerates a fresh deck each play.
      - **frozen**: stores ``species_codes`` — replays the exact same birds.
    """

    id: str  # UUID4
    user_id: str  # partition key — SHA-256 user ID
    name: str  # user-provided label
    deck_type: Literal["dynamic", "frozen", "lookalike"] = "dynamic"
    filters: DeckFilters | None = None  # populated for dynamic
    species_codes: list[str] | None = None  # populated for frozen / lookalike
    created_at: str  # ISO-8601
    last_played_at: str | None = None  # ISO-8601


class DeckCreateRequest(BaseModel):
    """Client payload for saving a new deck."""

    name: str = Field(min_length=1, max_length=100, description="Deck label.")
    deck_type: Literal["dynamic", "frozen", "lookalike"] = Field(
        "dynamic",
        description="'dynamic' re-generates each play; 'frozen' locks species; 'lookalike' compares similar species.",
    )
    filters: DeckFilters | None = Field(None, description="Required for dynamic decks.")
    species_codes: list[str] | None = Field(
        None, description="Required for frozen decks."
    )

    @field_validator("name")
    @classmethod
    def sanitise_name(cls, v: str) -> str:
        return _sanitise_deck_name(v)

    @field_validator("species_codes")
    @classmethod
    def validate_species_codes(cls, v: list[str] | None) -> list[str] | None:
        return _validate_species_list(v)


class DeckUpdateRequest(BaseModel):
    """Client payload for updating a saved deck."""

    name: str | None = Field(None, min_length=1, max_length=100)
    deck_type: Literal["dynamic", "frozen", "lookalike"] | None = None
    filters: DeckFilters | None = None
    species_codes: list[str] | None = None

    @field_validator("name")
    @classmethod
    def sanitise_name(cls, v: str | None) -> str | None:
        if v is not None:
            return _sanitise_deck_name(v)
        return v

    @field_validator("species_codes")
    @classmethod
    def validate_species_codes(cls, v: list[str] | None) -> list[str] | None:
        return _validate_species_list(v)


class DeckResponse(BaseModel):
    """Public representation of a saved deck."""

    id: str
    name: str
    deck_type: Literal["dynamic", "frozen", "lookalike"]
    filters: DeckFilters | None = None
    species_codes: list[str] | None = None
    created_at: str
    last_played_at: str | None = None


class DeckListResponse(BaseModel):
    """Summary for the deck listing endpoint — omits species_codes for brevity."""

    id: str
    name: str
    deck_type: Literal["dynamic", "frozen", "lookalike"]
    filters: DeckFilters | None = None
    species_count: int | None = None  # for frozen decks
    created_at: str
    last_played_at: str | None = None
