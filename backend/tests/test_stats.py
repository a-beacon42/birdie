"""Tests for game session persistence and stats aggregation."""

import time
from datetime import datetime, timedelta, timezone
from unittest.mock import MagicMock, patch

import jwt
import pytest

# ---------------------------------------------------------------------------
#  Test helpers
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


def _auth_headers(user_id="testuser123"):
    return {"Authorization": f"Bearer {_make_user_token(user_id)}"}


def _ts(days_ago: int = 0, hour: int = 12) -> str:
    """Generate an ISO-8601 timestamp N days ago."""
    dt = datetime.now(timezone.utc) - timedelta(days=days_ago)
    dt = dt.replace(hour=hour, minute=0, second=0, microsecond=0)
    return dt.isoformat()


def _make_session(
    user_id: str = "testuser123",
    quiz_mode: str = "flashcard",
    days_ago: int = 0,
    region_code: str | None = None,
    difficulty: str | None = None,
    answers: list[dict] | None = None,
) -> dict:
    """Build a game session document matching Cosmos shape."""
    import uuid

    if answers is None:
        answers = [
            {"species_code": "norcar", "result": "correct", "time_ms": 3000},
            {"species_code": "baleag1", "result": "incorrect", "time_ms": 5000},
        ]
    return {
        "id": uuid.uuid4().hex,
        "user_id": user_id,
        "deck_id": None,
        "quiz_mode": quiz_mode,
        "started_at": _ts(days_ago, 11),
        "completed_at": _ts(days_ago, 12),
        "region_code": region_code,
        "difficulty": difficulty,
        "answers": answers,
    }


# ---------------------------------------------------------------------------
#  Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def mock_containers():
    """Mock Cosmos containers for sessions and birds."""
    sessions = MagicMock()
    birds = MagicMock()
    # Default total species count
    birds.query_items.return_value = [500]
    with (
        patch(
            "app.services.stats_service.get_sessions_container",
            return_value=sessions,
        ),
        patch("app.services.stats_service.get_birds_container", return_value=birds),
    ):
        yield sessions, birds


@pytest.fixture(autouse=True)
def clear_stats_cache():
    """Clear the in-memory stats cache between tests."""
    from app.services.stats_service import _cache_lock, _stats_cache

    with _cache_lock:
        _stats_cache.clear()
    yield
    with _cache_lock:
        _stats_cache.clear()


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


# ===================================================================
#  Model validation
# ===================================================================


class TestSessionModels:
    def test_valid_session_request(self):
        from app.models.session import AnswerRecord, SessionCreateRequest

        req = SessionCreateRequest(
            quiz_mode="flashcard",
            started_at=_ts(0, 11),
            completed_at=_ts(0, 12),
            answers=[
                AnswerRecord(species_code="norcar", result="correct", time_ms=3000),
                AnswerRecord(species_code="baleag1", result="incorrect", time_ms=5000),
            ],
        )
        assert len(req.answers) == 2

    def test_empty_answers_rejected(self):
        from app.models.session import SessionCreateRequest

        with pytest.raises(Exception):
            SessionCreateRequest(
                quiz_mode="flashcard",
                started_at=_ts(),
                completed_at=_ts(),
                answers=[],
            )

    def test_invalid_species_code_rejected(self):
        from app.models.session import AnswerRecord

        with pytest.raises(Exception):
            AnswerRecord(species_code="INVALID!!!", result="correct", time_ms=1000)

    def test_multiple_choice_with_options(self):
        from app.models.session import AnswerRecord

        a = AnswerRecord(
            species_code="norcar",
            result="incorrect",
            time_ms=4000,
            presented_options=["norcar", "scartan", "sumtan1"],
            selected_code="scartan",
        )
        assert a.selected_code == "scartan"
        assert len(a.presented_options) == 3  # type: ignore[arg-type]

    def test_answer_result_values(self):
        from app.models.session import AnswerRecord

        for result in ("correct", "incorrect", "skipped"):
            a = AnswerRecord(species_code="norcar", result=result, time_ms=1000)  # type: ignore[arg-type]
            assert a.result == result

    def test_invalid_timestamp_rejected(self):
        from app.models.session import AnswerRecord, SessionCreateRequest

        with pytest.raises(Exception):
            SessionCreateRequest(
                quiz_mode="flashcard",
                started_at="not-a-date",
                completed_at=_ts(),
                answers=[
                    AnswerRecord(species_code="norcar", result="correct", time_ms=1000)
                ],
            )


