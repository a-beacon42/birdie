"""Tests for saved deck CRUD — service layer and router endpoints."""

import time
import uuid
from datetime import datetime, timezone
from unittest.mock import MagicMock, patch

import jwt
import pytest
from azure.cosmos.exceptions import CosmosResourceNotFoundError

# ---------------------------------------------------------------------------
#  Deterministic test encryption key
# ---------------------------------------------------------------------------
_TEST_ENCRYPTION_KEY = "a" * 64


def _make_test_settings(**overrides):
    from app.config import Settings

    s = Settings()
    s.email_encryption_key = _TEST_ENCRYPTION_KEY
    s.api_key = "test-api-key-12345"
    s.bcrypt_rounds = 4
    for k, v in overrides.items():
        setattr(s, k, v)
    return s


def _make_user_token(user_id="testuser123", tier="free"):
    now = int(time.time())
    return jwt.encode(
        {
            "iat": now,
            "exp": now + 86400,
            "iss": "birdie-api",
            "sub": user_id,
            "tier": tier,
        },
        "test-api-key-12345",
        algorithm="HS256",
    )


# ---------------------------------------------------------------------------
#  Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def mock_settings():
    s = _make_test_settings()
    with (
        patch("app.dependencies.auth.settings", s),
        patch("app.routers.auth.settings", s),
    ):
        yield s


@pytest.fixture
def mock_containers():
    """Mock Cosmos containers for decks and users."""
    decks = MagicMock()
    users = MagicMock()
    # Default: user has max 5 decks
    users.read_item.return_value = {"max_saved_decks": 5}
    with (
        patch("app.services.deck_service.get_decks_container", return_value=decks),
        patch("app.services.deck_service.get_users_container", return_value=users),
    ):
        yield decks, users


@pytest.fixture
def client():
    test_settings = _make_test_settings()

    with (
        patch("app.routers.auth.settings", test_settings),
        patch("app.routers.chat.settings", test_settings),
        patch("app.routers.birds.settings", test_settings),
        patch("app.routers.regions.settings", test_settings),
        patch("app.main.settings", test_settings),
        patch("app.dependencies.auth.settings", test_settings),
        patch("app.services.cosmos.get_birds_container") as mock_birds,
    ):
        mock_birds.return_value = MagicMock()

        from app.main import app
        from fastapi.testclient import TestClient

        yield TestClient(app, raise_server_exceptions=False)


# ---------------------------------------------------------------------------
#  Model validation
# ---------------------------------------------------------------------------


class TestDeckModels:
    def test_valid_dynamic_deck(self):
        from app.models.deck import DeckCreateRequest, DeckFilters

        req = DeckCreateRequest(  # type: ignore[call-arg]
            name="My Raptors",
            deck_type="dynamic",
            filters=DeckFilters(family="Accipitridae", limit=25),
        )
        assert req.name == "My Raptors"
        assert req.filters.family == "Accipitridae"  # type: ignore[union-attr]

    def test_valid_frozen_deck(self):
        from app.models.deck import DeckCreateRequest

        req = DeckCreateRequest(  # type: ignore[call-arg]
            name="Study Set",
            deck_type="frozen",
            species_codes=["norcar", "baleag1", "rthhum"],
        )
        assert len(req.species_codes) == 3  # type: ignore[arg-type]

    def test_name_sanitised(self):
        from app.models.deck import DeckCreateRequest, DeckFilters

        req = DeckCreateRequest(  # type: ignore[call-arg]
            name="  Too   many   spaces  ",
            deck_type="dynamic",
            filters=DeckFilters(limit=10),
        )
        assert req.name == "Too many spaces"

    def test_empty_name_rejected(self):
        from app.models.deck import DeckCreateRequest, DeckFilters

        with pytest.raises(Exception):
            DeckCreateRequest(name="", deck_type="dynamic", filters=DeckFilters())  # type: ignore[call-arg]

    def test_invalid_species_code_rejected(self):
        from app.models.deck import DeckCreateRequest

        with pytest.raises(Exception):
            DeckCreateRequest(  # type: ignore[call-arg]
                name="Bad",
                deck_type="frozen",
                species_codes=["valid1", "INVALID!!!"],
            )

    def test_too_many_species_rejected(self):
        from app.models.deck import DeckCreateRequest

        with pytest.raises(Exception):
            DeckCreateRequest(  # type: ignore[call-arg]
                name="Huge",
                deck_type="frozen",
                species_codes=[f"sp{i:04d}" for i in range(501)],
            )


# ---------------------------------------------------------------------------
#  Deck service — create
# ---------------------------------------------------------------------------


