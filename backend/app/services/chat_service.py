"""Proxy service for Azure OpenAI chat completions — keeps the API key server-side."""

import httpx

from app.config import settings

# System prompt enforced server-side — never accepted from the client.
SYSTEM_PROMPT = (
    "You are Birdie AI, a friendly and knowledgeable bird identification assistant. "
    "Use a light, conversational tone. "
    "When listing features or facts, use short bullet points that do not end with periods. "
    "Answer questions concisely & factually — if unsure, say so. "
    "Only answer questions about birds; politely decline other topics. "
    "Focus on: key morphological features, habitat & range, behavior. "
    "If there are common lookalikes, explain how to tell them apart. "
    "Limit responses to 150 words or fewer."
)


async def send_chat(bird_name: str, messages: list[dict]) -> dict:
    """Forward a chat completion request to Azure OpenAI and return the assistant message.

    The system prompt is prepended server-side; clients only send user/assistant messages.
    """
    base_url = settings.azure_openai_endpoint.rstrip("/")
    url = (
        f"{base_url}/openai/deployments/{settings.azure_openai_deployment_name}"
        f"/chat/completions?api-version={settings.azure_openai_api_version}"
    )

    headers = {
        "Content-Type": "application/json",
        "api-key": settings.azure_openai_api_key,
    }

    # Build full message list with server-controlled system prompt
    full_messages = [
        {"role": "system", "content": SYSTEM_PROMPT},
        *[{"role": m["role"], "content": m["content"]} for m in messages],
    ]

    async with httpx.AsyncClient(timeout=60.0) as client:
        resp = await client.post(url, headers=headers, json={"messages": full_messages})
        resp.raise_for_status()
        data = resp.json()

    choice = data.get("choices", [{}])[0]
    message = choice.get("message", {})
    return {
        "role": message.get("role", "assistant"),
        "content": message.get("content", ""),
    }
