"""Conftest — shared fixtures for backend tests."""

import os
from unittest.mock import MagicMock, patch

import pytest


@pytest.fixture(autouse=True)
def _isolate_env(monkeypatch):
    """Ensure tests never hit real Azure/eBird services."""
    monkeypatch.setenv("COSMOS_ENDPOINT", "https://fake.cosmos.azure.com:443/")
    monkeypatch.setenv("COSMOS_KEY", "fake-key==")
    monkeypatch.setenv("COSMOS_DATABASE", "birdie-test")
    monkeypatch.setenv("EBIRD_API_KEY", "fake-ebird-key")
    monkeypatch.setenv("AZURE_OPENAI_ENDPOINT", "https://fake.openai.azure.com")
    monkeypatch.setenv("AZURE_OPENAI_DEPLOYMENT_NAME", "gpt-4")
    monkeypatch.setenv("AZURE_OPENAI_API_KEY", "fake-openai-key")
    monkeypatch.setenv("API_KEY", "test-api-key-12345")
    monkeypatch.setenv("EMAIL_ENCRYPTION_KEY", "aa" * 32)  # 64 hex chars = 32 bytes
    monkeypatch.setenv("ENVIRONMENT", "development")