# ===================================================================
#  Session persistence
# ===================================================================


class TestCreateSession:
    def test_create_session(self, mock_containers):
        sessions, _birds = mock_containers
        sessions.create_item.return_value = {}

        from app.models.session import AnswerRecord, SessionCreateRequest
        from app.services.stats_service import create_session

        req = SessionCreateRequest(
            quiz_mode="multiple_choice",
            started_at=_ts(0, 11),
            completed_at=_ts(0, 12),
            region_code="US-CA",
            difficulty="medium",
            answers=[
                AnswerRecord(species_code="norcar", result="correct", time_ms=3000),
                AnswerRecord(species_code="baleag1", result="correct", time_ms=4000),
                AnswerRecord(species_code="rthhum", result="incorrect", time_ms=6000),
            ],
        )
        result = create_session("testuser123", req)
        assert result.total_answers == 3
        assert result.correct_count == 2
        assert abs(result.accuracy - 2 / 3) < 0.01
        sessions.create_item.assert_called_once()

    def test_session_returns_zero_accuracy_for_all_wrong(self, mock_containers):
        sessions, _birds = mock_containers
        sessions.create_item.return_value = {}

        from app.models.session import AnswerRecord, SessionCreateRequest
        from app.services.stats_service import create_session

        req = SessionCreateRequest(
            quiz_mode="flashcard",
            started_at=_ts(),
            completed_at=_ts(),
            answers=[
                AnswerRecord(species_code="norcar", result="incorrect", time_ms=5000),
            ],
        )
        result = create_session("testuser123", req)
        assert result.accuracy == 0.0


# ===================================================================
#  Species stats
# ===================================================================


class TestSpeciesStats:
    def test_per_species_accuracy(self, mock_containers):
        sessions, _birds = mock_containers
        sessions.query_items.return_value = [
            _make_session(
                answers=[
                    {"species_code": "norcar", "result": "correct", "time_ms": 2000},
                    {"species_code": "norcar", "result": "correct", "time_ms": 3000},
                    {
                        "species_code": "baleag1",
                        "result": "incorrect",
                        "time_ms": 5000,
                    },
                ]
            )
        ]

        from app.services.stats_service import get_species_stats

        stats = get_species_stats("testuser123")
        assert len(stats) == 2

        norcar = next(s for s in stats if s.species_code == "norcar")
        assert norcar.attempts == 2
        assert norcar.correct == 2
        assert norcar.accuracy == 1.0
        assert norcar.avg_time_ms == 2500.0

        baleag = next(s for s in stats if s.species_code == "baleag1")
        assert baleag.attempts == 1
        assert baleag.accuracy == 0.0

    def test_mastery_tiers(self, mock_containers):
        sessions, _birds = mock_containers

        # Build a session with many correct answers for norcar
        answers = [
            {"species_code": "norcar", "result": "correct", "time_ms": 2000}
        ] * 25
        sessions.query_items.return_value = [_make_session(answers=answers)]

        from app.services.stats_service import get_species_stats

        stats = get_species_stats("testuser123")
        norcar = stats[0]
        assert norcar.mastery == "master"

    def test_mastery_unfamiliar(self, mock_containers):
        sessions, _birds = mock_containers
        sessions.query_items.return_value = [
            _make_session(
                answers=[
                    {
                        "species_code": "norcar",
                        "result": "incorrect",
                        "time_ms": 5000,
                    }
                ]
            )
        ]

        from app.services.stats_service import get_species_stats

        stats = get_species_stats("testuser123")
        assert stats[0].mastery == "unfamiliar"

    def test_single_species_stats(self, mock_containers):
        sessions, _birds = mock_containers
        sessions.query_items.return_value = [
            _make_session(
                answers=[
                    {"species_code": "norcar", "result": "correct", "time_ms": 2000},
                    {"species_code": "baleag1", "result": "correct", "time_ms": 3000},
                ]
            )
        ]

        from app.services.stats_service import get_single_species_stats

        result = get_single_species_stats("testuser123", "norcar")
        assert result is not None
        assert result.species_code == "norcar"

    def test_single_species_not_found(self, mock_containers):
        sessions, _birds = mock_containers
        sessions.query_items.return_value = []

        from app.services.stats_service import get_single_species_stats

        result = get_single_species_stats("testuser123", "xyz123")
        assert result is None


