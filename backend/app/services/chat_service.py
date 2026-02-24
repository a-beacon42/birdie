"""Proxy service for Azure OpenAI chat completions — keeps credentials server-side.

Supports two authentication modes:
  1. API key — set AZURE_OPENAI_API_KEY in env (local dev)
  2. Managed identity — leave AZURE_OPENAI_API_KEY empty; uses DefaultAzureCredential (production)
"""

import logging

import httpx

from app.config import settings

logger = logging.getLogger(__name__)

# Cached token credential (only created once, when using managed identity)
_credential = None
_OPENAI_SCOPE = "https://cognitiveservices.azure.com/.default"

# Persistent HTTP client for Azure OpenAI calls
_client: httpx.AsyncClient | None = None


def get_http_client() -> httpx.AsyncClient:
    """Get or create a persistent async HTTP client for Azure OpenAI."""
    global _client
    if _client is None or _client.is_closed:
        _client = httpx.AsyncClient(
            timeout=60.0,
            limits=httpx.Limits(max_connections=10, max_keepalive_connections=5),
        )
    return _client


async def close_http_client() -> None:
    """Close the HTTP client (call during app shutdown)."""
    global _client
    if _client and not _client.is_closed:
        await _client.aclose()
        _client = None

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


def _get_auth_headers() -> dict[str, str]:
    """Return authentication headers for Azure OpenAI — API key or Bearer token."""
    if settings.azure_openai_api_key:
        return {"api-key": settings.azure_openai_api_key}

    # Managed identity — acquire a Bearer token
    global _credential
    if _credential is None:
        from azure.identity import DefaultAzureCredential

        _credential = DefaultAzureCredential()

    token = _credential.get_token(_OPENAI_SCOPE)
    return {"Authorization": f"Bearer {token.token}"}


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
        **_get_auth_headers(),
    }

    # Build full message list with server-controlled system prompt
    full_messages = [
        {"role": "system", "content": SYSTEM_PROMPT},
        *[{"role": m["role"], "content": m["content"]} for m in messages],
    ]

    client = get_http_client()
    resp = await client.post(url, headers=headers, json={"messages": full_messages})
    resp.raise_for_status()
    data = resp.json()

    choice = data.get("choices", [{}])[0]
    message = choice.get("message", {})
    return {
        "role": message.get("role", "assistant"),
        "content": message.get("content", ""),
    }
