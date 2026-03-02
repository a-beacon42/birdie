"""Tests for user account service — registration, auth, password, deletion."""

import time
from datetime import datetime, timezone, timedelta
from unittest.mock import MagicMock, patch

import jwt
import pytest
from azure.cosmos.exceptions import (
    CosmosResourceExistsError,
    CosmosResourceNotFoundError,
)


# ---------------------------------------------------------------------------
#  Helpers
# ---------------------------------------------------------------------------

# Deterministic test encryption key (32 bytes = 64 hex chars)
_TEST_ENCRYPTION_KEY = "a" * 64


def _make_test_settings(**overrides):
    """Return a patched Settings object suitable for user-service tests."""
    from app.config import Settings

    s = Settings()
    s.email_encryption_key = _TEST_ENCRYPTION_KEY
    s.api_key = "test-api-key-12345"
    s.bcrypt_rounds = 4  # fast for tests
    s.max_failed_logins = 3
    s.lockout_duration_minutes = 15
    for k, v in overrides.items():
        setattr(s, k, v)
    return s


@pytest.fixture
def mock_settings():
    s = _make_test_settings()
    with (
        patch("app.services.user_service.settings", s),
        patch("app.dependencies.auth.settings", s),
        patch("app.routers.auth.settings", s),
    ):
        yield s


@pytest.fixture
def mock_containers():
    """Return mock Cosmos containers for users, decks, and sessions."""
    users = MagicMock()
    decks = MagicMock()
    sessions = MagicMock()
    with (
        patch("app.services.user_service.get_users_container", return_value=users),
        patch("app.services.user_service.get_decks_container", return_value=decks),
        patch(
            "app.services.user_service.get_sessions_container", return_value=sessions
        ),
    ):
        yield users, decks, sessions


# ---------------------------------------------------------------------------
#  Password hashing
# ---------------------------------------------------------------------------


class TestPasswordHashing:
    def test_hash_and_verify(self, mock_settings):
        from app.services.user_service import hash_password, verify_password

        pw = "securePass123"
        hashed = hash_password(pw)
        assert hashed != pw
        assert verify_password(pw, hashed)

    def test_wrong_password_fails(self, mock_settings):
        from app.services.user_service import hash_password, verify_password

        hashed = hash_password("correctPass1")
        assert not verify_password("wrongPass123", hashed)

    def test_long_password_not_truncated(self, mock_settings):
        """Passwords > 72 chars should still work due to SHA-256 pre-hash."""
        from app.services.user_service import hash_password, verify_password

        long_pw = "a" * 100 + "1"
        hashed = hash_password(long_pw)
        assert verify_password(long_pw, hashed)
        # A truncated version should NOT match
        assert not verify_password("a" * 72, hashed)


# ---------------------------------------------------------------------------
#  Email encryption
# ---------------------------------------------------------------------------


class TestEmailEncryption:
    def test_round_trip(self, mock_settings):
        from app.services.user_service import encrypt_email, decrypt_email

        email = "birder@example.com"
        ct, iv, tag = encrypt_email(email)
        assert ct != email
        assert decrypt_email(ct, iv, tag) == email

    def test_different_emails_different_ciphertext(self, mock_settings):
        from app.services.user_service import encrypt_email

        ct1, _, _ = encrypt_email("a@example.com")
        ct2, _, _ = encrypt_email("b@example.com")
        assert ct1 != ct2

    def test_missing_key_raises(self):
        from app.config import Settings

        s = Settings()
        s.email_encryption_key = ""
        with patch("app.services.user_service.settings", s):
            from app.services.user_service import encrypt_email

            with pytest.raises(RuntimeError, match="EMAIL_ENCRYPTION_KEY"):
                encrypt_email("test@example.com")


# ---------------------------------------------------------------------------
#  User ID derivation
# ---------------------------------------------------------------------------


class TestEmailToUserId:
    def test_deterministic(self, mock_settings):
        from app.services.user_service import email_to_user_id

        assert email_to_user_id("Test@Example.COM") == email_to_user_id(
            "test@example.com"
        )

    def test_different_emails_different_ids(self, mock_settings):
        from app.services.user_service import email_to_user_id

        assert email_to_user_id("a@example.com") != email_to_user_id("b@example.com")


