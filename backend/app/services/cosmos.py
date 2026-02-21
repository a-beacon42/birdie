"""Azure Cosmos DB client and container access."""

from azure.cosmos import CosmosClient, PartitionKey
from azure.cosmos.container import ContainerProxy
from azure.cosmos.database import DatabaseProxy

from app.config import settings

_client: CosmosClient | None = None
_database: DatabaseProxy | None = None
_birds_container: ContainerProxy | None = None

BIRDS_CONTAINER = "birds"


def get_cosmos_client() -> CosmosClient:
    global _client
    if _client is None:
        _client = CosmosClient(settings.cosmos_endpoint, credential=settings.cosmos_key)
    return _client


def get_database() -> DatabaseProxy:
    global _database
    if _database is None:
        client = get_cosmos_client()
        _database = client.create_database_if_not_exists(id=settings.cosmos_database)
    return _database


def get_birds_container() -> ContainerProxy:
    """Get (or create) the birds container with familyCode as the partition key."""
    global _birds_container
    if _birds_container is None:
        db = get_database()
        _birds_container = db.create_container_if_not_exists(
            id=BIRDS_CONTAINER,
            partition_key=PartitionKey(path="/family_code"),
        )
    return _birds_container