class TestCreateDeck:
    def test_create_dynamic_deck(self, mock_settings, mock_containers):
        decks, users = mock_containers
        decks.query_items.return_value = [0]  # 0 existing decks
        decks.create_item.return_value = {}

        from app.models.deck import DeckCreateRequest, DeckFilters
        from app.services.deck_service import create_deck

        req = DeckCreateRequest(  # type: ignore[call-arg]
            name="Raptors Deck",
            deck_type="dynamic",
            filters=DeckFilters(family="Accipitridae", difficulty="hard", limit=20),
        )
        result = create_deck("user123", req)
        assert result.name == "Raptors Deck"
        assert result.deck_type == "dynamic"
        assert result.filters.family == "Accipitridae"  # type: ignore[union-attr]
        decks.create_item.assert_called_once()

    def test_create_frozen_deck(self, mock_settings, mock_containers):
        decks, users = mock_containers
        decks.query_items.return_value = [0]
        decks.create_item.return_value = {}

        from app.models.deck import DeckCreateRequest
        from app.services.deck_service import create_deck

        req = DeckCreateRequest(  # type: ignore[call-arg]
            name="Study Set",
            deck_type="frozen",
            species_codes=["norcar", "baleag1"],
        )
        result = create_deck("user123", req)
        assert result.deck_type == "frozen"
        assert result.species_codes == ["norcar", "baleag1"]

    def test_dynamic_without_filters_rejected(self, mock_settings, mock_containers):
        from app.models.deck import DeckCreateRequest
        from app.services.deck_service import create_deck

        req = DeckCreateRequest(name="Bad", deck_type="dynamic")  # type: ignore[call-arg]
        with pytest.raises(ValueError, match="require filters"):
            create_deck("user123", req)

    def test_frozen_without_species_rejected(self, mock_settings, mock_containers):
        from app.models.deck import DeckCreateRequest
        from app.services.deck_service import create_deck

        req = DeckCreateRequest(name="Bad", deck_type="frozen")  # type: ignore[call-arg]
        with pytest.raises(ValueError, match="require species_codes"):
            create_deck("user123", req)

    def test_tier_limit_enforced(self, mock_settings, mock_containers):
        decks, users = mock_containers
        users.read_item.return_value = {"max_saved_decks": 2}
        decks.query_items.return_value = [2]  # already at limit

        from app.models.deck import DeckCreateRequest, DeckFilters
        from app.services.deck_service import create_deck

        req = DeckCreateRequest(  # type: ignore[call-arg]
            name="One too many",
            deck_type="dynamic",
            filters=DeckFilters(limit=10),
        )
        with pytest.raises(ValueError, match="Deck limit reached"):
            create_deck("user123", req)

    def test_tier_limit_allows_when_under(self, mock_settings, mock_containers):
        decks, users = mock_containers
        users.read_item.return_value = {"max_saved_decks": 5}
        decks.query_items.return_value = [4]  # one slot left
        decks.create_item.return_value = {}

        from app.models.deck import DeckCreateRequest, DeckFilters
        from app.services.deck_service import create_deck

        req = DeckCreateRequest(  # type: ignore[call-arg]
            name="Fits",
            deck_type="dynamic",
            filters=DeckFilters(limit=10),
        )
        result = create_deck("user123", req)
        assert result.name == "Fits"


# ---------------------------------------------------------------------------
#  Deck service — list / get / update / delete
# ---------------------------------------------------------------------------


