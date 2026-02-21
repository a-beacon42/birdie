"""Proxy service for Azure OpenAI chat completions — keeps the API key server-side."""

import httpx

from app.config import settings


async def send_chat(messages: list[dict]) -> dict:
    """Forward a chat completion request to Azure OpenAI and return the assistant message."""
    base_url = settings.azure_openai_endpoint.rstrip("/")
    url = (
        f"{base_url}/openai/deployments/{settings.azure_openai_deployment_name}"
        f"/chat/completions?api-version={settings.azure_openai_api_version}"
    )

    headers = {
        "Content-Type": "application/json",
        "api-key": settings.azure_openai_api_key,
    }

    async with httpx.AsyncClient(timeout=60.0) as client:
        resp = await client.post(url, headers=headers, json={"messages": messages})
        resp.raise_for_status()
        data = resp.json()

    choice = data.get("choices", [{}])[0]
    message = choice.get("message", {})
    return {
        "role": message.get("role", "assistant"),
        "content": message.get("content", ""),
    }