# ===================================================================
#  Overview stats
# ===================================================================


class TestOverviewStats:
    def test_overview_computation(self, mock_containers):
        sessions, birds = mock_containers
        birds.query_items.return_value = [500]

        today_session = _make_session(
            days_ago=0,
            answers=[
                {"species_code": "norcar", "result": "correct", "time_ms": 2000},
                {"species_code": "baleag1", "result": "correct", "time_ms": 3000},
                {"species_code": "rthhum", "result": "incorrect", "time_ms": 5000},
            ],
        )
        sessions.query_items.return_value = [today_session]

        from app.services.stats_service import get_overview

        overview = get_overview("testuser123")
        assert overview.life_list_count == 2  # norcar + baleag1
        assert overview.total_species_available == 500
        assert overview.total_sessions == 1
        assert overview.total_answers == 3
        assert abs(overview.overall_accuracy - 2 / 3) < 0.01
        # life_list_pct is a fraction 0–1 (2 of 500 species), not 0–100
        assert overview.life_list_pct == round(2 / 500, 4)
        assert 0.0 <= overview.life_list_pct <= 1.0

    def test_empty_overview(self, mock_containers):
        sessions, birds = mock_containers
        birds.query_items.return_value = [500]
        sessions.query_items.return_value = []

        from app.services.stats_service import get_overview

        overview = get_overview("testuser123")
        assert overview.life_list_count == 0
        assert overview.total_sessions == 0
        assert overview.overall_accuracy == 0.0
        assert overview.life_list_pct == 0.0
        assert overview.current_streak == 0
        assert overview.daily_practice_streak == 0

    def test_daily_streak(self, mock_containers):
        sessions, birds = mock_containers
        birds.query_items.return_value = [100]

        # 3 consecutive days of play
        session_list = [
            _make_session(
                days_ago=0,
                answers=[
                    {"species_code": "norcar", "result": "correct", "time_ms": 2000},
                ],
            ),
            _make_session(
                days_ago=1,
                answers=[
                    {"species_code": "norcar", "result": "correct", "time_ms": 2000},
                ],
            ),
            _make_session(
                days_ago=2,
                answers=[
                    {"species_code": "norcar", "result": "correct", "time_ms": 2000},
                ],
            ),
        ]
        sessions.query_items.return_value = session_list

        from app.services.stats_service import get_overview

        overview = get_overview("testuser123")
        assert overview.daily_practice_streak == 3

    def test_answer_streak(self, mock_containers):
        sessions, birds = mock_containers
        birds.query_items.return_value = [100]

        sessions.query_items.return_value = [
            _make_session(
                answers=[
                    {"species_code": "norcar", "result": "correct", "time_ms": 2000},
                    {"species_code": "baleag1", "result": "correct", "time_ms": 2000},
                    {"species_code": "rthhum", "result": "correct", "time_ms": 2000},
                ]
            )
        ]

        from app.services.stats_service import get_overview

        overview = get_overview("testuser123")
        assert overview.current_streak == 3
        assert overview.longest_streak == 3


