"""Tests for iNaturalist service and lookalike game features."""

from unittest.mock import AsyncMock, MagicMock, patch

import httpx
import pytest

from app.models.bird import BirdImage, LookalikeBirdSummary


# ---------------------------------------------------------------------------
#  iNaturalist photo service
# ---------------------------------------------------------------------------


class TestInaturalistService:
    """Tests for inaturalist_service.fetch_photos()."""

    @pytest.fixture(autouse=True)
    def _patch_client(self):
        """Provide a mock HTTP client for each test."""
        self.mock_client = AsyncMock(spec=httpx.AsyncClient)
        self.mock_client.is_closed = False
        with patch(
            "app.services.inaturalist_service.get_http_client",
            return_value=self.mock_client,
        ):
            yield

    def _inat_response(self, photos):
        """Build a mock iNat observations response."""
        results = []
        for p in photos:
            results.append(
                {
                    "observation_photos": [
                        {
                            "photo": {
                                "url": p.get(
                                    "url",
                                    "https://inat.s3.amazonaws.com/photos/1/square.jpg",
                                ),
                                "license_code": p.get("license", "cc-by"),
                                "attribution": p.get("attribution", "(c) User"),
                            }
                        }
                    ]
                }
            )
        resp = MagicMock(spec=httpx.Response)
        resp.status_code = 200
        resp.json.return_value = {"results": results}
        resp.raise_for_status = MagicMock()
        return resp

    @pytest.mark.asyncio
    async def test_fetch_photos_returns_bird_images(self):
        photos = [
            {
                "url": f"https://inat.s3.amazonaws.com/photos/{i}/square.jpg",
                "license": "cc-by",
            }
            for i in range(5)
        ]
        self.mock_client.get = AsyncMock(return_value=self._inat_response(photos))

        from app.services.inaturalist_service import fetch_photos

        result = await fetch_photos(inat_taxon_id=12345, count=5)

        assert len(result) == 5
        assert all(isinstance(img, BirdImage) for img in result)
        assert all(img.source == "inaturalist" for img in result)
        assert all(img.is_primary is False for img in result)
        # URLs should be converted to medium size
        assert all("/medium." in img.url for img in result)

    @pytest.mark.asyncio
    async def test_fetch_photos_filters_bad_licenses(self):
        photos = [
            {
                "url": "https://inat.s3.amazonaws.com/photos/1/square.jpg",
                "license": "cc-by",
            },
            {
                "url": "https://inat.s3.amazonaws.com/photos/2/square.jpg",
                "license": "cc-by-nc-nd",
            },
            {
                "url": "https://inat.s3.amazonaws.com/photos/3/square.jpg",
                "license": "cc0",
            },
        ]
        self.mock_client.get = AsyncMock(return_value=self._inat_response(photos))

        from app.services.inaturalist_service import fetch_photos

        result = await fetch_photos(inat_taxon_id=99, count=10)

        # cc-by-nc-nd is not in the accepted set
        assert len(result) == 2
        licenses = {img.license for img in result}
        assert "cc-by-nc-nd" not in licenses

    @pytest.mark.asyncio
    async def test_fetch_photos_deduplicates(self):
        photos = [
            {
                "url": "https://inat.s3.amazonaws.com/photos/1/square.jpg",
                "license": "cc-by",
            },
            {
                "url": "https://inat.s3.amazonaws.com/photos/1/square.jpg",
                "license": "cc-by",
            },
        ]
        self.mock_client.get = AsyncMock(return_value=self._inat_response(photos))

        from app.services.inaturalist_service import fetch_photos

        result = await fetch_photos(inat_taxon_id=99, count=10)
        assert len(result) == 1

    @pytest.mark.asyncio
    async def test_fetch_photos_handles_api_error(self):
        self.mock_client.get = AsyncMock(
            side_effect=httpx.ConnectError("Connection refused")
        )

        from app.services.inaturalist_service import fetch_photos

        result = await fetch_photos(inat_taxon_id=99, count=5)
        assert result == []

    @pytest.mark.asyncio
    async def test_fetch_photos_respects_count_limit(self):
        photos = [
            {
                "url": f"https://inat.s3.amazonaws.com/photos/{i}/square.jpg",
                "license": "cc-by",
            }
            for i in range(20)
        ]
        self.mock_client.get = AsyncMock(return_value=self._inat_response(photos))

        from app.services.inaturalist_service import fetch_photos

        result = await fetch_photos(inat_taxon_id=99, count=3)
        assert len(result) == 3


