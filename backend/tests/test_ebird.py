"""Tests for eBird service — caching, retries, and error handling."""

import time
from unittest.mock import AsyncMock, MagicMock, patch

import httpx
import pytest


class TestEbirdCaching:
    """Test the in-memory frequency cache in ebird_service."""

    @pytest.fixture(autouse=True)
    def _clear_cache(self):
        """Clear the module-level cache before each test."""
        from app.services import ebird_service

        ebird_service._freq_cache.clear()
        yield
        ebird_service._freq_cache.clear()

    @pytest.mark.asyncio
    async def test_frequency_cached_on_second_call(self):
        """Second call should return cached data without an HTTP request."""
        mock_observations = [
            {"speciesCode": "norcar", "howMany": 10},
            {"speciesCode": "baleag", "howMany": 5},
        ]

        mock_response = MagicMock(spec=httpx.Response)
        mock_response.status_code = 200
        mock_response.json.return_value = mock_observations
        mock_response.raise_for_status = MagicMock()

        mock_client = AsyncMock(spec=httpx.AsyncClient)
        mock_client.is_closed = False
        mock_client.get = AsyncMock(return_value=mock_response)

        with patch(
            "app.services.ebird_service.get_http_client", return_value=mock_client
        ):
            from app.services.ebird_service import get_region_frequency

            # First call — hits the API
            result1 = await get_region_frequency("US-NY")
            assert mock_client.get.await_count == 1
            assert result1["norcar"] == 1.0  # max → 1.0
            assert result1["baleag"] == 0.5

            # Second call — should use cache
            result2 = await get_region_frequency("US-NY")
            assert mock_client.get.await_count == 1  # no extra call
            assert result2 == result1

    @pytest.mark.asyncio
    async def test_cache_expires_after_ttl(self):
        """Cache entry should be refreshed after TTL expires."""
        mock_observations = [{"speciesCode": "norcar", "howMany": 1}]

        mock_response = MagicMock(spec=httpx.Response)
        mock_response.status_code = 200
        mock_response.json.return_value = mock_observations
        mock_response.raise_for_status = MagicMock()

        mock_client = AsyncMock(spec=httpx.AsyncClient)
        mock_client.is_closed = False
        mock_client.get = AsyncMock(return_value=mock_response)

        with patch(
            "app.services.ebird_service.get_http_client", return_value=mock_client
        ):
            from app.services import ebird_service
            from app.services.ebird_service import get_region_frequency

            # First call
            await get_region_frequency("US-CA")
            assert mock_client.get.await_count == 1

            # Simulate TTL expiry by back-dating the cached timestamp
            if "US-CA" in ebird_service._freq_cache:
                old_data = ebird_service._freq_cache["US-CA"][1]
                ebird_service._freq_cache["US-CA"] = (
                    time.monotonic() - ebird_service._FREQ_TTL - 1,
                    old_data,
                )

            # Next call should re-fetch
            await get_region_frequency("US-CA")
            assert mock_client.get.await_count == 2

    @pytest.mark.asyncio
    async def test_different_regions_cached_independently(self):
        """Different region codes should have independent cache entries."""
        mock_response = MagicMock(spec=httpx.Response)
        mock_response.status_code = 200
        mock_response.json.return_value = [{"speciesCode": "norcar", "howMany": 1}]
        mock_response.raise_for_status = MagicMock()

        mock_client = AsyncMock(spec=httpx.AsyncClient)
        mock_client.is_closed = False
        mock_client.get = AsyncMock(return_value=mock_response)

        with patch(
            "app.services.ebird_service.get_http_client", return_value=mock_client
        ):
            from app.services.ebird_service import get_region_frequency

            await get_region_frequency("US-NY")
            await get_region_frequency("US-CA")
            # Two distinct regions → two API calls
            assert mock_client.get.await_count == 2


class TestEbirdRegionEndpoints:
    """Test the region proxy endpoints via the router."""

    @pytest.fixture
    def client(self):
        from app.config import Settings

        test_settings = Settings()

        with (
            patch("app.routers.regions.settings", test_settings),
            patch("app.routers.birds.settings", test_settings),
            patch("app.routers.chat.settings", test_settings),
            patch("app.routers.auth.settings", test_settings),
            patch("app.main.settings", test_settings),
            patch("app.services.cosmos.get_birds_container") as mock_container,
        ):
            mock_container.return_value = MagicMock()
            from app.main import app
            from fastapi.testclient import TestClient

            yield TestClient(app, raise_server_exceptions=False)

    def test_subnational1_success(self, client):
        """Valid country code returns region list."""
        mock_regions = [{"code": "US-NY", "name": "New York"}]
        with patch(
            "app.routers.regions.get_subnational1_regions",
            new_callable=AsyncMock,
            return_value=mock_regions,
        ):
            resp = client.get("/api/v1/regions/subnational1/US")
            assert resp.status_code == 200
            assert resp.json()[0]["code"] == "US-NY"

    def test_subnational1_invalid_code(self, client):
        """Invalid country code rejected by regex validation."""
        resp = client.get("/api/v1/regions/subnational1/INVALID")
        assert resp.status_code == 422

    def test_subnational2_service_error_returns_502(self, client):
        """eBird service errors should return 502 with generic message."""
        with patch(
            "app.routers.regions.get_subnational2_regions",
            new_callable=AsyncMock,
            side_effect=httpx.ConnectError("connection refused"),
        ):
            resp = client.get("/api/v1/regions/subnational2/US-NY")
            assert resp.status_code == 502
            # Must NOT leak internal error details
            assert "connection refused" not in resp.json()["detail"]

    def test_species_list_success(self, client):
        """Valid region returns species list."""
        mock_species = ["norcar", "baleag", "amecro"]
        with patch(
            "app.routers.regions.get_species_list",
            new_callable=AsyncMock,
            return_value=mock_species,
        ):
            resp = client.get("/api/v1/regions/species/US-NY")
            assert resp.status_code == 200
            assert len(resp.json()) == 3

    def test_frequency_success(self, client):
        """Valid region returns frequency map."""
        mock_freq = {"norcar": 1.0, "baleag": 0.5}
        with patch(
            "app.routers.regions.get_region_frequency",
            new_callable=AsyncMock,
            return_value=mock_freq,
        ):
            resp = client.get("/api/v1/regions/frequency/US-NY")
            assert resp.status_code == 200
            assert resp.json()["norcar"] == 1.0