class TestDeckCRUD:
    def _make_deck_doc(self, **overrides):
        doc = {
            "id": uuid.uuid4().hex,
            "user_id": "user123",
            "name": "Test Deck",
            "deck_type": "dynamic",
            "filters": {"family": "Accipitridae", "limit": 25},
            "species_codes": None,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "last_played_at": None,
        }
        doc.update(overrides)
        return doc

    def test_list_decks(self, mock_settings, mock_containers):
        decks, _ = mock_containers
        d1 = self._make_deck_doc(name="Deck A")
        d2 = self._make_deck_doc(name="Deck B")
        decks.query_items.return_value = [d1, d2]

        from app.services.deck_service import list_decks

        result = list_decks("user123")
        assert len(result) == 2
        assert result[0].name == "Deck A"
        assert result[1].name == "Deck B"

    def test_get_deck(self, mock_settings, mock_containers):
        decks, _ = mock_containers
        doc = self._make_deck_doc(name="Specific Deck")
        decks.read_item.return_value = doc

        from app.services.deck_service import get_deck

        result = get_deck("user123", doc["id"])
        assert result.name == "Specific Deck"

    def test_get_nonexistent_deck(self, mock_settings, mock_containers):
        decks, _ = mock_containers
        decks.read_item.side_effect = CosmosResourceNotFoundError(
            status_code=404, message="Not found"
        )

        from app.services.deck_service import get_deck

        with pytest.raises(ValueError, match="Deck not found"):
            get_deck("user123", "nonexistent")

    def test_update_deck_name(self, mock_settings, mock_containers):
        decks, _ = mock_containers
        doc = self._make_deck_doc(name="Old Name")
        decks.read_item.return_value = doc

        from app.models.deck import DeckUpdateRequest
        from app.services.deck_service import update_deck

        req = DeckUpdateRequest(name="New Name")
        result = update_deck("user123", doc["id"], req)
        assert result.name == "New Name"
        decks.upsert_item.assert_called_once()

    def test_update_to_frozen_without_species_rejected(
        self, mock_settings, mock_containers
    ):
        decks, _ = mock_containers
        doc = self._make_deck_doc(deck_type="dynamic")
        decks.read_item.return_value = doc

        from app.models.deck import DeckUpdateRequest
        from app.services.deck_service import update_deck

        req = DeckUpdateRequest(deck_type="frozen")  # type: ignore[call-arg]
        with pytest.raises(ValueError, match="require species_codes"):
            update_deck("user123", doc["id"], req)

    def test_delete_deck(self, mock_settings, mock_containers):
        decks, _ = mock_containers
        doc = self._make_deck_doc()
        decks.read_item.return_value = doc

        from app.services.deck_service import delete_deck

        delete_deck("user123", doc["id"])
        decks.delete_item.assert_called_once()

    def test_delete_nonexistent_deck(self, mock_settings, mock_containers):
        decks, _ = mock_containers
        decks.read_item.side_effect = CosmosResourceNotFoundError(
            status_code=404, message="Not found"
        )

        from app.services.deck_service import delete_deck

        with pytest.raises(ValueError, match="Deck not found"):
            delete_deck("user123", "nonexistent")


# ---------------------------------------------------------------------------
#  Router integration tests
# ---------------------------------------------------------------------------


class TestDeckEndpoints:
    def _auth_headers(self, user_id="testuser123"):
        return {"Authorization": f"Bearer {_make_user_token(user_id)}"}

    def test_create_deck_endpoint(self, client, mock_containers):
        decks, users = mock_containers
        decks.query_items.return_value = [0]
        decks.create_item.return_value = {}

        resp = client.post(
            "/api/v1/decks",
            json={
                "name": "My Raptors",
                "deck_type": "dynamic",
                "filters": {"family": "Accipitridae", "limit": 20},
            },
            headers=self._auth_headers(),
        )
        assert resp.status_code == 201
        data = resp.json()
        assert data["name"] == "My Raptors"
        assert data["deck_type"] == "dynamic"

    def test_create_deck_requires_auth(self, client, mock_containers):
        resp = client.post(
            "/api/v1/decks",
            json={
                "name": "Unauthed",
                "deck_type": "dynamic",
                "filters": {"limit": 10},
            },
        )
        assert resp.status_code in (401, 403)

    def test_create_deck_rejects_anonymous_token(self, client, mock_containers):
        anon = jwt.encode(
            {
                "iat": int(time.time()),
                "exp": int(time.time()) + 3600,
                "iss": "birdie-api",
                "sub": "anonymous",
            },
            "test-api-key-12345",
            algorithm="HS256",
        )
        resp = client.post(
            "/api/v1/decks",
            json={
                "name": "Anon Deck",
                "deck_type": "dynamic",
                "filters": {"limit": 10},
            },
            headers={"Authorization": f"Bearer {anon}"},
        )
        assert resp.status_code == 401

    def test_list_decks_endpoint(self, client, mock_containers):
        decks, _ = mock_containers
        decks.query_items.return_value = [
            {
                "id": "deck1",
                "name": "Deck A",
                "deck_type": "dynamic",
                "filters": {"limit": 10},
                "species_codes": None,
                "created_at": "2026-03-01T00:00:00+00:00",
                "last_played_at": None,
            }
        ]

        resp = client.get("/api/v1/decks", headers=self._auth_headers())
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) == 1
        assert data[0]["name"] == "Deck A"

    def test_get_deck_endpoint(self, client, mock_containers):
        decks, _ = mock_containers
        decks.read_item.return_value = {
            "id": "deck1",
            "user_id": "testuser123",
            "name": "My Deck",
            "deck_type": "frozen",
            "filters": None,
            "species_codes": ["norcar", "baleag1"],
            "created_at": "2026-03-01T00:00:00+00:00",
            "last_played_at": None,
        }

        resp = client.get("/api/v1/decks/deck1", headers=self._auth_headers())
        assert resp.status_code == 200
        assert resp.json()["species_codes"] == ["norcar", "baleag1"]

    def test_get_deck_not_found(self, client, mock_containers):
        decks, _ = mock_containers
        decks.read_item.side_effect = CosmosResourceNotFoundError(
            status_code=404, message="Not found"
        )

        resp = client.get("/api/v1/decks/nonexistent", headers=self._auth_headers())
        assert resp.status_code == 404

    def test_update_deck_endpoint(self, client, mock_containers):
        decks, _ = mock_containers
        decks.read_item.return_value = {
            "id": "deck1",
            "user_id": "testuser123",
            "name": "Old Name",
            "deck_type": "dynamic",
            "filters": {"limit": 10},
            "species_codes": None,
            "created_at": "2026-03-01T00:00:00+00:00",
            "last_played_at": None,
        }

        resp = client.put(
            "/api/v1/decks/deck1",
            json={"name": "New Name"},
            headers=self._auth_headers(),
        )
        assert resp.status_code == 200
        assert resp.json()["name"] == "New Name"

    def test_delete_deck_endpoint(self, client, mock_containers):
        decks, _ = mock_containers
        decks.read_item.return_value = {
            "id": "deck1",
            "user_id": "testuser123",
        }

        resp = client.delete("/api/v1/decks/deck1", headers=self._auth_headers())
        assert resp.status_code == 204

    def test_delete_deck_not_found(self, client, mock_containers):
        decks, _ = mock_containers
        decks.read_item.side_effect = CosmosResourceNotFoundError(
            status_code=404, message="Not found"
        )

        resp = client.delete("/api/v1/decks/nonexistent", headers=self._auth_headers())
        assert resp.status_code == 404

    def test_tier_limit_returns_400(self, client, mock_containers):
        decks, users = mock_containers
        users.read_item.return_value = {"max_saved_decks": 1}
        decks.query_items.return_value = [1]  # already at limit

        resp = client.post(
            "/api/v1/decks",
            json={
                "name": "Over Limit",
                "deck_type": "dynamic",
                "filters": {"limit": 10},
            },
            headers=self._auth_headers(),
        )
        assert resp.status_code == 400
        assert "limit" in resp.json()["detail"].lower()


