"""User account service — registration, authentication, password management.

Security design:
  - Passwords are pre-hashed with SHA-256 before bcrypt to avoid the 72-byte
    truncation, then hashed with bcrypt at a configurable cost factor.
  - Email addresses are encrypted at rest with AES-256-GCM. The document ``id``
    is a SHA-256 digest of the normalised email so we can do deterministic
    point-reads without storing plaintext email in an indexed field.
  - Account lockout after N failed attempts with a time-based cooldown.
"""

import base64
import hashlib
import logging
import os
from datetime import datetime, timezone, timedelta

from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from passlib.hash import bcrypt

from azure.cosmos.exceptions import (
    CosmosResourceExistsError,
    CosmosResourceNotFoundError,
)

from app.config import settings
from app.models.user import UserResponse
from app.services.cosmos import (
    get_users_container,
    get_decks_container,
    get_sessions_container,
)

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
#  Common password list (top ~30 most common — lightweight inline check)
# ---------------------------------------------------------------------------
_COMMON_PASSWORDS = frozenset(
    [
        "password123",
        "123456789a",
        "qwerty12345",
        "letmein1234",
        "iloveyou123",
        "welcome1234",
        "monkey12345",
        "dragon12345",
        "master12345",
        "football123",
        "baseball123",
        "shadow12345",
        "trustno1234",
        "michael1234",
        "jennifer123",
        "1234567890a",
        "abcdefghij1",
        "password1234",
        "qwertyuiop1",
        "admin1234567",
        "changeme1234",
        "password12345",
        "p@ssword1234",
        "passw0rd1234",
    ]
)

# ---------------------------------------------------------------------------
#  Email encryption helpers (AES-256-GCM)
# ---------------------------------------------------------------------------


def _get_encryption_key() -> bytes:
    """Return the 32-byte AES key derived from the configured hex string."""
    key_hex = settings.email_encryption_key
    if not key_hex:
        raise RuntimeError(
            "EMAIL_ENCRYPTION_KEY must be set (64-char hex string for 32-byte key)"
        )
    return bytes.fromhex(key_hex)


def encrypt_email(email: str) -> tuple[str, str, str]:
    """Encrypt an email address with AES-256-GCM.

    Returns (ciphertext_b64, iv_b64, tag_b64).
    The tag is appended to the ciphertext by AESGCM — we split it out for clarity.
    """
    key = _get_encryption_key()
    aesgcm = AESGCM(key)
    iv = os.urandom(12)  # 96-bit nonce
    # AESGCM.encrypt returns ciphertext || tag (16 bytes)
    ct_with_tag = aesgcm.encrypt(iv, email.encode("utf-8"), None)
    ct, tag = ct_with_tag[:-16], ct_with_tag[-16:]
    return (
        base64.b64encode(ct).decode(),
        base64.b64encode(iv).decode(),
        base64.b64encode(tag).decode(),
    )


def decrypt_email(ct_b64: str, iv_b64: str, tag_b64: str) -> str:
    """Decrypt an AES-256-GCM encrypted email."""
    key = _get_encryption_key()
    aesgcm = AESGCM(key)
    ct = base64.b64decode(ct_b64)
    iv = base64.b64decode(iv_b64)
    tag = base64.b64decode(tag_b64)
    plaintext = aesgcm.decrypt(iv, ct + tag, None)
    return plaintext.decode("utf-8")


# ---------------------------------------------------------------------------
#  Password hashing helpers
# ---------------------------------------------------------------------------


def _prehash(password: str) -> str:
    """SHA-256 pre-hash to avoid bcrypt's 72-byte truncation on long passwords."""
    return hashlib.sha256(password.encode("utf-8")).hexdigest()


def hash_password(password: str) -> str:
    """Hash a password with SHA-256 pre-hash + bcrypt."""
    return bcrypt.using(rounds=settings.bcrypt_rounds).hash(_prehash(password))


def verify_password(password: str, hashed: str) -> bool:
    """Verify a password against a stored bcrypt hash."""
    return bcrypt.verify(_prehash(password), hashed)


# ---------------------------------------------------------------------------
#  Email → deterministic user ID
# ---------------------------------------------------------------------------


def email_to_user_id(email: str) -> str:
    """Derive a deterministic, non-reversible user ID from an email address."""
    return hashlib.sha256(email.strip().lower().encode("utf-8")).hexdigest()


# ---------------------------------------------------------------------------
#  Account lockout helpers
# ---------------------------------------------------------------------------


def _is_locked(user_doc: dict) -> bool:
    """Return True if the account is currently locked out."""
    locked_until = user_doc.get("locked_until")
    if not locked_until:
        return False
    return datetime.fromisoformat(locked_until) > datetime.now(timezone.utc)


def _record_failed_login(user_doc: dict) -> dict:
    """Increment failed attempts; lock account if threshold exceeded."""
    attempts = user_doc.get("failed_login_attempts", 0) + 1
    user_doc["failed_login_attempts"] = attempts
    if attempts >= settings.max_failed_logins:
        lock_time = datetime.now(timezone.utc) + timedelta(
            minutes=settings.lockout_duration_minutes
        )
        user_doc["locked_until"] = lock_time.isoformat()
        logger.warning("Account %s locked until %s", user_doc["id"][:12], lock_time)
    return user_doc


