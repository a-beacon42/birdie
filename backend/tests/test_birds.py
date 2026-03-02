"""Tests for bird data endpoints."""

from unittest.mock import patch, MagicMock

import pytest
from fastapi.testclient import TestClient

from app.models.bird import BirdSummary, Bird, DataVersion


def _make_summary(code: str = "norcar") -> BirdSummary:
    return BirdSummary(
        id=code,
        species_code=code,
        sci_name="Cardinalis cardinalis",
        com_name="Northern Cardinal",
        family_code="cardinalidae",
        family_com_name="Cardinals and Allies",
        image_url="https://example.com/img.jpg",
        global_frequency=0.6,
        lookalike_count=2,
    )


def _make_bird(code: str = "norcar") -> Bird:
    return Bird(
        id=code,
        species_code=code,
        sci_name="Cardinalis cardinalis",
        com_name="Northern Cardinal",
        family_code="cardinalidae",
        family_com_name="Cardinals and Allies",
        order="Passeriformes",
    )


@pytest.fixture
def client():
    from app.config import Settings

    test_settings = Settings()

    with (
        patch("app.routers.birds.settings", test_settings),
        patch("app.routers.chat.settings", test_settings),
        patch("app.routers.regions.settings", test_settings),
        patch("app.main.settings", test_settings),
        patch("app.services.cosmos.get_birds_container") as mock_container,
    ):
        mock_container.return_value = MagicMock()

        from app.main import app

        yield TestClient(app, raise_server_exceptions=False)


class TestListBirds:
    def test_list_birds_returns_list(self, client):
        summaries = [_make_summary("a"), _make_summary("b")]
        with patch("app.routers.birds.query_birds", return_value=summaries):
            resp = client.get("/api/v1/birds")
            assert resp.status_code == 200
            data = resp.json()
            assert len(data) == 2
            assert data[0]["species_code"] == "a"

    def test_list_birds_with_limit(self, client):
        with patch("app.routers.birds.query_birds", return_value=[]) as mock:
            resp = client.get("/api/v1/birds?limit=10&offset=5")
            assert resp.status_code == 200
            mock.assert_called_once_with(
                family_code=None,
                species_codes=None,
                limit=10,
                offset=5,
            )

    def test_list_birds_invalid_limit(self, client):
        resp = client.get("/api/v1/birds?limit=0")
        assert resp.status_code == 422

    def test_list_birds_limit_too_large(self, client):
        resp = client.get("/api/v1/birds?limit=999")
        assert resp.status_code == 422


class TestGetBird:
    def test_get_bird_found(self, client):
        bird = _make_bird()
        with patch("app.routers.birds.get_bird_by_species_code", return_value=bird):
            resp = client.get("/api/v1/birds/norcar")
            assert resp.status_code == 200
            assert resp.json()["species_code"] == "norcar"

    def test_get_bird_not_found(self, client):
        with patch("app.routers.birds.get_bird_by_species_code", return_value=None):
            resp = client.get("/api/v1/birds/zzzzzz")
            assert resp.status_code == 404


class TestCreateDeck:
    def test_create_deck_returns_birds(self, client):
        summaries = [_make_summary(f"b{i}") for i in range(5)]
        with (
            patch("app.routers.birds.query_birds", return_value=summaries),
            patch("app.routers.birds.build_deck", return_value=summaries[:3]),
        ):
            resp = client.post("/api/v1/birds/deck", json={"limit": 3})
            assert resp.status_code == 200
            assert len(resp.json()) == 3

    def test_create_deck_empty_pool(self, client):
        with patch("app.routers.birds.query_birds", return_value=[]):
            resp = client.post("/api/v1/birds/deck", json={"limit": 10})
            assert resp.status_code == 200
            assert resp.json() == []

    def test_create_deck_invalid_limit(self, client):
        resp = client.post("/api/v1/birds/deck", json={"limit": 0})
        assert resp.status_code == 422


class TestFamilies:
    def test_list_families(self, client):
        families = [{"family_code": "accip", "family_com_name": "Hawks"}]
        with patch("app.routers.birds.get_unique_families", return_value=families):
            resp = client.get("/api/v1/birds/families")
            assert resp.status_code == 200
            assert resp.json()[0]["family_code"] == "accip"


class TestDataVersion:
    def test_data_version(self, client):
        version = DataVersion(
            version="2024.1", total_species=100, image_coverage_pct=85.5
        )
        with patch("app.routers.birds.get_data_version", return_value=version):
            resp = client.get("/api/v1/birds/version")
            assert resp.status_code == 200
            data = resp.json()
            assert data["version"] == "2024.1"
            assert data["total_species"] == 100