# ---------------------------------------------------------------------------
#  User creation
# ---------------------------------------------------------------------------


class TestCreateUser:
    def test_successful_creation(self, mock_settings, mock_containers):
        users, _, _ = mock_containers
        users.read_item.side_effect = CosmosResourceNotFoundError(
            status_code=404, message="Not found"
        )
        users.create_item.return_value = {}

        from app.services.user_service import create_user

        result = create_user("new@example.com", "strongPass123")
        assert result.account_tier == "free"
        assert result.max_saved_decks == 5
        users.create_item.assert_called_once()

    def test_duplicate_email_rejected(self, mock_settings, mock_containers):
        users, _, _ = mock_containers
        users.read_item.return_value = {"id": "existing"}

        from app.services.user_service import create_user

        with pytest.raises(ValueError, match="already exists"):
            create_user("existing@example.com", "strongPass123")

    def test_common_password_rejected(self, mock_settings, mock_containers):
        from app.services.user_service import create_user

        with pytest.raises(ValueError, match="too common"):
            create_user("new@example.com", "password123")

    def test_cosmos_conflict_handled(self, mock_settings, mock_containers):
        users, _, _ = mock_containers
        users.read_item.side_effect = CosmosResourceNotFoundError(
            status_code=404, message="Not found"
        )
        users.create_item.side_effect = CosmosResourceExistsError(
            status_code=409, message="Conflict"
        )

        from app.services.user_service import create_user

        with pytest.raises(ValueError, match="already exists"):
            create_user("race@example.com", "strongPass123")


# ---------------------------------------------------------------------------
#  Authentication
# ---------------------------------------------------------------------------


class TestAuthentication:
    def _make_user_doc(
        self, mock_settings, email="user@example.com", password="securePass123"
    ):
        from app.services.user_service import (
            email_to_user_id,
            hash_password,
            encrypt_email,
        )

        uid = email_to_user_id(email)
        ct, iv, tag = encrypt_email(email)
        return {
            "id": uid,
            "email_encrypted": ct,
            "email_iv": iv,
            "email_tag": tag,
            "password_hash": hash_password(password),
            "created_at": datetime.now(timezone.utc).isoformat(),
            "account_tier": "free",
            "max_saved_decks": 5,
            "is_active": True,
            "failed_login_attempts": 0,
            "locked_until": None,
        }

    def test_valid_credentials(self, mock_settings, mock_containers):
        users, _, _ = mock_containers
        doc = self._make_user_doc(mock_settings)
        users.read_item.return_value = doc

        from app.services.user_service import authenticate_user

        result = authenticate_user("user@example.com", "securePass123")
        assert result["id"] == doc["id"]

    def test_wrong_password_rejected(self, mock_settings, mock_containers):
        users, _, _ = mock_containers
        doc = self._make_user_doc(mock_settings)
        users.read_item.return_value = doc

        from app.services.user_service import authenticate_user

        with pytest.raises(ValueError, match="Invalid email or password"):
            authenticate_user("user@example.com", "wrongPass1234")

    def test_nonexistent_email_rejected(self, mock_settings, mock_containers):
        users, _, _ = mock_containers
        users.read_item.side_effect = CosmosResourceNotFoundError(
            status_code=404, message="Not found"
        )

        from app.services.user_service import authenticate_user

        with pytest.raises(ValueError, match="Invalid email or password"):
            authenticate_user("nobody@example.com", "anyPass12345")

    def test_inactive_account_rejected(self, mock_settings, mock_containers):
        users, _, _ = mock_containers
        doc = self._make_user_doc(mock_settings)
        doc["is_active"] = False
        users.read_item.return_value = doc

        from app.services.user_service import authenticate_user

        with pytest.raises(ValueError, match="Invalid email or password"):
            authenticate_user("user@example.com", "securePass123")

    def test_locked_account_rejected(self, mock_settings, mock_containers):
        users, _, _ = mock_containers
        doc = self._make_user_doc(mock_settings)
        doc["locked_until"] = (
            datetime.now(timezone.utc) + timedelta(minutes=10)
        ).isoformat()
        users.read_item.return_value = doc

        from app.services.user_service import authenticate_user

        with pytest.raises(ValueError, match="temporarily locked"):
            authenticate_user("user@example.com", "securePass123")

    def test_failed_attempts_incremented(self, mock_settings, mock_containers):
        users, _, _ = mock_containers
        doc = self._make_user_doc(mock_settings)
        doc["failed_login_attempts"] = 0
        users.read_item.return_value = doc

        from app.services.user_service import authenticate_user

        with pytest.raises(ValueError):
            authenticate_user("user@example.com", "wrongPass1234")

        # upsert should have been called with incremented count
        upserted = users.upsert_item.call_args[1]["body"]
        assert upserted["failed_login_attempts"] == 1

    def test_lockout_after_max_failures(self, mock_settings, mock_containers):
        users, _, _ = mock_containers
        doc = self._make_user_doc(mock_settings)
        doc["failed_login_attempts"] = 2  # one more triggers lockout (max=3)
        users.read_item.return_value = doc

        from app.services.user_service import authenticate_user

        with pytest.raises(ValueError):
            authenticate_user("user@example.com", "wrongPass1234")

        upserted = users.upsert_item.call_args[1]["body"]
        assert upserted["failed_login_attempts"] == 3
        assert upserted["locked_until"] is not None

    def test_successful_login_resets_failed_attempts(
        self, mock_settings, mock_containers
    ):
        users, _, _ = mock_containers
        doc = self._make_user_doc(mock_settings)
        doc["failed_login_attempts"] = 2
        users.read_item.return_value = doc

        from app.services.user_service import authenticate_user

        authenticate_user("user@example.com", "securePass123")
        upserted = users.upsert_item.call_args[1]["body"]
        assert upserted["failed_login_attempts"] == 0
        assert upserted["locked_until"] is None