def _reset_failed_logins(user_doc: dict) -> dict:
    """Clear failed-login counters after a successful login."""
    user_doc["failed_login_attempts"] = 0
    user_doc["locked_until"] = None
    return user_doc


# ---------------------------------------------------------------------------
#  CRUD operations
# ---------------------------------------------------------------------------


def check_common_password(password: str) -> bool:
    """Return True if the password is in the common-passwords list."""
    return password.strip().lower() in _COMMON_PASSWORDS


def create_user(email: str, password: str) -> UserResponse:
    """Register a new user account.

    Raises ValueError on duplicate email or weak password.
    """
    if check_common_password(password):
        raise ValueError("This password is too common — please choose a stronger one")

    user_id = email_to_user_id(email)
    container = get_users_container()

    # Check for existing account (point-read by id/partition)
    try:
        container.read_item(item=user_id, partition_key=user_id)
        raise ValueError("An account with this email already exists")
    except CosmosResourceNotFoundError:
        pass  # Good — no duplicate

    now = datetime.now(timezone.utc).isoformat()
    ct, iv, tag = encrypt_email(email.strip().lower())

    user_doc = {
        "id": user_id,
        "email_encrypted": ct,
        "email_iv": iv,
        "email_tag": tag,
        "password_hash": hash_password(password),
        "created_at": now,
        "account_tier": "free",
        "max_saved_decks": 5,
        "is_active": True,
        "failed_login_attempts": 0,
        "locked_until": None,
    }

    try:
        container.create_item(body=user_doc)
    except CosmosResourceExistsError:
        raise ValueError("An account with this email already exists")

    logger.info("User created: %s", user_id[:12])
    return UserResponse(
        id=user_id,
        created_at=now,
        account_tier="free",
        max_saved_decks=5,
    )


def authenticate_user(email: str, password: str) -> dict:
    """Authenticate a user by email + password.

    Returns the raw user document on success.
    Raises ValueError on invalid credentials or locked account.
    """
    user_id = email_to_user_id(email)
    container = get_users_container()

    try:
        user_doc = container.read_item(item=user_id, partition_key=user_id)
    except CosmosResourceNotFoundError:
        # Don't reveal whether the email exists — generic message
        raise ValueError("Invalid email or password")

    if not user_doc.get("is_active", True):
        raise ValueError("Invalid email or password")

    if _is_locked(user_doc):
        raise ValueError("Account is temporarily locked — please try again later")

    if not verify_password(password, user_doc["password_hash"]):
        user_doc = _record_failed_login(user_doc)
        container.upsert_item(body=user_doc)
        raise ValueError("Invalid email or password")

    # Success — reset lockout counters
    if user_doc.get("failed_login_attempts", 0) > 0:
        user_doc = _reset_failed_logins(user_doc)
        container.upsert_item(body=user_doc)

    return user_doc


def change_password(user_id: str, current_password: str, new_password: str) -> None:
    """Change password for an authenticated user.

    Raises ValueError on wrong current password, weak new password, or same password.
    """
    if check_common_password(new_password):
        raise ValueError("This password is too common — please choose a stronger one")

    container = get_users_container()

    try:
        user_doc = container.read_item(item=user_id, partition_key=user_id)
    except CosmosResourceNotFoundError:
        raise ValueError("User not found")

    if not verify_password(current_password, user_doc["password_hash"]):
        raise ValueError("Current password is incorrect")

    # Prevent reusing the same password
    if verify_password(new_password, user_doc["password_hash"]):
        raise ValueError("New password must be different from current password")

    user_doc["password_hash"] = hash_password(new_password)
    container.upsert_item(body=user_doc)
    logger.info("Password changed for user %s", user_id[:12])


def delete_user(user_id: str, password: str) -> None:
    """Permanently delete a user account and all associated data.

    Requires password confirmation. Cascades to decks and game sessions.
    """
    container = get_users_container()

    try:
        user_doc = container.read_item(item=user_id, partition_key=user_id)
    except CosmosResourceNotFoundError:
        raise ValueError("User not found")

    if not verify_password(password, user_doc["password_hash"]):
        raise ValueError("Password is incorrect")

    # --- Cascade delete: decks ---
    decks_container = get_decks_container()
    decks = list(
        decks_container.query_items(
            query="SELECT c.id FROM c WHERE c.user_id = @uid",
            parameters=[{"name": "@uid", "value": user_id}],
            partition_key=user_id,
        )
    )
    for deck in decks:
        decks_container.delete_item(item=deck["id"], partition_key=user_id)

    # --- Cascade delete: game sessions ---
    sessions_container = get_sessions_container()
    sessions = list(
        sessions_container.query_items(
            query="SELECT c.id FROM c WHERE c.user_id = @uid",
            parameters=[{"name": "@uid", "value": user_id}],
            partition_key=user_id,
        )
    )
    for session in sessions:
        sessions_container.delete_item(item=session["id"], partition_key=user_id)

    # --- Delete user document ---
    container.delete_item(item=user_id, partition_key=user_id)
    logger.info("User deleted (cascade complete): %s", user_id[:12])


def get_user(user_id: str) -> dict | None:
    """Fetch a user document by ID. Returns None if not found."""
    container = get_users_container()
    try:
        return container.read_item(item=user_id, partition_key=user_id)
    except CosmosResourceNotFoundError:
        return None
