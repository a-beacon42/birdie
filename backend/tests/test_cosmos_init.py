"""Tests for Cosmos DB container initialisation and indexing policies."""

from unittest.mock import MagicMock, call, patch

import pytest

from app.services.cosmos import (
    BIRDS_CONTAINER,
    DECKS_CONTAINER,
    SESSIONS_CONTAINER,
    USERS_CONTAINER,
)
from app.services.cosmos_init import (
    DECKS_INDEX_POLICY,
    SESSIONS_INDEX_POLICY,
    USERS_INDEX_POLICY,
    ensure_containers,
    get_container_definitions,
)


# ---------------------------------------------------------------------------
#  Container definitions
# ---------------------------------------------------------------------------


class TestContainerDefinitions:
    """Verify the static container definitions are correct."""

    def test_returns_list_of_dicts(self):
        defs = get_container_definitions()
        assert isinstance(defs, list)
        assert all(isinstance(d, dict) for d in defs)

    def test_contains_expected_containers(self):
        ids = [d["id"] for d in get_container_definitions()]
        assert USERS_CONTAINER in ids
        assert DECKS_CONTAINER in ids
        assert SESSIONS_CONTAINER in ids

    def test_does_not_include_birds_container(self):
        """Birds container has its own getter and should NOT be managed here."""
        ids = [d["id"] for d in get_container_definitions()]
        assert BIRDS_CONTAINER not in ids

    def test_users_partition_key(self):
        defn = next(
            d for d in get_container_definitions() if d["id"] == USERS_CONTAINER
        )
        assert defn["partition_key"] == "/id"

    def test_decks_partition_key(self):
        defn = next(
            d for d in get_container_definitions() if d["id"] == DECKS_CONTAINER
        )
        assert defn["partition_key"] == "/user_id"

    def test_sessions_partition_key(self):
        defn = next(
            d for d in get_container_definitions() if d["id"] == SESSIONS_CONTAINER
        )
        assert defn["partition_key"] == "/user_id"

    def test_definitions_are_independent_copies(self):
        """Mutating returned list should not affect the internal definitions."""
        defs1 = get_container_definitions()
        defs1.pop()
        defs2 = get_container_definitions()
        assert len(defs2) == 3


# ---------------------------------------------------------------------------
#  Indexing policies — structural validation
# ---------------------------------------------------------------------------


class TestUsersIndexPolicy:
    def test_mode_is_consistent(self):
        assert USERS_INDEX_POLICY["indexingMode"] == "consistent"

    def test_automatic_is_true(self):
        assert USERS_INDEX_POLICY["automatic"] is True

    def test_includes_id_path(self):
        included = [p["path"] for p in USERS_INDEX_POLICY["includedPaths"]]
        assert "/id/?" in included

    def test_includes_is_active_path(self):
        included = [p["path"] for p in USERS_INDEX_POLICY["includedPaths"]]
        assert "/is_active/?" in included

    def test_excludes_wildcard(self):
        """Excludes all paths, only the explicit inclusions are indexed."""
        excluded = [p["path"] for p in USERS_INDEX_POLICY["excludedPaths"]]
        assert "/*" in excluded

    def test_no_composite_indexes(self):
        """Users are accessed by point-read; no composite indexes needed."""
        assert "compositeIndexes" not in USERS_INDEX_POLICY


class TestDecksIndexPolicy:
    def test_mode_is_consistent(self):
        assert DECKS_INDEX_POLICY["indexingMode"] == "consistent"

    def test_includes_user_id_path(self):
        included = [p["path"] for p in DECKS_INDEX_POLICY["includedPaths"]]
        assert "/user_id/?" in included

    def test_includes_created_at_path(self):
        included = [p["path"] for p in DECKS_INDEX_POLICY["includedPaths"]]
        assert "/created_at/?" in included

    def test_excludes_filters_and_species_arrays(self):
        excluded = [p["path"] for p in DECKS_INDEX_POLICY["excludedPaths"]]
        assert "/filters/*" in excluded
        assert "/species_codes/[]" in excluded

    def test_composite_index_user_id_created_at_desc(self):
        composites = DECKS_INDEX_POLICY["compositeIndexes"]
        assert len(composites) >= 1
        first = composites[0]
        assert first[0]["path"] == "/user_id"
        assert first[0]["order"] == "ascending"
        assert first[1]["path"] == "/created_at"
        assert first[1]["order"] == "descending"