# ===================================================================
#  Trends
# ===================================================================


class TestTrends:
    def test_daily_trend_points(self, mock_containers):
        sessions, _birds = mock_containers

        sessions.query_items.return_value = [
            _make_session(
                days_ago=0,
                answers=[
                    {"species_code": "norcar", "result": "correct", "time_ms": 2000},
                ],
            ),
            _make_session(
                days_ago=1,
                answers=[
                    {"species_code": "baleag1", "result": "incorrect", "time_ms": 4000},
                ],
            ),
        ]

        from app.services.stats_service import get_trends

        trends = get_trends("testuser123", days=7)
        assert len(trends.daily) == 2
        # Oldest first
        assert trends.daily[0].accuracy == 0.0  # day 1 — incorrect
        assert trends.daily[1].accuracy == 1.0  # day 0 — correct

    def test_quiz_mode_breakdown(self, mock_containers):
        sessions, _birds = mock_containers

        sessions.query_items.return_value = [
            _make_session(
                quiz_mode="flashcard",
                answers=[
                    {"species_code": "norcar", "result": "correct", "time_ms": 2000},
                    {"species_code": "baleag1", "result": "correct", "time_ms": 2000},
                ],
            ),
            _make_session(
                quiz_mode="audio",
                answers=[
                    {"species_code": "norcar", "result": "incorrect", "time_ms": 5000},
                ],
            ),
        ]

        from app.services.stats_service import get_trends

        trends = get_trends("testuser123")
        modes = {m.mode: m for m in trends.by_quiz_mode}
        assert modes["flashcard"].accuracy == 1.0
        assert modes["audio"].accuracy == 0.0

    def test_regional_breakdown(self, mock_containers):
        sessions, _birds = mock_containers

        sessions.query_items.return_value = [
            _make_session(
                region_code="US-CA",
                answers=[
                    {"species_code": "norcar", "result": "correct", "time_ms": 2000},
                ],
            ),
            _make_session(
                region_code="US-WA",
                answers=[
                    {"species_code": "baleag1", "result": "incorrect", "time_ms": 5000},
                ],
            ),
        ]

        from app.services.stats_service import get_trends

        trends = get_trends("testuser123")
        regions = {r.region_code: r for r in trends.by_region}
        assert regions["US-CA"].accuracy == 1.0
        assert regions["US-WA"].accuracy == 0.0

    def test_difficulty_breakdown(self, mock_containers):
        sessions, _birds = mock_containers

        sessions.query_items.return_value = [
            _make_session(
                difficulty="easy",
                answers=[
                    {"species_code": "norcar", "result": "correct", "time_ms": 2000},
                ],
            ),
            _make_session(
                difficulty="hard",
                answers=[
                    {"species_code": "baleag1", "result": "incorrect", "time_ms": 5000},
                ],
            ),
        ]

        from app.services.stats_service import get_trends

        trends = get_trends("testuser123")
        diffs = {d.difficulty: d for d in trends.by_difficulty}
        assert diffs["easy"].accuracy == 1.0
        assert diffs["hard"].accuracy == 0.0


# ===================================================================
#  Confusions
# ===================================================================


