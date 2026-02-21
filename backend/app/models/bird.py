"""Pydantic models for bird data."""

from typing import Literal

from pydantic import BaseModel, Field, field_validator


class BirdImage(BaseModel):
    """A single image associated with a bird species."""

    url: str
    source: str = "inaturalist"  # "inaturalist" | "wikimedia"
    license: str = ""
    attribution: str = ""
    quality: str = "high"  # "high" | "medium" | "low"
    is_primary: bool = True


class Bird(BaseModel):
    """A bird species document stored in Cosmos DB."""

    id: str  # speciesCode (partition-independent unique id)
    species_code: str
    sci_name: str
    com_name: str
    family_code: str  # partition key
    family_com_name: str
    order: str = ""
    sort_order: int = 0
    inat_taxon_id: int | None = None
    images: list[BirdImage] = Field(default_factory=list)
    audio_url: str = ""
    audio_attribution: str = ""
    wikipedia_url: str = ""
    lookalikes: list[str] = Field(default_factory=list)
    data_version: str = ""

    @property
    def primary_image_url(self) -> str:
        """URL of the primary image, or empty string if none."""
        for img in self.images:
            if img.is_primary:
                return img.url
        return self.images[0].url if self.images else ""


class BirdSummary(BaseModel):
    """Lightweight bird representation for list endpoints."""

    id: str
    species_code: str
    sci_name: str
    com_name: str
    family_code: str
    family_com_name: str
    image_url: str = ""


class ChatMessage(BaseModel):
    """A single chat message with validated role and bounded content."""

    role: Literal["user", "assistant"] = Field(
        description="Message role — only user and assistant are accepted from clients"
    )
    content: str = Field(
        min_length=1,
        max_length=4000,
        description="Message text (1–4 000 chars)",
    )


class ChatRequest(BaseModel):
    """Request body for the chat proxy endpoint."""

    bird_name: str = Field(
        min_length=1,
        max_length=200,
        description="Common name of the bird being discussed",
    )
    messages: list[ChatMessage] = Field(
        min_length=1,
        max_length=20,
        description="Conversation history (max 20 messages)",
    )

    @field_validator("bird_name")
    @classmethod
    def sanitize_bird_name(cls, v: str) -> str:
        """Strip control characters and excess whitespace."""
        return " ".join(v.split())


class ChatResponse(BaseModel):
    """Response from the chat proxy endpoint."""

    role: str
    content: str


class DataVersion(BaseModel):
    """Current dataset version info."""

    version: str
    total_species: int
    image_coverage_pct: float
