"""FastAPI dependencies for user authentication.

Provides two injection points:
  - ``get_current_user`` — requires a valid *user* JWT (rejects anonymous tokens).
  - ``get_optional_user`` — returns the user ID when present, ``None`` for anonymous.

JWTs issued at login/register contain ``"sub": "<user_id>"`` and ``"tier": "free"|"premium"``.
Anonymous tokens (from ``POST /auth/token``) have ``"sub": "anonymous"`` and are *not*
treated as authenticated users.
"""

import logging

import jwt
from fastapi import HTTPException, Security
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.config import settings

logger = logging.getLogger(__name__)

_bearer_scheme = HTTPBearer(auto_error=False)


class AuthenticatedUser:
    """Lightweight container for the currently-authenticated user's identity."""

    __slots__ = ("user_id", "tier")

    def __init__(self, user_id: str, tier: str = "free"):
        self.user_id = user_id
        self.tier = tier

    def __repr__(self) -> str:
        return f"AuthenticatedUser(user_id={self.user_id!r}, tier={self.tier!r})"


def _decode_user_jwt(token: str) -> dict:
    """Decode and validate a JWT, returning the payload dict.

    Raises jwt.InvalidTokenError on any problem.
    """
    return jwt.decode(
        token,
        settings.api_key,
        algorithms=["HS256"],
        issuer="birdie-api",
        options={"require": ["exp", "iat", "sub", "iss"]},
    )


async def get_current_user(
    bearer: HTTPAuthorizationCredentials | None = Security(_bearer_scheme),
) -> AuthenticatedUser:
    """Require a valid **user** JWT (not anonymous).

    Usage::

        @router.get("/protected")
        def endpoint(user: AuthenticatedUser = Depends(get_current_user)):
            ...
    """
    if not bearer or not bearer.credentials:
        raise HTTPException(status_code=401, detail="Authentication required")

    try:
        payload = _decode_user_jwt(bearer.credentials)
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")

    sub = payload.get("sub", "")
    if sub == "anonymous" or not sub:
        raise HTTPException(
            status_code=401,
            detail="User authentication required — anonymous tokens are not accepted",
        )

    return AuthenticatedUser(user_id=sub, tier=payload.get("tier", "free"))


async def get_optional_user(
    bearer: HTTPAuthorizationCredentials | None = Security(_bearer_scheme),
) -> AuthenticatedUser | None:
    """Return the authenticated user if present, or ``None`` for anonymous/missing tokens.

    Useful for endpoints that work for both anonymous and authenticated users
    but offer extra features when logged in.
    """
    if not bearer or not bearer.credentials:
        return None

    try:
        payload = _decode_user_jwt(bearer.credentials)
    except jwt.InvalidTokenError:
        return None

    sub = payload.get("sub", "")
    if sub == "anonymous" or not sub:
        return None

    return AuthenticatedUser(user_id=sub, tier=payload.get("tier", "free"))
