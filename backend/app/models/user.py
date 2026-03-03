"""Pydantic models for user accounts."""

from typing import Literal

from pydantic import BaseModel, Field, field_validator


class User(BaseModel):
    """User account document stored in Cosmos DB.

    Privacy design:
      - ``id`` is the SHA-256 hash of the lowercase email (deterministic lookup
        without storing plaintext email as an indexed field).
      - ``email_encrypted`` holds the AES-256-GCM encrypted email so the server
        can decrypt it for password-reset flows, but a raw DB dump never leaks it.
      - ``password_hash`` is bcrypt (cost 12) with a SHA-256 pre-hash to avoid
        the 72-byte bcrypt truncation on long passwords.
    """

    id: str  # SHA-256(email.lower()) — partition key and unique lookup key
    email_encrypted: str  # AES-256-GCM encrypted email (base64)
    email_iv: str  # AES-256-GCM initialisation vector (base64)
    email_tag: str  # AES-256-GCM auth tag (base64)
    password_hash: str  # bcrypt hash
    created_at: str  # ISO-8601
    account_tier: Literal["free", "premium"] = "free"
    max_saved_decks: int = 5
    is_active: bool = True
    failed_login_attempts: int = 0
    locked_until: str | None = None  # ISO-8601 or None


class UserCreateRequest(BaseModel):
    """Client payload for account registration."""

    email: str = Field(
        min_length=5,
        max_length=254,
        description="Valid email address — used only for account recovery.",
    )
    password: str = Field(
        min_length=10,
        max_length=128,
        description="Password (10-128 characters).",
    )

    @field_validator("email")
    @classmethod
    def validate_email(cls, v: str) -> str:
        """Basic structural validation — keeps it dependency-light."""
        v = v.strip().lower()
        if "@" not in v or "." not in v.split("@")[-1]:
            raise ValueError("Invalid email format")
        local, domain = v.rsplit("@", 1)
        if not local or not domain or len(domain) < 3:
            raise ValueError("Invalid email format")
        return v

    @field_validator("password")
    @classmethod
    def validate_password_strength(cls, v: str) -> str:
        """Enforce minimum complexity: ≥10 chars, at least one letter and one digit."""
        if len(v) < 10:
            raise ValueError("Password must be at least 10 characters")
        has_letter = any(c.isalpha() for c in v)
        has_digit = any(c.isdigit() for c in v)
        if not (has_letter and has_digit):
            raise ValueError("Password must contain at least one letter and one digit")
        return v


class UserLoginRequest(BaseModel):
    """Client payload for login."""

    email: str = Field(min_length=5, max_length=254)
    password: str = Field(min_length=1, max_length=128)

    @field_validator("email")
    @classmethod
    def normalise_email(cls, v: str) -> str:
        return v.strip().lower()


class PasswordChangeRequest(BaseModel):
    """Client payload for changing password."""

    current_password: str = Field(min_length=1, max_length=128)
    new_password: str = Field(min_length=10, max_length=128)

    @field_validator("new_password")
    @classmethod
    def validate_new_password(cls, v: str) -> str:
        if len(v) < 10:
            raise ValueError("Password must be at least 10 characters")
        has_letter = any(c.isalpha() for c in v)
        has_digit = any(c.isdigit() for c in v)
        if not (has_letter and has_digit):
            raise ValueError("Password must contain at least one letter and one digit")
        # Defer common-password check to service layer (avoids circular import)
        return v


class AccountDeleteRequest(BaseModel):
    """Client payload for account deletion — requires password confirmation."""

    password: str = Field(min_length=1, max_length=128)


class UserResponse(BaseModel):
    """Public-safe user representation — no PII exposed."""

    id: str
    created_at: str
    account_tier: Literal["free", "premium"]
    max_saved_decks: int
