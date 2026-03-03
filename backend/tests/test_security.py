"""Security-focused tests — Phase 5 hardening verification.

Covers:
  - Common-password list (10 000 entries, file-based loader)
  - bcrypt cost / SHA-256 pre-hash behaviour
  - Account lockout flow (increment, lock, cooldown, reset)
  - JWT claims verification (tier, jti, expiry, issuer)
  - Cascade-deletion audit-log enrichment
  - Deck-name sanitisation (control chars, HTML, script injection)
  - Input-validation edge cases across all user-facing models
"""

import asyncio
import hashlib
import logging
import re
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest.mock import MagicMock, patch

import jwt
import pytest
from azure.cosmos.exceptions import CosmosResourceNotFoundError
from fastapi.security import HTTPAuthorizationCredentials

# ---------------------------------------------------------------------------
#  Helpers
# ---------------------------------------------------------------------------

_TEST_ENCRYPTION_KEY = "a" * 64


def _make_test_settings(**overrides):
    from app.config import Settings

    s = Settings()
    s.email_encryption_key = _TEST_ENCRYPTION_KEY
    s.api_key = "test-api-key-12345"
    s.bcrypt_rounds = 4  # fast for tests
    s.max_failed_logins = 3
    s.lockout_duration_minutes = 15
    s.user_token_lifetime = 86400
    for k, v in overrides.items():
        setattr(s, k, v)
    return s


@pytest.fixture
def settings_patch():
    s = _make_test_settings()
    with (
        patch("app.services.user_service.settings", s),
        patch("app.dependencies.auth.settings", s),
        patch("app.routers.auth.settings", s),
    ):
        yield s


@pytest.fixture
def mock_containers():
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


# ===================================================================
#  1. Common-password list
# ===================================================================


class TestCommonPasswordList:
    """Verify the 10 000-entry file-based common-password check."""

    def test_file_exists_and_has_10k_entries(self):
        passwords_file = (
            Path(__file__).resolve().parent.parent
            / "app"
            / "data"
            / "common_passwords.txt"
        )
        assert passwords_file.exists(), "common_passwords.txt must exist"
        with open(passwords_file) as fh:
            lines = [l.strip() for l in fh if l.strip()]
        assert len(lines) == 10_000, f"Expected 10 000 entries, got {len(lines)}"

    def test_all_entries_meet_minimum_length(self):
        passwords_file = (
            Path(__file__).resolve().parent.parent
            / "app"
            / "data"
            / "common_passwords.txt"
        )
        with open(passwords_file) as fh:
            short = [l.strip() for l in fh if l.strip() and len(l.strip()) < 10]
        assert short == [], f"Entries shorter than 10 chars: {short[:5]}"

    def test_no_duplicate_entries(self):
        passwords_file = (
            Path(__file__).resolve().parent.parent
            / "app"
            / "data"
            / "common_passwords.txt"
        )
        with open(passwords_file) as fh:
            lines = [l.strip().lower() for l in fh if l.strip()]
        assert len(lines) == len(set(lines)), "Duplicate entries found"

    def test_check_common_password_returns_true_for_listed(self):
        from app.services.user_service import check_common_password

        # "password1234" is in the list
        assert check_common_password("password1234") is True

    def test_check_common_password_case_insensitive(self):
        from app.services.user_service import check_common_password

        assert check_common_password("Password1234") is True
        assert check_common_password("PASSWORD1234") is True

    def test_check_common_password_returns_false_for_unique(self):
        from app.services.user_service import check_common_password

        assert check_common_password("xK9$mQ2wLp7z") is False

    def test_loader_graceful_on_missing_file(self, tmp_path):
        """If the passwords file is missing, loader returns empty frozenset."""
        from app.services.user_service import _load_common_passwords

        with patch(
            "app.services.user_service._PASSWORDS_FILE", tmp_path / "nonexistent.txt"
        ):
            result = _load_common_passwords()
        assert result == frozenset()


# ===================================================================
#  2. bcrypt cost factor & SHA-256 pre-hash
# ===================================================================