# ---------------------------------------------------------------------------
#  Password change
# ---------------------------------------------------------------------------


class TestChangePassword:
    def _make_user_doc(self, mock_settings):
        from app.services.user_service import email_to_user_id, hash_password

        return {
            "id": email_to_user_id("user@example.com"),
            "password_hash": hash_password("oldPassword1"),
            "is_active": True,
        }

    def test_successful_change(self, mock_settings, mock_containers):
        users, _, _ = mock_containers
        doc = self._make_user_doc(mock_settings)
        users.read_item.return_value = doc

        from app.services.user_service import change_password

        change_password(doc["id"], "oldPassword1", "newPassword2")
        users.upsert_item.assert_called_once()

    def test_wrong_current_password(self, mock_settings, mock_containers):
        users, _, _ = mock_containers
        doc = self._make_user_doc(mock_settings)
        users.read_item.return_value = doc

        from app.services.user_service import change_password

        with pytest.raises(ValueError, match="Current password is incorrect"):
            change_password(doc["id"], "wrongCurrent1", "newPassword2")

    def test_reuse_same_password(self, mock_settings, mock_containers):
        users, _, _ = mock_containers
        doc = self._make_user_doc(mock_settings)
        users.read_item.return_value = doc

        from app.services.user_service import change_password

        with pytest.raises(ValueError, match="must be different"):
            change_password(doc["id"], "oldPassword1", "oldPassword1")

    def test_common_new_password_rejected(self, mock_settings, mock_containers):
        users, _, _ = mock_containers
        doc = self._make_user_doc(mock_settings)
        users.read_item.return_value = doc

        from app.services.user_service import change_password

        with pytest.raises(ValueError, match="too common"):
            change_password(doc["id"], "oldPassword1", "password123")


# ---------------------------------------------------------------------------
#  Account deletion
# ---------------------------------------------------------------------------


