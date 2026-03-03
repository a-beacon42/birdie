"""Cosmos DB container initialisation and index management.

Creates the ``users``, ``decks``, and ``game_sessions`` containers (if they
don't exist) with optimised indexing policies:

  - **users**: partition by ``/id`` — point-reads only, minimal indexing.
  - **decks**: partition by ``/user_id`` — composite index for listing
    (``user_id``, ``created_at DESC``).
  - **game_sessions**: partition by ``/user_id`` — composite indexes for
    time-range queries (``user_id``, ``completed_at DESC``) and per-species
    lookups (``user_id``, ``answers/species_code``).

Paths that are never queried are excluded from the index to save RU cost.

Usage:
    # Run once (CI, deploy script, or manual):
    python -m app.services.cosmos_init

    # Or called automatically at app startup (non-blocking best-effort).
"""

import logging

from azure.cosmos import PartitionKey
from azure.cosmos.database import DatabaseProxy

from app.config import settings
from app.services.cosmos import (
    BIRDS_CONTAINER,
    DECKS_CONTAINER,
    SESSIONS_CONTAINER,
    USERS_CONTAINER,
    get_database,
)

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
#  Indexing policies
# ---------------------------------------------------------------------------

# Users container — point-reads by id, rarely queried.
# Include only /id and /is_active; exclude everything else.
USERS_INDEX_POLICY = {
    "indexingMode": "consistent",
    "automatic": True,
    "includedPaths": [
        {"path": "/id/?"},
        {"path": "/is_active/?"},
    ],
    "excludedPaths": [
        {"path": "/*"},
        {"path": '/"_etag"/?'},
    ],
}

# Decks container — listed per user, sorted by created_at DESC.
DECKS_INDEX_POLICY = {
    "indexingMode": "consistent",
    "automatic": True,
    "includedPaths": [
        {"path": "/user_id/?"},
        {"path": "/created_at/?"},
        {"path": "/deck_type/?"},
        {"path": "/name/?"},
    ],
    "excludedPaths": [
        {"path": "/filters/*"},
        {"path": "/species_codes/[]"},
        {"path": '/"_etag"/?'},
    ],
    "compositeIndexes": [
        [
            {"path": "/user_id", "order": "ascending"},
            {"path": "/created_at", "order": "descending"},
        ],
    ],
}

# Game sessions container — heaviest query load: time-series, per-species stats.
SESSIONS_INDEX_POLICY = {
    "indexingMode": "consistent",
    "automatic": True,
    "includedPaths": [
        {"path": "/user_id/?"},
        {"path": "/completed_at/?"},
        {"path": "/started_at/?"},
        {"path": "/quiz_mode/?"},
        {"path": "/region_code/?"},
        {"path": "/difficulty/?"},
        {"path": "/deck_id/?"},
    ],
    "excludedPaths": [
        # Answers array is only read after the document is fetched — never
        # used in WHERE / ORDER BY at the Cosmos query level.
        {"path": "/answers/*"},
        {"path": '/"_etag"/?'},
    ],
    "compositeIndexes": [
        # Primary: list sessions newest-first (overview, trends)
        [
            {"path": "/user_id", "order": "ascending"},
            {"path": "/completed_at", "order": "descending"},
        ],
        # Secondary: time-range queries with started_at
        [
            {"path": "/user_id", "order": "ascending"},
            {"path": "/started_at", "order": "descending"},
        ],
    ],
}


# ---------------------------------------------------------------------------
#  Container definitions
# ---------------------------------------------------------------------------

_CONTAINER_DEFS: list[dict] = [
    {
        "id": USERS_CONTAINER,
        "partition_key": "/id",
        "indexing_policy": USERS_INDEX_POLICY,
    },
    {
        "id": DECKS_CONTAINER,
        "partition_key": "/user_id",
        "indexing_policy": DECKS_INDEX_POLICY,
    },
    {
        "id": SESSIONS_CONTAINER,
        "partition_key": "/user_id",
        "indexing_policy": SESSIONS_INDEX_POLICY,
    },
]


# ---------------------------------------------------------------------------
#  Public API
# ---------------------------------------------------------------------------


def ensure_containers(db: DatabaseProxy | None = None) -> list[str]:
    """Create all user-account containers if they don't exist.

    Returns the list of container IDs that were checked/created.
    Safe to call repeatedly — ``create_container_if_not_exists`` is idempotent.

    When running under managed identity (no ``COSMOS_KEY``), the SDK only has
    data-plane access and cannot create containers.  In that case we skip
    entirely — containers must already exist (created via IaC or CLI).
    """
    if not settings.cosmos_key:
        logger.info(
            "Managed-identity mode — skipping container creation "
            "(containers must already exist)"
        )
        return []

    if db is None:
        db = get_database()

    created: list[str] = []
    for defn in _CONTAINER_DEFS:
        try:
            db.create_container_if_not_exists(
                id=defn["id"],
                partition_key=PartitionKey(path=defn["partition_key"]),
                indexing_policy=defn["indexing_policy"],
            )
            created.append(defn["id"])
            logger.info(
                "Container '%s' ready (partition: %s)",
                defn["id"],
                defn["partition_key"],
            )
        except Exception as exc:
            # In production with managed identity, create may fail (data-plane only).
            # Log and continue — the container should already exist.
            logger.warning(
                "Could not create/verify container '%s': %s", defn["id"], exc
            )

    return created


def get_container_definitions() -> list[dict]:
    """Return the container definitions (useful for tests and tooling)."""
    return list(_CONTAINER_DEFS)


# ---------------------------------------------------------------------------
#  CLI entry point: python -m app.services.cosmos_init
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    logger.info("Initialising Cosmos DB containers …")
    result = ensure_containers()
    logger.info("Done — containers ready: %s", result)