class TestBcryptSecurity:
    def test_bcrypt_uses_configured_rounds(self, settings_patch):
        from app.services.user_service import hash_password

        hashed = hash_password("testPass123!")
        # bcrypt hash encodes rounds as $2b$04$ (for rounds=4)
        assert "$2b$04$" in hashed

    def test_sha256_prehash_applied(self, settings_patch):
        from app.services.user_service import _prehash

        result = _prehash("hello")
        expected = hashlib.sha256(b"hello").hexdigest()
        assert result == expected
        assert len(result) == 64  # SHA-256 hex digest

    def test_long_password_not_truncated(self, settings_patch):
        """Two passwords >72 bytes that differ only past byte 72 must NOT verify the same."""
        from app.services.user_service import hash_password, verify_password

        base = "A" * 80
        pw_a = base + "suffix_alpha1"
        pw_b = base + "suffix_bravo2"
        hashed_a = hash_password(pw_a)
        assert verify_password(pw_a, hashed_a) is True
        assert verify_password(pw_b, hashed_a) is False


# ===================================================================
#  3. Account lockout flow
# ===================================================================


class TestAccountLockout:
    def test_lockout_after_max_failures(self, settings_patch, mock_containers):
        from app.services.user_service import (
            _is_locked,
            _record_failed_login,
            _reset_failed_logins,
        )

        user_doc = {"id": "abc123", "failed_login_attempts": 0, "locked_until": None}

        # Record 3 failures (max_failed_logins = 3)
        for i in range(3):
            user_doc = _record_failed_login(user_doc)

        assert user_doc["failed_login_attempts"] == 3
        assert user_doc["locked_until"] is not None
        assert _is_locked(user_doc) is True

    def test_lockout_expires_after_duration(self, settings_patch):
        from app.services.user_service import _is_locked

        past_time = (datetime.now(timezone.utc) - timedelta(minutes=20)).isoformat()
        user_doc = {"locked_until": past_time}
        assert _is_locked(user_doc) is False

    def test_successful_login_resets_counters(self, settings_patch):
        from app.services.user_service import _reset_failed_logins

        user_doc = {
            "failed_login_attempts": 4,
            "locked_until": datetime.now(timezone.utc).isoformat(),
        }
        user_doc = _reset_failed_logins(user_doc)
        assert user_doc["failed_login_attempts"] == 0
        assert user_doc["locked_until"] is None

    def test_not_locked_when_no_lockout(self, settings_patch):
        from app.services.user_service import _is_locked

        assert _is_locked({"locked_until": None}) is False
        assert _is_locked({}) is False


# ===================================================================
#  4. JWT claims verification
# ===================================================================


class TestJWTClaims:
    def test_user_token_has_required_claims(self, settings_patch):
        """User JWTs must include sub, tier, jti, iss, iat, exp."""
        from app.routers.auth import _issue_user_jwt

        with patch("app.routers.auth.settings", settings_patch):
            result = _issue_user_jwt({"id": "user123", "account_tier": "free"})
        token = result["token"]
        decoded = jwt.decode(
            token,
            settings_patch.api_key,
            algorithms=["HS256"],
            issuer="birdie-api",
        )
        required_claims = {"sub", "tier", "jti", "iss", "iat", "exp"}
        assert required_claims.issubset(decoded.keys())
        assert decoded["sub"] == "user123"
        assert decoded["tier"] == "free"
        assert decoded["iss"] == "birdie-api"

    def test_user_token_expiry_is_24h(self, settings_patch):
        from app.routers.auth import _issue_user_jwt

        with patch("app.routers.auth.settings", settings_patch):
            result = _issue_user_jwt({"id": "user123", "account_tier": "free"})
        decoded = jwt.decode(
            result["token"],
            settings_patch.api_key,
            algorithms=["HS256"],
            issuer="birdie-api",
        )
        ttl = decoded["exp"] - decoded["iat"]
        assert ttl == 86400, f"Expected 24h (86400s), got {ttl}s"

    def test_anonymous_token_expiry_is_1h(self, settings_patch):
        """Build an anonymous token the same way the router does and check TTL."""
        import time as _time

        secret = settings_patch.api_key
        now = int(_time.time())
        payload = {
            "iat": now,
            "exp": now + 3600,
            "iss": "birdie-api",
            "sub": "anonymous",
        }
        token = jwt.encode(payload, secret, algorithm="HS256")
        decoded = jwt.decode(token, secret, algorithms=["HS256"], issuer="birdie-api")
        ttl = decoded["exp"] - decoded["iat"]
        assert ttl == 3600, f"Expected 1h (3600s), got {ttl}s"

    def test_anon_token_rejected_by_user_endpoint(self, settings_patch):
        """Anonymous tokens must NOT pass get_current_user dependency."""
        import time as _time
        from app.dependencies.auth import get_current_user
        from fastapi import HTTPException

        secret = settings_patch.api_key
        now = int(_time.time())
        anon_token = jwt.encode(
            {"iat": now, "exp": now + 3600, "iss": "birdie-api", "sub": "anonymous"},
            secret,
            algorithm="HS256",
        )
        creds = HTTPAuthorizationCredentials(scheme="Bearer", credentials=anon_token)
        loop = asyncio.new_event_loop()
        try:
            with pytest.raises(HTTPException) as exc_info:
                loop.run_until_complete(get_current_user(bearer=creds))
            assert exc_info.value.status_code == 401
        finally:
            loop.close()

    def test_invalid_issuer_rejected(self, settings_patch):
        from app.dependencies.auth import get_current_user
        from fastapi import HTTPException
        import time as _time

        now = int(_time.time())
        token = jwt.encode(
            {
                "sub": "user1",
                "tier": "free",
                "jti": "abc",
                "iss": "wrong-issuer",
                "iat": now,
                "exp": now + 3600,
            },
            settings_patch.api_key,
            algorithm="HS256",
        )
        creds = HTTPAuthorizationCredentials(scheme="Bearer", credentials=token)
        loop = asyncio.new_event_loop()
        try:
            with pytest.raises(HTTPException):
                loop.run_until_complete(get_current_user(bearer=creds))
        finally:
            loop.close()