class TestDeleteUser:
    def _make_user_doc(self, mock_settings):
        from app.services.user_service import email_to_user_id, hash_password

        return {
            "id": email_to_user_id("user@example.com"),
            "password_hash": hash_password("deleteMe123"),
            "is_active": True,
        }

    def test_successful_deletion_cascades(self, mock_settings, mock_containers):
        users, decks, sessions = mock_containers
        doc = self._make_user_doc(mock_settings)
        users.read_item.return_value = doc
        decks.query_items.return_value = [{"id": "deck-1"}, {"id": "deck-2"}]
        sessions.query_items.return_value = [{"id": "sess-1"}]

        from app.services.user_service import delete_user

        delete_user(doc["id"], "deleteMe123")

        # Verify cascade
        assert decks.delete_item.call_count == 2
        assert sessions.delete_item.call_count == 1
        users.delete_item.assert_called_once()

    def test_wrong_password_blocks_deletion(self, mock_settings, mock_containers):
        users, decks, sessions = mock_containers
        doc = self._make_user_doc(mock_settings)
        users.read_item.return_value = doc

        from app.services.user_service import delete_user

        with pytest.raises(ValueError, match="Password is incorrect"):
            delete_user(doc["id"], "wrongPass1234")

        # Nothing should have been deleted
        users.delete_item.assert_not_called()
        decks.delete_item.assert_not_called()

    def test_nonexistent_user(self, mock_settings, mock_containers):
        users, _, _ = mock_containers
        users.read_item.side_effect = CosmosResourceNotFoundError(
            status_code=404, message="Not found"
        )

        from app.services.user_service import delete_user

        with pytest.raises(ValueError, match="User not found"):
            delete_user("nonexistent", "anyPass12345")


# ---------------------------------------------------------------------------
#  Pydantic model validation
# ---------------------------------------------------------------------------


class TestUserModels:
    def test_valid_registration(self):
        from app.models.user import UserCreateRequest

        req = UserCreateRequest(email="test@example.com", password="goodPass123")
        assert req.email == "test@example.com"

    def test_email_normalised(self):
        from app.models.user import UserCreateRequest

        req = UserCreateRequest(email="  TEST@EXAMPLE.COM  ", password="goodPass123")
        assert req.email == "test@example.com"

    def test_invalid_email_rejected(self):
        from app.models.user import UserCreateRequest

        with pytest.raises(Exception):
            UserCreateRequest(email="not-an-email", password="goodPass123")

    def test_short_password_rejected(self):
        from app.models.user import UserCreateRequest

        with pytest.raises(Exception):
            UserCreateRequest(email="test@example.com", password="short1")

    def test_no_digit_password_rejected(self):
        from app.models.user import UserCreateRequest

        with pytest.raises(Exception):
            UserCreateRequest(email="test@example.com", password="allletttersonly")

    def test_no_letter_password_rejected(self):
        from app.models.user import UserCreateRequest

        with pytest.raises(Exception):
            UserCreateRequest(email="test@example.com", password="1234567890")


# ---------------------------------------------------------------------------
#  Auth dependency
# ---------------------------------------------------------------------------