class TestPlayDeckEndpoint:
    def _auth_headers(self, user_id="testuser123"):
        return {"Authorization": f"Bearer {_make_user_token(user_id)}"}

    def test_play_frozen_deck(self, client, mock_containers):
        decks, _ = mock_containers
        decks.read_item.return_value = {
            "id": "deck1",
            "user_id": "testuser123",
            "name": "Frozen Set",
            "deck_type": "frozen",
            "filters": None,
            "species_codes": ["norcar", "baleag1"],
            "created_at": "2026-03-01T00:00:00+00:00",
            "last_played_at": None,
        }

        mock_birds = [
            {
                "id": "norcar",
                "species_code": "norcar",
                "sci_name": "Cardinalis cardinalis",
                "com_name": "Northern Cardinal",
                "family_code": "Cardinalidae",
                "family_com_name": "Cardinals",
                "images": [],
                "wikipedia_url": "",
                "global_frequency": 0.5,
                "lookalikes": [],
            },
            {
                "id": "baleag1",
                "species_code": "baleag1",
                "sci_name": "Haliaeetus leucocephalus",
                "com_name": "Bald Eagle",
                "family_code": "Accipitridae",
                "family_com_name": "Hawks",
                "images": [],
                "wikipedia_url": "",
                "global_frequency": 0.3,
                "lookalikes": [],
            },
        ]

        with patch(
            "app.routers.decks.query_birds",
            return_value=[
                MagicMock(
                    id=b["id"],
                    species_code=b["species_code"],
                    sci_name=b["sci_name"],
                    com_name=b["com_name"],
                    family_code=b["family_code"],
                    family_com_name=b["family_com_name"],
                    image_url="",
                    wikipedia_url="",
                    global_frequency=b["global_frequency"],
                    lookalike_count=0,
                    model_dump=lambda b=b: b,
                )
                for b in mock_birds
            ],
        ):
            resp = client.post("/api/v1/decks/deck1/play", headers=self._auth_headers())
            assert resp.status_code == 200
            data = resp.json()
            assert len(data) == 2
            codes = {b["species_code"] for b in data}
            assert codes == {"norcar", "baleag1"}

    def test_play_nonexistent_deck(self, client, mock_containers):
        decks, _ = mock_containers
        decks.read_item.side_effect = CosmosResourceNotFoundError(
            status_code=404, message="Not found"
        )

        resp = client.post(
            "/api/v1/decks/nonexistent/play", headers=self._auth_headers()
        )
        assert resp.status_code == 404

    def test_play_requires_auth(self, client, mock_containers):
        resp = client.post("/api/v1/decks/deck1/play")
        assert resp.status_code in (401, 403)
