"""Azure OpenAI chat proxy endpoint — keeps the API key server-side.

Security:
  - Requires an API key via X-API-Key header
  - Rate-limited per client IP (configurable via CHAT_RATE_LIMIT)
  - System prompt is enforced server-side
  - Message count and size are validated by Pydantic
"""

import logging
import secrets

from fastapi import APIRouter, Depends, HTTPException, Request, Security
from fastapi.security import APIKeyHeader
from slowapi import Limiter
from slowapi.util import get_remote_address

from app.config import settings
from app.models.bird import ChatRequest, ChatResponse
from app.services.chat_service import send_chat

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/chat", tags=["chat"])

# --- Rate limiter (per-IP) ---
limiter = Limiter(key_func=get_remote_address)

# --- API key dependency ---
_api_key_header = APIKeyHeader(name="X-API-Key", auto_error=False)


async def _verify_api_key(
    api_key: str | None = Security(_api_key_header),
) -> str:
    """Validate the X-API-Key header against the configured secret.

    Uses constant-time comparison to prevent timing attacks.
    In production, API_KEY must be set — see config.require_api_key_in_prod.
    """
    if not settings.api_key:
        if settings.is_production:
            logger.error("API_KEY is not set in production — rejecting all chat requests")
            raise HTTPException(status_code=503, detail="Service misconfigured")
        # Local dev only: allow unauthenticated requests
        return ""
    if not api_key or not secrets.compare_digest(api_key, settings.api_key):
        raise HTTPException(status_code=403, detail="Invalid or missing API key")
    return api_key


@router.post("", response_model=ChatResponse)
@limiter.limit(settings.chat_rate_limit)
async def chat(
    request: Request,
    req: ChatRequest,
    _key: str = Depends(_verify_api_key),
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
    except Exception as exc:
        logger.exception("Chat proxy error")
        raise HTTPException(
            status_code=502,
            detail="Failed to get a response from the AI service. Please try again.",
        )