# ---------------------------------------------------------------------------
#  ensure_images
# ---------------------------------------------------------------------------


class TestEnsureImages:
    """Tests for bird_service.ensure_images()."""

    @pytest.mark.asyncio
    async def test_skips_species_with_enough_images(self):
        existing_images = [
            {
                "url": f"https://example.com/{i}.jpg",
                "source": "inaturalist",
                "license": "cc-by",
                "attribution": "",
                "quality": "high",
                "is_primary": i == 0,
            }
            for i in range(6)
        ]
        bird_doc = {
            "id": "norcar",
            "species_code": "norcar",
            "sci_name": "Cardinalis cardinalis",
            "com_name": "Northern Cardinal",
            "family_code": "cardinalidae",
            "family_com_name": "Cardinals",
            "images": existing_images,
            "inat_taxon_id": 12345,
        }

        mock_container = MagicMock()
        mock_container.query_items.return_value = [bird_doc]

        with (
            patch(
                "app.services.bird_service.get_birds_container",
                return_value=mock_container,
            ),
            patch("app.services.bird_service.fetch_photos") as mock_fetch,
        ):
            from app.services.bird_service import ensure_images

            result = await ensure_images(["norcar"], min_count=5)

        # Should NOT have called iNat — already has 6 images
        mock_fetch.assert_not_called()
        assert "norcar" in result
        assert len(result["norcar"]) == 6

    @pytest.mark.asyncio
    async def test_fetches_when_below_threshold(self):
        existing_images = [
            {
                "url": "https://example.com/primary.jpg",
                "source": "inaturalist",
                "license": "cc-by",
                "attribution": "",
                "quality": "high",
                "is_primary": True,
            }
        ]
        bird_doc = {
            "id": "baleag",
            "species_code": "baleag",
            "sci_name": "Haliaeetus leucocephalus",
            "com_name": "Bald Eagle",
            "family_code": "accipitridae",
            "family_com_name": "Hawks",
            "images": existing_images,
            "inat_taxon_id": 5678,
        }

        new_photos = [
            BirdImage(
                url=f"https://inat.s3.amazonaws.com/photos/{i}/medium.jpg",
                source="inaturalist",
                license="cc-by",
                attribution="(c) User",
                quality="high",
                is_primary=False,
            )
            for i in range(5)
        ]

        mock_container = MagicMock()
        mock_container.query_items.return_value = [bird_doc]

        with (
            patch(
                "app.services.bird_service.get_birds_container",
                return_value=mock_container,
            ),
            patch(
                "app.services.bird_service.fetch_photos",
                new_callable=AsyncMock,
                return_value=new_photos,
            ),
        ):
            from app.services.bird_service import ensure_images

            result = await ensure_images(["baleag"], min_count=5)

        assert "baleag" in result
        # 1 existing + 4 new = 5 (stops when reaching min_count)
        assert len(result["baleag"]) == 5
        # Doc should have been upserted
        mock_container.upsert_item.assert_called_once()

    @pytest.mark.asyncio
    async def test_skips_species_without_inat_taxon(self):
        bird_doc = {
            "id": "unknwn",
            "species_code": "unknwn",
            "sci_name": "Unknown sp.",
            "com_name": "Unknown",
            "family_code": "test",
            "family_com_name": "Test",
            "images": [
                {
                    "url": "https://example.com/1.jpg",
                    "source": "wikimedia",
                    "license": "",
                    "attribution": "",
                    "quality": "high",
                    "is_primary": True,
                }
            ],
            "inat_taxon_id": None,
        }

        mock_container = MagicMock()
        mock_container.query_items.return_value = [bird_doc]

        with (
            patch(
                "app.services.bird_service.get_birds_container",
                return_value=mock_container,
            ),
            patch("app.services.bird_service.fetch_photos") as mock_fetch,
        ):
            from app.services.bird_service import ensure_images

            result = await ensure_images(["unknwn"], min_count=5)

        mock_fetch.assert_not_called()
        assert len(result["unknwn"]) == 1