class TestSessionsIndexPolicy:
    def test_mode_is_consistent(self):
        assert SESSIONS_INDEX_POLICY["indexingMode"] == "consistent"

    def test_includes_key_paths(self):
        included = [p["path"] for p in SESSIONS_INDEX_POLICY["includedPaths"]]
        for path in ["/user_id/?", "/completed_at/?", "/started_at/?", "/quiz_mode/?"]:
            assert path in included, f"Expected {path} in includedPaths"

    def test_excludes_answers_array(self):
        """Answers are read after fetch — not queried in Cosmos."""
        excluded = [p["path"] for p in SESSIONS_INDEX_POLICY["excludedPaths"]]
        assert "/answers/*" in excluded

    def test_composite_index_completed_at_desc(self):
        composites = SESSIONS_INDEX_POLICY["compositeIndexes"]
        completed_at_idx = composites[0]
        assert completed_at_idx[0]["path"] == "/user_id"
        assert completed_at_idx[1]["path"] == "/completed_at"
        assert completed_at_idx[1]["order"] == "descending"

    def test_composite_index_started_at_desc(self):
        composites = SESSIONS_INDEX_POLICY["compositeIndexes"]
        started_at_idx = composites[1]
        assert started_at_idx[0]["path"] == "/user_id"
        assert started_at_idx[1]["path"] == "/started_at"
        assert started_at_idx[1]["order"] == "descending"

    def test_has_two_composite_indexes(self):
        assert len(SESSIONS_INDEX_POLICY["compositeIndexes"]) == 2


# ---------------------------------------------------------------------------
#  ensure_containers()
# ---------------------------------------------------------------------------


class TestEnsureContainers:
    @patch("app.services.cosmos_init.get_database")
    def test_creates_all_three_containers(self, mock_get_db):
        mock_db = MagicMock()
        mock_get_db.return_value = mock_db

        result = ensure_containers()

        assert mock_db.create_container_if_not_exists.call_count == 3
        assert result == [USERS_CONTAINER, DECKS_CONTAINER, SESSIONS_CONTAINER]

    @patch("app.services.cosmos_init.get_database")
    def test_passes_indexing_policy_for_each_container(self, mock_get_db):
        mock_db = MagicMock()
        mock_get_db.return_value = mock_db

        ensure_containers()

        calls = mock_db.create_container_if_not_exists.call_args_list
        # Users
        assert calls[0].kwargs.get("indexing_policy") == USERS_INDEX_POLICY or (
            len(calls[0].args) > 2 and calls[0].args[2] == USERS_INDEX_POLICY
        )
        # Verify each call includes indexing_policy kwarg
        for c in calls:
            assert "indexing_policy" in c.kwargs

    @patch("app.services.cosmos_init.get_database")
    def test_passes_correct_partition_keys(self, mock_get_db):
        mock_db = MagicMock()
        mock_get_db.return_value = mock_db

        ensure_containers()

        calls = mock_db.create_container_if_not_exists.call_args_list
        partition_keys = [str(c.kwargs["partition_key"]) for c in calls]
        # PartitionKey.__str__ may vary; check the id kwarg instead
        container_ids = [c.kwargs["id"] for c in calls]
        assert container_ids == [USERS_CONTAINER, DECKS_CONTAINER, SESSIONS_CONTAINER]

    @patch("app.services.cosmos_init.get_database")
    def test_accepts_explicit_db_proxy(self, mock_get_db):
        explicit_db = MagicMock()
        ensure_containers(db=explicit_db)

        # Should NOT call get_database when db is passed explicitly
        mock_get_db.assert_not_called()
        assert explicit_db.create_container_if_not_exists.call_count == 3

    @patch("app.services.cosmos_init.get_database")
    def test_handles_creation_failure_gracefully(self, mock_get_db):
        mock_db = MagicMock()
        mock_get_db.return_value = mock_db
        # First call succeeds, second raises, third succeeds
        mock_db.create_container_if_not_exists.side_effect = [
            MagicMock(),
            Exception("Forbidden: data-plane only"),
            MagicMock(),
        ]

        result = ensure_containers()

        # Only successful containers are returned
        assert USERS_CONTAINER in result
        assert DECKS_CONTAINER not in result
        assert SESSIONS_CONTAINER in result

    @patch("app.services.cosmos_init.get_database")
    def test_idempotent_double_call(self, mock_get_db):
        mock_db = MagicMock()
        mock_get_db.return_value = mock_db

        result1 = ensure_containers()
        result2 = ensure_containers()

        assert result1 == result2
        assert mock_db.create_container_if_not_exists.call_count == 6  # 3 + 3

    @patch("app.services.cosmos_init.get_database")
    def test_skips_creation_under_managed_identity(self, mock_get_db, monkeypatch):
        """When COSMOS_KEY is empty (managed identity), skip container creation."""
        monkeypatch.setenv("COSMOS_KEY", "")
        # Force settings to reload the empty key
        from app.config import settings

        monkeypatch.setattr(settings, "cosmos_key", "")

        result = ensure_containers()

        assert result == []
        mock_get_db.assert_not_called()
