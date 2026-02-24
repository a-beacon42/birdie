"""Anonymous token endpoint — issues short-lived JWTs for API access.

Replaces the static API key that was previously baked into the JS bundle.
Tokens are signed with the server's API_KEY using HMAC-SHA256 and expire
after a configurable period (default 1 hour).

Security model:
  - Any client can request a token (no credentials required)
  - Tokens are short-lived and rate-limited
  - The server's API_KEY is never exposed to clients
  - In production, API_KEY must be set for signing
"""

import logging
import time

import jwt
from fastapi import APIRouter, HTTPException, Request
from slowapi import Limiter
from slowapi.util import get_remote_address

from app.config import settings

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/auth", tags=["auth"])
limiter = Limiter(key_func=get_remote_address)

# Token lifetime in seconds (1 hour)
TOKEN_LIFETIME = 3600


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
        return {"token": "", "expires_in": TOKEN_LIFETIME}

    now = int(time.time())
    payload = {
        "iat": now,
        "exp": now + TOKEN_LIFETIME,
        "iss": "birdie-api",
        "sub": "anonymous",
    }
    token = jwt.encode(payload, secret, algorithm="HS256")
    return {"token": token, "expires_in": TOKEN_LIFETIME}
