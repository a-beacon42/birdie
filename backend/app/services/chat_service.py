"""Proxy service for Azure OpenAI chat completions — keeps credentials server-side.

Uses the official ``openai`` Python SDK (AsyncAzureOpenAI) which handles
connection pooling, retries, and streaming natively.

Supports two authentication modes:
  1. API key — set AZURE_OPENAI_API_KEY in env (local dev)
  2. Managed identity — leave AZURE_OPENAI_API_KEY empty; uses DefaultAzureCredential (production)
"""

import logging
import threading

from openai import AsyncAzureOpenAI

from app.config import settings

logger = logging.getLogger(__name__)

# Cached client & credential (created once per process)
_client_lock = threading.Lock()
_client: AsyncAzureOpenAI | None = None
_credential = None
_OPENAI_SCOPE = "https://cognitiveservices.azure.com/.default"


def _get_client() -> AsyncAzureOpenAI:
    """Get or create a persistent Azure OpenAI async client."""
    global _client, _credential
    if _client is not None:
        return _client

    with _client_lock:
        # Double-check after acquiring lock
        if _client is not None:
            return _client

        # Use API key when available; otherwise fall back to managed identity
        if settings.azure_openai_api_key:
            _client = AsyncAzureOpenAI(
                api_key=settings.azure_openai_api_key,
                azure_endpoint=settings.azure_openai_endpoint,
                api_version=settings.azure_openai_api_version,
                max_retries=2,
                timeout=60.0,
            )
        else:
            from azure.identity import DefaultAzureCredential, get_bearer_token_provider

            if _credential is None:
                _credential = DefaultAzureCredential()
            token_provider = get_bearer_token_provider(_credential, _OPENAI_SCOPE)
            _client = AsyncAzureOpenAI(
                azure_ad_token_provider=token_provider,
                azure_endpoint=settings.azure_openai_endpoint,
                api_version=settings.azure_openai_api_version,
                max_retries=2,
                timeout=60.0,
            )

    return _client


async def close_http_client() -> None:
    """Close the OpenAI client (call during app shutdown)."""
    global _client
    if _client is not None:
        await _client.close()
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


async def send_chat(bird_name: str, messages: list[dict]) -> dict:
    """Forward a chat completion request to Azure OpenAI and return the assistant message.

    The system prompt is prepended server-side; clients only send user/assistant messages.
    """
    client = _get_client()

    full_messages = [
        {"role": "system", "content": SYSTEM_PROMPT},
        *[{"role": m["role"], "content": m["content"]} for m in messages],
    ]

    response = await client.chat.completions.create(
        model=settings.azure_openai_deployment_name,
        messages=full_messages,
    )

    choice = response.choices[0] if response.choices else None
    if choice and choice.message:
        return {
            "role": choice.message.role or "assistant",
            "content": choice.message.content or "",
        }

    return {"role": "assistant", "content": ""}