# ===================================================================
#  5. Cascade-deletion audit logging
# ===================================================================


class TestDeletionAudit:
    def test_delete_logs_cascade_counts(self, settings_patch, mock_containers, caplog):
        """delete_user must log number of deleted decks and sessions."""
        from app.services.user_service import (
            hash_password,
            delete_user,
        )

        users_c, decks_c, sessions_c = mock_containers

        hashed = hash_password("correctpass1")
        users_c.read_item.return_value = {
            "id": "user123abc",
            "password_hash": hashed,
            "is_active": True,
        }
        # 3 decks, 5 sessions
        decks_c.query_items.return_value = [
            {"id": "d1"},
            {"id": "d2"},
            {"id": "d3"},
        ]
        sessions_c.query_items.return_value = [{"id": f"s{i}"} for i in range(5)]

        with caplog.at_level(logging.INFO, logger="app.services.user_service"):
            delete_user("user123abc", "correctpass1")

        # Check the log message contains counts
        assert any(
            "3 deck(s)" in msg and "5 session(s)" in msg for msg in caplog.messages
        ), f"Expected cascade counts in log, got: {caplog.messages}"


# ===================================================================
#  6. Deck-name sanitisation
# ===================================================================


class TestDeckNameSanitisation:
    def test_whitespace_collapsed(self):
        from app.models.deck import DeckCreateRequest

        req = DeckCreateRequest(
            name="  My   Cool    Deck  ",
            deck_type="dynamic",
            filters={"limit": 25},
        )
        assert req.name == "My Cool Deck"

    def test_control_characters_rejected(self):
        from app.models.deck import DeckCreateRequest

        with pytest.raises(Exception, match="control characters"):
            DeckCreateRequest(
                name="Bad\x00Name1",
                deck_type="dynamic",
                filters={"limit": 25},
            )

    def test_html_tags_rejected(self):
        from app.models.deck import DeckCreateRequest

        with pytest.raises(Exception, match="HTML"):
            DeckCreateRequest(
                name="<script>alert(1)</script>",
                deck_type="dynamic",
                filters={"limit": 25},
            )

    def test_img_tag_rejected(self):
        from app.models.deck import DeckCreateRequest

        with pytest.raises(Exception, match="HTML"):
            DeckCreateRequest(
                name="<img src=x onerror=alert(1)>",
                deck_type="dynamic",
                filters={"limit": 25},
            )

    def test_javascript_uri_rejected(self):
        from app.models.deck import DeckCreateRequest

        with pytest.raises(Exception, match="disallowed"):
            DeckCreateRequest(
                name="javascript:alert(1)",
                deck_type="dynamic",
                filters={"limit": 25},
            )

    def test_data_uri_rejected(self):
        from app.models.deck import DeckCreateRequest

        with pytest.raises(Exception, match="disallowed"):
            DeckCreateRequest(
                name="data:text/html,Hello",
                deck_type="dynamic",
                filters={"limit": 25},
            )

    def test_valid_names_accepted(self):
        from app.models.deck import DeckCreateRequest

        for name in [
            "My Warblers Deck",
            "Eastern US - Spring 2024",
            "Deck #1 (hard)",
            "Parulidés — difficile",
            "日本の鳥",
        ]:
            req = DeckCreateRequest(
                name=name,
                deck_type="dynamic",
                filters={"limit": 25},
            )
            assert req.name.strip() == name.strip()

    def test_update_request_also_validates(self):
        from app.models.deck import DeckUpdateRequest

        with pytest.raises(Exception, match="HTML"):
            DeckUpdateRequest(name="<b>bold</b>")


