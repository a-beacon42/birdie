"""Azure OpenAI chat proxy endpoint — keeps the API key server-side.

Security:
  - Requires an API key via X-API-Key header
  - Rate-limited per client IP (configurable via CHAT_RATE_LIMIT)
  - System prompt is enforced server-side
  - Message count and size are validated by Pydantic
"""

from fastapi import APIRouter, Depends, HTTPException, Request, Security
from fastapi.security import APIKeyHeader
from slowapi import Limiter
from slowapi.util import get_remote_address

from app.config import settings
from app.models.bird import ChatRequest, ChatResponse
from app.services.chat_service import send_chat

router = APIRouter(prefix="/api/chat", tags=["chat"])

# --- Rate limiter (per-IP) ---
limiter = Limiter(key_func=get_remote_address)

# --- API key dependency ---
_api_key_header = APIKeyHeader(name="X-API-Key", auto_error=False)


async def _verify_api_key(
    api_key: str | None = Security(_api_key_header),
) -> str:
    """Validate the X-API-Key header against the configured secret."""
    if not settings.api_key:
        # If no key is configured (local dev), allow all requests
        return ""
    if api_key != settings.api_key:
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
        raise HTTPException(status_code=502, detail=str(exc))