# ---------------------------------------------------------------------------
#  Lookalike deck endpoint
# ---------------------------------------------------------------------------


class TestLookalikeDeckEndpoint:
    """Tests for POST /birds/lookalike-deck."""

    @pytest.fixture
    def client(self):
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
            from fastapi.testclient import TestClient

            yield TestClient(app, raise_server_exceptions=False)

    def test_valid_request(self, client):
        summaries = [
            LookalikeBirdSummary(
                id=f"bird{i}",
                species_code=f"bird{i}",
                sci_name=f"Species {i}",
                com_name=f"Bird {i}",
                family_code="testfam",
                family_com_name="Test Family",
                image_url=f"https://example.com/{i}.jpg",
                image_urls=[f"https://example.com/{i}_{j}.jpg" for j in range(5)],
            )
            for i in range(3)
        ]
        with (
            patch(
                "app.routers.birds.ensure_images",
                new_callable=AsyncMock,
                return_value={},
            ),
            patch("app.routers.birds.query_birds_with_images", return_value=summaries),
        ):
            resp = client.post(
                "/api/v1/birds/lookalike-deck",
                json={"species_codes": ["bird0", "bird1", "bird2"]},
            )
            assert resp.status_code == 200
            data = resp.json()
            assert len(data) == 3
            assert "image_urls" in data[0]
            assert len(data[0]["image_urls"]) == 5

    def test_rejects_single_species(self, client):
        resp = client.post(
            "/api/v1/birds/lookalike-deck",
            json={"species_codes": ["bird0"]},
        )
        assert resp.status_code == 422

    def test_rejects_too_many_species(self, client):
        codes = [f"bird{i}" for i in range(11)]
        resp = client.post(
            "/api/v1/birds/lookalike-deck",
            json={"species_codes": codes},
        )
        assert resp.status_code == 422

    def test_rejects_duplicate_species(self, client):
        resp = client.post(
            "/api/v1/birds/lookalike-deck",
            json={"species_codes": ["bird0", "bird0", "bird1"]},
        )
        assert resp.status_code == 422

    def test_rejects_invalid_species_codes(self, client):
        resp = client.post(
            "/api/v1/birds/lookalike-deck",
            json={"species_codes": ["valid1", "inv@lid!"]},
        )
        assert resp.status_code == 422

    def test_no_matching_birds_returns_404(self, client):
        with (
            patch(
                "app.routers.birds.ensure_images",
                new_callable=AsyncMock,
                return_value={},
            ),
            patch("app.routers.birds.query_birds_with_images", return_value=[]),
        ):
            resp = client.post(
                "/api/v1/birds/lookalike-deck",
                json={"species_codes": ["bird0", "bird1"]},
            )
            assert resp.status_code == 404


# ---------------------------------------------------------------------------
#  Lookalike deck type in saved decks
# ---------------------------------------------------------------------------


class TestLookalikeDeckModel:
    """Tests for the 'lookalike' deck type in deck models."""

    def test_create_lookalike_deck(self):
        from app.models.deck import DeckCreateRequest

        req = DeckCreateRequest(
            name="Hawks Lookalikes",
            deck_type="lookalike",
            species_codes=["coohaw", "shshaw"],
        )
        assert req.deck_type == "lookalike"
        assert len(req.species_codes) == 2

    def test_lookalike_deck_requires_species(self):
        from app.models.deck import DeckCreateRequest

        # Should succeed at model level but fail at service validation
        req = DeckCreateRequest(
            name="Empty Lookalike",
            deck_type="lookalike",
        )
        assert req.species_codes is None