class TestConfusions:
    def test_confusion_pairs(self, mock_containers):
        sessions, _birds = mock_containers

        sessions.query_items.return_value = [
            _make_session(
                quiz_mode="multiple_choice",
                answers=[
                    {
                        "species_code": "norcar",
                        "result": "incorrect",
                        "time_ms": 5000,
                        "selected_code": "scartan",
                        "presented_options": ["norcar", "scartan", "sumtan1"],
                    },
                    {
                        "species_code": "norcar",
                        "result": "incorrect",
                        "time_ms": 4500,
                        "selected_code": "scartan",
                        "presented_options": ["norcar", "scartan", "sumtan1"],
                    },
                    {
                        "species_code": "baleag1",
                        "result": "incorrect",
                        "time_ms": 6000,
                        "selected_code": "goleag",
                        "presented_options": ["baleag1", "goleag"],
                    },
                ],
            )
        ]

        from app.services.stats_service import get_confusions

        confusions = get_confusions("testuser123")
        assert len(confusions) == 2
        # Most frequent first
        assert confusions[0].target_code == "norcar"
        assert confusions[0].confused_with == "scartan"
        assert confusions[0].occurrences == 2
        assert confusions[1].target_code == "baleag1"
        assert confusions[1].confused_with == "goleag"

    def test_no_confusions_when_all_correct(self, mock_containers):
        sessions, _birds = mock_containers

        sessions.query_items.return_value = [
            _make_session(
                answers=[
                    {"species_code": "norcar", "result": "correct", "time_ms": 2000},
                ]
            )
        ]

        from app.services.stats_service import get_confusions

        confusions = get_confusions("testuser123")
        assert len(confusions) == 0

    def test_confusions_limit(self, mock_containers):
        sessions, _birds = mock_containers

        # Create many confusion pairs
        answers = []
        for i in range(30):
            answers.append(
                {
                    "species_code": f"sp{i:04d}",
                    "result": "incorrect",
                    "time_ms": 5000,
                    "selected_code": f"wrong{i:04d}",
                }
            )
        sessions.query_items.return_value = [_make_session(answers=answers)]

        from app.services.stats_service import get_confusions

        confusions = get_confusions("testuser123", limit=5)
        assert len(confusions) == 5


# ===================================================================
#  Caching
# ===================================================================


class TestCaching:
    def test_cache_is_used_on_second_call(self, mock_containers):
        sessions, _birds = mock_containers
        sessions.query_items.return_value = [
            _make_session(
                answers=[
                    {"species_code": "norcar", "result": "correct", "time_ms": 2000},
                ]
            )
        ]

        from app.services.stats_service import get_species_stats

        result1 = get_species_stats("testuser123")
        result2 = get_species_stats("testuser123")
        assert result1 == result2
        # query_items should only be called once thanks to cache
        assert sessions.query_items.call_count == 1

    def test_cache_invalidated_after_new_session(self, mock_containers):
        sessions, _birds = mock_containers
        sessions.query_items.return_value = [
            _make_session(
                answers=[
                    {"species_code": "norcar", "result": "correct", "time_ms": 2000},
                ]
            )
        ]
        sessions.create_item.return_value = {}

        from app.models.session import AnswerRecord, SessionCreateRequest
        from app.services.stats_service import create_session, get_species_stats

        # Prime cache
        get_species_stats("testuser123")
        assert sessions.query_items.call_count == 1

        # Submit new session — should invalidate cache
        create_session(
            "testuser123",
            SessionCreateRequest(
                quiz_mode="flashcard",
                started_at=_ts(),
                completed_at=_ts(),
                answers=[
                    AnswerRecord(species_code="norcar", result="correct", time_ms=2000)
                ],
            ),
        )

        # Next call should hit DB again
        get_species_stats("testuser123")
        assert sessions.query_items.call_count == 2


# ===================================================================
#  Router integration tests
# ===================================================================