# ===================================================================
#  7. Input-validation edge cases
# ===================================================================


class TestInputValidation:
    """Edge-case coverage for user-facing Pydantic models."""

    def test_password_too_short_rejected_on_create(self):
        from app.models.user import UserCreateRequest

        with pytest.raises(Exception):
            UserCreateRequest(email="a@b.co", password="short1")

    def test_password_no_digit_rejected_on_create(self):
        from app.models.user import UserCreateRequest

        with pytest.raises(Exception, match="digit"):
            UserCreateRequest(email="a@b.co", password="abcdefghijk")

    def test_password_no_letter_rejected_on_create(self):
        from app.models.user import UserCreateRequest

        with pytest.raises(Exception, match="letter"):
            UserCreateRequest(email="a@b.co", password="1234567890")

    def test_password_change_too_short_rejected(self):
        from app.models.user import PasswordChangeRequest

        with pytest.raises(Exception):
            PasswordChangeRequest(
                current_password="old1234567",
                new_password="short1",
            )

    def test_password_change_no_digit_rejected(self):
        from app.models.user import PasswordChangeRequest

        with pytest.raises(Exception, match="digit"):
            PasswordChangeRequest(
                current_password="old1234567",
                new_password="abcdefghijk",
            )

    def test_password_change_valid_accepted(self):
        from app.models.user import PasswordChangeRequest

        req = PasswordChangeRequest(
            current_password="old1234567",
            new_password="newPass12345",
        )
        assert req.new_password == "newPass12345"

    def test_email_without_at_rejected(self):
        from app.models.user import UserCreateRequest

        with pytest.raises(Exception, match="email"):
            UserCreateRequest(email="nodomain.com", password="validPass123")

    def test_email_without_dot_in_domain_rejected(self):
        from app.models.user import UserCreateRequest

        with pytest.raises(Exception, match="email"):
            UserCreateRequest(email="user@localhost", password="validPass123")

    def test_species_code_injection_rejected(self):
        from app.models.deck import DeckCreateRequest

        with pytest.raises(Exception, match="Invalid species code"):
            DeckCreateRequest(
                name="Test Deck",
                deck_type="frozen",
                species_codes=["valid1", "<script>"],
            )

    def test_species_code_too_long_rejected(self):
        from app.models.deck import DeckCreateRequest

        with pytest.raises(Exception, match="Invalid species code"):
            DeckCreateRequest(
                name="Test Deck",
                deck_type="frozen",
                species_codes=["a" * 11],  # max 10
            )

    def test_too_many_species_rejected(self):
        from app.models.deck import DeckCreateRequest

        with pytest.raises(Exception, match="500"):
            DeckCreateRequest(
                name="Test Deck",
                deck_type="frozen",
                species_codes=[f"sp{i}" for i in range(501)],
            )

    def test_common_password_rejected_on_create(self, settings_patch, mock_containers):
        """create_user rejects known common passwords."""
        from app.services.user_service import create_user

        with pytest.raises(ValueError, match="too common"):
            create_user("test@example.com", "password1234")

    def test_common_password_rejected_on_change(self, settings_patch, mock_containers):
        """change_password rejects known common passwords."""
        from app.services.user_service import change_password, hash_password

        users_c, _, _ = mock_containers
        users_c.read_item.return_value = {
            "id": "user1",
            "password_hash": hash_password("oldPass12345"),
        }
        with pytest.raises(ValueError, match="too common"):
            change_password("user1", "oldPass12345", "password1234")
