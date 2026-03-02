"""Authentication endpoints — anonymous tokens and user accounts.

Anonymous tokens (backward-compatible):
  - ``POST /auth/token`` — issue a short-lived anonymous JWT (no credentials).

User accounts:
  - ``POST /auth/register`` — create account with email + password.
  - ``POST /auth/login`` — authenticate and receive a user JWT.
  - ``POST /auth/refresh`` — refresh an existing (non-expired) user JWT.
  - ``POST /auth/change-password`` — change password (requires auth).
  - ``DELETE /auth/account`` — permanently delete account + all data.
  - ``GET /auth/me`` — return current user profile (no PII).

Security:
  - Aggressive rate limits on auth-sensitive endpoints.
  - Account lockout after repeated failed logins.
  - Generic error messages that don't leak account existence.
  - Passwords hashed with SHA-256 pre-hash + bcrypt.
"""

import logging
import time
import uuid

import jwt
from fastapi import APIRouter, Depends, HTTPException, Request
from slowapi import Limiter
from slowapi.util import get_remote_address

from app.config import settings
from app.dependencies.auth import AuthenticatedUser, get_current_user
from app.models.user import (
    AccountDeleteRequest,
    PasswordChangeRequest,
    UserCreateRequest,
    UserLoginRequest,
    UserResponse,
)
from app.services.user_service import (
    authenticate_user,
    change_password as svc_change_password,
    create_user,
    delete_user,
    get_user,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/auth", tags=["auth"])
limiter = Limiter(key_func=get_remote_address)

# Token lifetime in seconds
ANON_TOKEN_LIFETIME = 3600  # 1 hour for anonymous tokens


def _issue_user_jwt(user_doc: dict) -> dict:
    """Create a signed JWT for an authenticated user."""
    secret = settings.api_key
    if not secret:
        if settings.is_production:
            raise HTTPException(status_code=503, detail="Service misconfigured")
        return {"token": "", "expires_in": settings.user_token_lifetime}

    now = int(time.time())
    payload = {
        "iat": now,
        "exp": now + settings.user_token_lifetime,
        "iss": "birdie-api",
        "sub": user_doc["id"],
        "tier": user_doc.get("account_tier", "free"),
        "jti": uuid.uuid4().hex,  # unique token ID for future revocation
    }
    token = jwt.encode(payload, secret, algorithm="HS256")
    return {"token": token, "expires_in": settings.user_token_lifetime}


# ---------------------------------------------------------------------------
#  Anonymous token (backward-compatible)
# ---------------------------------------------------------------------------


@router.post("/token")
@limiter.limit("30/minute")
def issue_token(request: Request) -> dict:
    """Issue an anonymous short-lived JWT for API access.

    No credentials required — tokens are rate-limited per IP.
    The token grants access to protected endpoints (e.g. /chat)
    for a limited time.
    """
    secret = settings.api_key
    if not secret:
        if settings.is_production:
            logger.error("Cannot issue tokens: API_KEY is not set in production")
            raise HTTPException(status_code=503, detail="Service misconfigured")
        # Dev mode: return a no-op token that the auth middleware will accept
        return {"token": "", "expires_in": ANON_TOKEN_LIFETIME}

    now = int(time.time())
    payload = {
        "iat": now,
        "exp": now + ANON_TOKEN_LIFETIME,
        "iss": "birdie-api",
        "sub": "anonymous",
    }
    token = jwt.encode(payload, secret, algorithm="HS256")
    return {"token": token, "expires_in": ANON_TOKEN_LIFETIME}


# ---------------------------------------------------------------------------
#  User registration
# ---------------------------------------------------------------------------


@router.post("/register", response_model=dict)
@limiter.limit("5/minute")
def register(request: Request, body: UserCreateRequest) -> dict:
    """Create a new user account.

    Returns a JWT so the user is immediately logged in after registration.
    """
    try:
        user = create_user(body.email, body.password)
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc))
    except RuntimeError as exc:
        # Missing encryption key or misconfiguration
        logger.error("Registration failed: %s", exc)
        raise HTTPException(status_code=503, detail="Service temporarily unavailable")

    # Issue JWT for the new user
    user_doc = {
        "id": user.id,
        "account_tier": user.account_tier,
    }
    token_data = _issue_user_jwt(user_doc)
    return {
        "user": user.model_dump(),
        **token_data,
    }


# ---------------------------------------------------------------------------
#  Login
# ---------------------------------------------------------------------------


@router.post("/login", response_model=dict)
@limiter.limit("10/minute")
def login(request: Request, body: UserLoginRequest) -> dict:
    """Authenticate with email + password and receive a user JWT."""
    try:
        user_doc = authenticate_user(body.email, body.password)
    except ValueError as exc:
        raise HTTPException(status_code=401, detail=str(exc))

    token_data = _issue_user_jwt(user_doc)
    user_resp = UserResponse(
        id=user_doc["id"],
        created_at=user_doc["created_at"],
        account_tier=user_doc.get("account_tier", "free"),
        max_saved_decks=user_doc.get("max_saved_decks", 5),
    )
    return {
        "user": user_resp.model_dump(),
        **token_data,
    }


# ---------------------------------------------------------------------------
#  Token refresh
# ---------------------------------------------------------------------------


@router.post("/refresh", response_model=dict)
@limiter.limit("30/minute")
def refresh_token(
    request: Request,
    user: AuthenticatedUser = Depends(get_current_user),
) -> dict:
    """Issue a fresh JWT from a valid (non-expired) user token."""
    user_doc = get_user(user.user_id)
    if not user_doc or not user_doc.get("is_active", True):
        raise HTTPException(status_code=401, detail="Account not found or deactivated")
    return _issue_user_jwt(user_doc)


# ---------------------------------------------------------------------------
#  Password change
# ---------------------------------------------------------------------------


@router.post("/change-password", status_code=204)
@limiter.limit("3/minute")
def change_password(
    request: Request,
    body: PasswordChangeRequest,
    user: AuthenticatedUser = Depends(get_current_user),
) -> None:
    """Change password for the currently authenticated user."""
    try:
        svc_change_password(user.user_id, body.current_password, body.new_password)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


# ---------------------------------------------------------------------------
#  Account deletion
# ---------------------------------------------------------------------------


@router.delete("/account", status_code=200)
@limiter.limit("3/minute")
def delete_account(
    request: Request,
    body: AccountDeleteRequest,
    user: AuthenticatedUser = Depends(get_current_user),
) -> dict:
    """Permanently delete the user account and all associated data.

    Requires password confirmation. This action is irreversible.
    """
    try:
        delete_user(user.user_id, body.password)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return {"detail": "Account and all associated data have been permanently deleted"}


# ---------------------------------------------------------------------------
#  Current user profile
# ---------------------------------------------------------------------------


@router.get("/me", response_model=UserResponse)
@limiter.limit("60/minute")
def get_me(
    request: Request,
    user: AuthenticatedUser = Depends(get_current_user),
) -> UserResponse:
    """Return the current user's profile (no PII)."""
    user_doc = get_user(user.user_id)
    if not user_doc:
        raise HTTPException(status_code=404, detail="User not found")
    return UserResponse(
        id=user_doc["id"],
        created_at=user_doc["created_at"],
        account_tier=user_doc.get("account_tier", "free"),
        max_saved_decks=user_doc.get("max_saved_decks", 5),
    )
