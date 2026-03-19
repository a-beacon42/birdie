"""Deck service — CRUD operations for saved game decks.

All deck documents live in the ``decks`` Cosmos container, partitioned by
``/user_id`` so every operation is a single-partition read/query — efficient
and cheap on RUs.

Tier limits (``max_saved_decks`` on the user profile) are enforced server-side
at creation time.
"""

import logging
import uuid
from datetime import datetime, timezone

from azure.cosmos.exceptions import CosmosResourceNotFoundError

from app.models.deck import (
    DeckCreateRequest,
    DeckFilters,
    DeckListResponse,
    DeckResponse,
    DeckUpdateRequest,
)
from app.services.cosmos import get_decks_container, get_users_container

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
#  Helpers
# ---------------------------------------------------------------------------


def _deck_doc_to_response(doc: dict) -> DeckResponse:
    """Convert a raw Cosmos document into a DeckResponse."""
    filters = None
    if doc.get("filters"):
        filters = DeckFilters(**doc["filters"])
    return DeckResponse(
        id=doc["id"],
        name=doc["name"],
        deck_type=doc.get("deck_type", "dynamic"),
        filters=filters,
        species_codes=doc.get("species_codes"),
        created_at=doc["created_at"],
        last_played_at=doc.get("last_played_at"),
    )


def _deck_doc_to_list_item(doc: dict) -> DeckListResponse:
    """Convert a raw Cosmos document into a lightweight list item."""
    filters = None
    if doc.get("filters"):
        filters = DeckFilters(**doc["filters"])
    species_codes = doc.get("species_codes")
    return DeckListResponse(
        id=doc["id"],
        name=doc["name"],
        deck_type=doc.get("deck_type", "dynamic"),
        filters=filters,
        species_count=len(species_codes) if species_codes else None,
        created_at=doc["created_at"],
        last_played_at=doc.get("last_played_at"),
    )


def _get_user_max_decks(user_id: str) -> int:
    """Read the user's max_saved_decks from their profile."""
    try:
        user_doc = get_users_container().read_item(item=user_id, partition_key=user_id)
        return user_doc.get("max_saved_decks", 5)
    except CosmosResourceNotFoundError:
        return 5  # default for safety


# ---------------------------------------------------------------------------
#  CRUD
# ---------------------------------------------------------------------------


def create_deck(user_id: str, req: DeckCreateRequest) -> DeckResponse:
    """Create and persist a new saved deck.

    Raises ValueError if the user has reached their tier limit.
    Raises ValueError if a dynamic deck has no filters or a frozen deck has no species.
    """
    # Validate deck type requirements
    if req.deck_type == "dynamic" and not req.filters:
        raise ValueError("Dynamic decks require filters")
    if req.deck_type in ("frozen", "lookalike") and not req.species_codes:
        raise ValueError(f"{req.deck_type.capitalize()} decks require species_codes")

    container = get_decks_container()

    # Enforce tier limit
    max_decks = _get_user_max_decks(user_id)
    existing_count = list(
        container.query_items(
            query="SELECT VALUE COUNT(1) FROM c WHERE c.user_id = @uid",
            parameters=[{"name": "@uid", "value": user_id}],
            partition_key=user_id,
        )
    )[0]

    if existing_count >= max_decks:
        raise ValueError(
            f"Deck limit reached ({max_decks}). Delete a deck or upgrade your account."
        )

    now = datetime.now(timezone.utc).isoformat()
    doc = {
        "id": uuid.uuid4().hex,
        "user_id": user_id,
        "name": req.name,
        "deck_type": req.deck_type,
        "filters": req.filters.model_dump() if req.filters else None,
        "species_codes": req.species_codes,
        "created_at": now,
        "last_played_at": None,
    }

    container.create_item(body=doc)
    logger.info("Deck created: %s for user %s", doc["id"][:8], user_id[:12])
    return _deck_doc_to_response(doc)


def list_decks(user_id: str) -> list[DeckListResponse]:
    """List all saved decks for a user, newest first."""
    container = get_decks_container()
    items = list(
        container.query_items(
            query=(
                "SELECT c.id, c.name, c.deck_type, c.filters, c.species_codes, "
                "c.created_at, c.last_played_at "
                "FROM c WHERE c.user_id = @uid ORDER BY c.created_at DESC"
            ),
            parameters=[{"name": "@uid", "value": user_id}],
            partition_key=user_id,
        )
    )
    return [_deck_doc_to_list_item(item) for item in items]


def get_deck(user_id: str, deck_id: str) -> DeckResponse:
    """Fetch a single deck by ID.

    Raises ValueError if not found.
    """
    container = get_decks_container()
    try:
        doc = container.read_item(item=deck_id, partition_key=user_id)
    except CosmosResourceNotFoundError:
        raise ValueError("Deck not found")
    return _deck_doc_to_response(doc)


def update_deck(user_id: str, deck_id: str, req: DeckUpdateRequest) -> DeckResponse:
    """Update a saved deck's metadata or content.

    Raises ValueError if not found or if the update is invalid.
    """
    container = get_decks_container()
    try:
        doc = container.read_item(item=deck_id, partition_key=user_id)
    except CosmosResourceNotFoundError:
        raise ValueError("Deck not found")

    if req.name is not None:
        doc["name"] = req.name

    if req.deck_type is not None:
        doc["deck_type"] = req.deck_type

    if req.filters is not None:
        doc["filters"] = req.filters.model_dump()

    if req.species_codes is not None:
        doc["species_codes"] = req.species_codes

    # Re-validate consistency
    if doc["deck_type"] == "dynamic" and not doc.get("filters"):
        raise ValueError("Dynamic decks require filters")
    if doc["deck_type"] in ("frozen", "lookalike") and not doc.get("species_codes"):
        raise ValueError(f"{doc['deck_type'].capitalize()} decks require species_codes")

    container.upsert_item(body=doc)
    logger.info("Deck updated: %s", deck_id[:8])
    return _deck_doc_to_response(doc)


def delete_deck(user_id: str, deck_id: str) -> None:
    """Delete a saved deck.

    Raises ValueError if not found.
    """
    container = get_decks_container()
    try:
        container.read_item(item=deck_id, partition_key=user_id)
    except CosmosResourceNotFoundError:
        raise ValueError("Deck not found")

    container.delete_item(item=deck_id, partition_key=user_id)
    logger.info("Deck deleted: %s for user %s", deck_id[:8], user_id[:12])


def mark_deck_played(user_id: str, deck_id: str) -> None:
    """Update last_played_at timestamp on a deck."""
    container = get_decks_container()
    try:
        doc = container.read_item(item=deck_id, partition_key=user_id)
    except CosmosResourceNotFoundError:
        return  # silently ignore — deck may have been deleted
    doc["last_played_at"] = datetime.now(timezone.utc).isoformat()
    container.upsert_item(body=doc)