class TestStatsEndpoints:
    def test_submit_session_endpoint(self, client, mock_containers):
        sessions, _birds = mock_containers
        sessions.create_item.return_value = {}

        resp = client.post(
            "/api/v1/stats/sessions",
            json={
                "quiz_mode": "flashcard",
                "started_at": _ts(0, 11),
                "completed_at": _ts(0, 12),
                "answers": [
                    {"species_code": "norcar", "result": "correct", "time_ms": 3000},
                    {
                        "species_code": "baleag1",
                        "result": "incorrect",
                        "time_ms": 5000,
                    },
                ],
            },
            headers=_auth_headers(),
        )
        assert resp.status_code == 201
        data = resp.json()
        assert data["total_answers"] == 2
        assert data["correct_count"] == 1

    def test_submit_session_requires_auth(self, client, mock_containers):
        resp = client.post(
            "/api/v1/stats/sessions",
            json={
                "quiz_mode": "flashcard",
                "started_at": _ts(),
                "completed_at": _ts(),
                "answers": [
                    {"species_code": "norcar", "result": "correct", "time_ms": 3000}
                ],
            },
        )
        assert resp.status_code in (401, 403)

    def test_overview_endpoint(self, client, mock_containers):
        sessions, birds = mock_containers
        birds.query_items.return_value = [500]
        sessions.query_items.return_value = [
            _make_session(
                answers=[
                    {"species_code": "norcar", "result": "correct", "time_ms": 2000},
                ]
            )
        ]

        resp = client.get("/api/v1/stats/overview", headers=_auth_headers())
        assert resp.status_code == 200
        data = resp.json()
        assert data["life_list_count"] == 1
        assert data["total_sessions"] == 1

    def test_species_list_endpoint(self, client, mock_containers):
        sessions, _birds = mock_containers
        sessions.query_items.return_value = [
            _make_session(
                answers=[
                    {"species_code": "norcar", "result": "correct", "time_ms": 2000},
                    {
                        "species_code": "baleag1",
                        "result": "incorrect",
                        "time_ms": 5000,
                    },
                ]
            )
        ]

        resp = client.get("/api/v1/stats/species", headers=_auth_headers())
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) == 2
        # Default sort: worst accuracy first
        assert data[0]["accuracy"] <= data[1]["accuracy"]

    def test_species_detail_endpoint(self, client, mock_containers):
        sessions, _birds = mock_containers
        sessions.query_items.return_value = [
            _make_session(
                answers=[
                    {"species_code": "norcar", "result": "correct", "time_ms": 2000},
                ]
            )
        ]

        resp = client.get("/api/v1/stats/species/norcar", headers=_auth_headers())
        assert resp.status_code == 200
        assert resp.json()["species_code"] == "norcar"

    def test_species_detail_not_found(self, client, mock_containers):
        sessions, _birds = mock_containers
        sessions.query_items.return_value = []

        resp = client.get("/api/v1/stats/species/xyz123", headers=_auth_headers())
        assert resp.status_code == 404

    def test_trends_endpoint(self, client, mock_containers):
        sessions, _birds = mock_containers
        sessions.query_items.return_value = [
            _make_session(
                days_ago=0,
                answers=[
                    {"species_code": "norcar", "result": "correct", "time_ms": 2000},
                ],
            )
        ]

        resp = client.get("/api/v1/stats/trends", headers=_auth_headers())
        assert resp.status_code == 200
        data = resp.json()
        assert "daily" in data
        assert "by_quiz_mode" in data

    def test_confusions_endpoint(self, client, mock_containers):
        sessions, _birds = mock_containers
        sessions.query_items.return_value = [
            _make_session(
                answers=[
                    {
                        "species_code": "norcar",
                        "result": "incorrect",
                        "time_ms": 5000,
                        "selected_code": "scartan",
                    },
                ]
            )
        ]

        resp = client.get("/api/v1/stats/confusions", headers=_auth_headers())
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) == 1
        assert data[0]["target_code"] == "norcar"
        assert data[0]["confused_with"] == "scartan"

    def test_all_endpoints_require_auth(self, client, mock_containers):
        """All stats endpoints should reject unauthenticated requests."""
        endpoints = [
            ("GET", "/api/v1/stats/overview"),
            ("GET", "/api/v1/stats/species"),
            ("GET", "/api/v1/stats/species/norcar"),
            ("GET", "/api/v1/stats/trends"),
            ("GET", "/api/v1/stats/confusions"),
        ]
        for method, url in endpoints:
            resp = getattr(client, method.lower())(url)
            assert resp.status_code in (401, 403), f"{method} {url} should require auth"