class TestAuthDependency:
    def test_valid_user_jwt(self, mock_settings):
        """A JWT with a real user sub should be accepted."""
        import asyncio
        from app.dependencies.auth import get_current_user, AuthenticatedUser
        from fastapi.security import HTTPAuthorizationCredentials

        token = jwt.encode(
            {
                "iat": int(time.time()),
                "exp": int(time.time()) + 3600,
                "iss": "birdie-api",
                "sub": "abc123userid",
                "tier": "free",
            },
            "test-api-key-12345",
            algorithm="HS256",
        )
        creds = HTTPAuthorizationCredentials(scheme="Bearer", credentials=token)
        result = asyncio.get_event_loop().run_until_complete(
            get_current_user(bearer=creds)
        )
        assert isinstance(result, AuthenticatedUser)
        assert result.user_id == "abc123userid"
        assert result.tier == "free"

    def test_anonymous_jwt_rejected(self, mock_settings):
        """Anonymous tokens should not pass get_current_user."""
        import asyncio
        from app.dependencies.auth import get_current_user
        from fastapi.security import HTTPAuthorizationCredentials

        token = jwt.encode(
            {
                "iat": int(time.time()),
                "exp": int(time.time()) + 3600,
                "iss": "birdie-api",
                "sub": "anonymous",
            },
            "test-api-key-12345",
            algorithm="HS256",
        )
        creds = HTTPAuthorizationCredentials(scheme="Bearer", credentials=token)
        with pytest.raises(Exception):  # HTTPException 401
            asyncio.get_event_loop().run_until_complete(get_current_user(bearer=creds))

    def test_expired_jwt_rejected(self, mock_settings):
        """Expired JWTs should raise 401."""
        import asyncio
        from app.dependencies.auth import get_current_user
        from fastapi.security import HTTPAuthorizationCredentials

        token = jwt.encode(
            {
                "iat": 1000,
                "exp": 1001,
                "iss": "birdie-api",
                "sub": "abc123",
            },
            "test-api-key-12345",
            algorithm="HS256",
        )
        creds = HTTPAuthorizationCredentials(scheme="Bearer", credentials=token)
        with pytest.raises(Exception):
            asyncio.get_event_loop().run_until_complete(get_current_user(bearer=creds))

    def test_missing_bearer_rejected(self, mock_settings):
        import asyncio
        from app.dependencies.auth import get_current_user

        with pytest.raises(Exception):
            asyncio.get_event_loop().run_until_complete(get_current_user(bearer=None))

    def test_optional_user_returns_none_for_anonymous(self, mock_settings):
        import asyncio
        from app.dependencies.auth import get_optional_user
        from fastapi.security import HTTPAuthorizationCredentials

        token = jwt.encode(
            {
                "iat": int(time.time()),
                "exp": int(time.time()) + 3600,
                "iss": "birdie-api",
                "sub": "anonymous",
            },
            "test-api-key-12345",
            algorithm="HS256",
        )
        creds = HTTPAuthorizationCredentials(scheme="Bearer", credentials=token)
        result = asyncio.get_event_loop().run_until_complete(
            get_optional_user(bearer=creds)
        )
        assert result is None

    def test_optional_user_returns_none_for_missing(self, mock_settings):
        import asyncio
        from app.dependencies.auth import get_optional_user

        result = asyncio.get_event_loop().run_until_complete(
            get_optional_user(bearer=None)
        )
        assert result is None


# ---------------------------------------------------------------------------
#  Router endpoint integration tests
# ---------------------------------------------------------------------------


@pytest.fixture
def client(mock_settings):
    """Create a test client with user auth infrastructure mocked."""

    test_settings = _make_test_settings()

    with (
        patch("app.routers.auth.settings", test_settings),
        patch("app.routers.chat.settings", test_settings),
        patch("app.routers.birds.settings", test_settings),
        patch("app.routers.regions.settings", test_settings),
        patch("app.main.settings", test_settings),
        patch("app.dependencies.auth.settings", test_settings),
        patch("app.services.user_service.settings", test_settings),
        patch("app.services.cosmos.get_birds_container") as mock_birds,
    ):
        mock_birds.return_value = MagicMock()

        from app.main import app
        from fastapi.testclient import TestClient

        yield TestClient(app, raise_server_exceptions=False)


