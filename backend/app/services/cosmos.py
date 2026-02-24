"""Azure Cosmos DB client and container access.

Supports two authentication modes:
  1. API key — set COSMOS_KEY in env (local dev)
  2. Managed identity — leave COSMOS_KEY empty; uses DefaultAzureCredential (production)
"""

import threading

from azure.cosmos import CosmosClient, PartitionKey
from azure.cosmos.container import ContainerProxy
from azure.cosmos.database import DatabaseProxy

from app.config import settings

_lock = threading.Lock()
_client: CosmosClient | None = None
_database: DatabaseProxy | None = None
_birds_container: ContainerProxy | None = None

BIRDS_CONTAINER = "birds"


def get_cosmos_client() -> CosmosClient:
    global _client
    if _client is not None:
        return _client
    with _lock:
        if _client is None:
            if settings.cosmos_key:
                # Key-based auth (local development)
                _client = CosmosClient(
                    settings.cosmos_endpoint, credential=settings.cosmos_key
                )
            else:
                # Managed identity auth (production)
                from azure.identity import DefaultAzureCredential

                _client = CosmosClient(
                    settings.cosmos_endpoint, credential=DefaultAzureCredential()
                )
    return _client


def get_database() -> DatabaseProxy:
    global _database
    if _database is not None:
        return _database
    with _lock:
        if _database is None:
            client = get_cosmos_client()
            if settings.cosmos_key:
                # With key auth we have management-plane access — auto-create if missing
                _database = client.create_database_if_not_exists(
                    id=settings.cosmos_database
                )
            else:
                # Managed identity only has data-plane access — DB must already exist
                _database = client.get_database_client(settings.cosmos_database)
    return _database


def get_birds_container() -> ContainerProxy:
    """Get (or create) the birds container with familyCode as the partition key."""
    global _birds_container
    if _birds_container is not None:
        return _birds_container
    with _lock:
        if _birds_container is None:
            db = get_database()
            if settings.cosmos_key:
                _birds_container = db.create_container_if_not_exists(
                    id=BIRDS_CONTAINER,
                    partition_key=PartitionKey(path="/family_code"),
                )
            else:
                # Managed identity — container must already exist
                _birds_container = db.get_container_client(BIRDS_CONTAINER)
    return _birds_container
