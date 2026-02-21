"""Azure OpenAI chat proxy endpoint — keeps the API key server-side."""

from fastapi import APIRouter, HTTPException

from app.models.bird import ChatRequest, ChatResponse
from app.services.chat_service import send_chat

router = APIRouter(prefix="/api/chat", tags=["chat"])


@router.post("", response_model=ChatResponse)
async def chat(req: ChatRequest) -> ChatResponse:
    """Forward messages to Azure OpenAI and return the assistant reply."""
    try:
        result = await send_chat(req.messages)
        return ChatResponse(**result)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc))