class TestRegisterEndpoint:
    def test_register_success(self, client, mock_containers):
        users, _, _ = mock_containers
        users.read_item.side_effect = CosmosResourceNotFoundError(
            status_code=404, message="Not found"
        )
        users.create_item.return_value = {}

        resp = client.post(
            "/api/v1/auth/register",
            json={"email": "new@example.com", "password": "strongPass123"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert "token" in data
        assert "user" in data
        assert data["user"]["account_tier"] == "free"

    def test_register_duplicate_email(self, client, mock_containers):
        users, _, _ = mock_containers
        users.read_item.return_value = {"id": "existing"}

        resp = client.post(
            "/api/v1/auth/register",
            json={"email": "existing@example.com", "password": "strongPass123"},
        )
        assert resp.status_code == 409

    def test_register_weak_password(self, client, mock_containers):
        resp = client.post(
            "/api/v1/auth/register",
            json={"email": "new@example.com", "password": "short"},
        )
        assert resp.status_code == 422  # Pydantic validation


class TestLoginEndpoint:
    def _register_and_get_doc(self, mock_settings, mock_containers):
        """Helper — create a user doc for login tests."""
        from app.services.user_service import (
            email_to_user_id,
            hash_password,
            encrypt_email,
        )

        email = "login@example.com"
        uid = email_to_user_id(email)
        ct, iv, tag = encrypt_email(email)
        return {
            "id": uid,
            "email_encrypted": ct,
            "email_iv": iv,
            "email_tag": tag,
            "password_hash": hash_password("loginPass123"),
            "created_at": datetime.now(timezone.utc).isoformat(),
            "account_tier": "free",
            "max_saved_decks": 5,
            "is_active": True,
            "failed_login_attempts": 0,
            "locked_until": None,
        }

    def test_login_success(self, client, mock_settings, mock_containers):
        users, _, _ = mock_containers
        doc = self._register_and_get_doc(mock_settings, mock_containers)
        users.read_item.return_value = doc

        resp = client.post(
            "/api/v1/auth/login",
            json={"email": "login@example.com", "password": "loginPass123"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert "token" in data
        assert data["user"]["account_tier"] == "free"

    def test_login_wrong_password(self, client, mock_settings, mock_containers):
        users, _, _ = mock_containers
        doc = self._register_and_get_doc(mock_settings, mock_containers)
        users.read_item.return_value = doc

        resp = client.post(
            "/api/v1/auth/login",
            json={"email": "login@example.com", "password": "wrongPass1234"},
        )
        assert resp.status_code == 401


class TestProtectedEndpoints:
    def _make_user_token(self, user_id="testuser123", tier="free"):
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

    def test_me_requires_auth(self, client, mock_containers):
        resp = client.get("/api/v1/auth/me")
        assert resp.status_code in (401, 403)

    def test_me_returns_profile(self, client, mock_containers):
        users, _, _ = mock_containers
        users.read_item.return_value = {
            "id": "testuser123",
            "created_at": "2026-03-01T00:00:00+00:00",
            "account_tier": "free",
            "max_saved_decks": 5,
        }
        # Need to patch get_user since it's called by the me endpoint
        with patch(
            "app.routers.auth.get_user",
            return_value={
                "id": "testuser123",
                "created_at": "2026-03-01T00:00:00+00:00",
                "account_tier": "free",
                "max_saved_decks": 5,
            },
        ):
            token = self._make_user_token()
            resp = client.get(
                "/api/v1/auth/me",
                headers={"Authorization": f"Bearer {token}"},
            )
            assert resp.status_code == 200
            data = resp.json()
            assert data["id"] == "testuser123"
            assert data["account_tier"] == "free"

    def test_me_rejects_anonymous_token(self, client, mock_containers):
        token = jwt.encode(
            {
                "iat": int(time.time()),
                "exp": int(time.time()) + 3600,
                "iss": "birdie-api",
                "sub": "anonymous",
            },
            "test-api-key-12345",
            algorithm="HS256",
        )
        resp = client.get(
            "/api/v1/auth/me",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 401

    def test_change_password_requires_auth(self, client, mock_containers):
        resp = client.post(
            "/api/v1/auth/change-password",
            json={"current_password": "old1234567", "new_password": "new12345678"},
        )
        assert resp.status_code in (401, 403)

    def test_delete_account_requires_auth(self, client, mock_containers):
        resp = client.request(
            "DELETE",
            "/api/v1/auth/account",
            json={"password": "test1234567"},
        )
        # FastAPI may return 401 or 403 depending on how the middleware processes it
        assert resp.status_code in (401, 403)


class TestAnonymousTokenStillWorks:
    """Ensure the existing anonymous token flow is not broken."""

    def test_anonymous_token_issued(self, client, mock_containers):
        resp = client.post("/api/v1/auth/token")
        assert resp.status_code == 200
        data = resp.json()
        assert "token" in data
        assert data["expires_in"] == 3600

    def test_anonymous_token_has_correct_sub(self, client, mock_containers):
        resp = client.post("/api/v1/auth/token")
        token = resp.json()["token"]
        decoded = jwt.decode(
            token, "test-api-key-12345", algorithms=["HS256"], issuer="birdie-api"
        )
        assert decoded["sub"] == "anonymous"
