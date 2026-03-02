"""Azure OpenAI chat proxy endpoint — keeps the API key server-side.

Security:
  - Requires authentication via Bearer token (JWT) or legacy X-API-Key header
  - Rate-limited per client IP (configurable via CHAT_RATE_LIMIT)
  - System prompt is enforced server-side
  - Message count and size are validated by Pydantic
"""

import logging
import secrets

import jwt
from fastapi import APIRouter, Depends, HTTPException, Request, Security
from fastapi.security import APIKeyHeader, HTTPAuthorizationCredentials, HTTPBearer
from slowapi import Limiter
from slowapi.util import get_remote_address

from app.config import settings
from app.models.bird import ChatRequest, ChatResponse
from app.services.chat_service import send_chat

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/chat", tags=["chat"])

# --- Rate limiter (per-IP) ---
limiter = Limiter(key_func=get_remote_address)

# --- Auth dependencies ---
_api_key_header = APIKeyHeader(name="X-API-Key", auto_error=False)
_bearer_scheme = HTTPBearer(auto_error=False)


def _verify_jwt(token: str) -> bool:
    """Verify a JWT issued by /auth/token. Returns True if valid."""
    try:
        jwt.decode(
            token,
            settings.api_key,
            algorithms=["HS256"],
            issuer="birdie-api",
        )
        return True
    except (jwt.InvalidTokenError, Exception):
        return False


async def _verify_auth(
    api_key: str | None = Security(_api_key_header),
    bearer: HTTPAuthorizationCredentials | None = Security(_bearer_scheme),
) -> str:
    """Validate request authentication.

    Accepts either:
      1. A valid JWT Bearer token (preferred — from /auth/token)
      2. A legacy X-API-Key header (for backward compatibility)

    In development with no API_KEY set, all requests are allowed.
    """
    if not settings.api_key:
        if settings.is_production:
            logger.error(
                "API_KEY is not set in production — rejecting all chat requests"
            )
            raise HTTPException(status_code=503, detail="Service misconfigured")
        # Local dev only: allow unauthenticated requests
        return ""

    # Prefer Bearer token (JWT)
    if bearer and bearer.credentials:
        if _verify_jwt(bearer.credentials):
            return "jwt"

    # Fall back to legacy API key
    if api_key and secrets.compare_digest(api_key, settings.api_key):
        return "api_key"

    raise HTTPException(status_code=403, detail="Invalid or missing authentication")


@router.post("", response_model=ChatResponse)
@limiter.limit(settings.chat_rate_limit)
async def chat(
    request: Request,
    req: ChatRequest,
    _auth: str = Depends(_verify_auth),
) -> ChatResponse:
    """Forward messages to Azure OpenAI and return the assistant reply."""
    try:
        result = await send_chat(
            bird_name=req.bird_name,
            messages=[m.model_dump() for m in req.messages],
        )
        return ChatResponse(**result)
    except HTTPException:
        raise
    except Exception:
        logger.exception("Chat proxy error")
        raise HTTPException(
            status_code=502,
            detail="Failed to get a response from the AI service. Please try again.",
        )
