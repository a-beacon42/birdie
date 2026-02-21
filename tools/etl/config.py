"""Shared configuration for the ETL pipeline."""

import os
import sys

from dotenv import load_dotenv

load_dotenv()

COSMOS_ENDPOINT = os.getenv("COSMOS_ENDPOINT", "")
COSMOS_KEY = os.getenv("COSMOS_KEY", "")
COSMOS_DATABASE = os.getenv("COSMOS_DATABASE", "birdie")

EBIRD_API_KEY = os.getenv("EBIRD_API_KEY", "")

INAT_S3_BUCKET = os.getenv("INAT_S3_BUCKET", "inaturalist-open-data")

DATA_DIR = os.path.join(os.path.dirname(__file__), "data")
os.makedirs(DATA_DIR, exist_ok=True)

BIRDS_CONTAINER = "birds"

# ---------------------------------------------------------------------------
# Shared Cosmos DB helper — cached container reference used by all ETL steps
# ---------------------------------------------------------------------------
_container = None


def get_container():
    """Return the Cosmos DB birds container, creating DB/container if needed.

    Uses a module-level cache so repeated calls reuse the same client.
    """
    global _container
    if _container is not None:
        return _container

    if not COSMOS_ENDPOINT or not COSMOS_KEY:
        print("ERROR: COSMOS_ENDPOINT and COSMOS_KEY must be set in .env")
        sys.exit(1)

    from azure.cosmos import CosmosClient, PartitionKey

    client = CosmosClient(COSMOS_ENDPOINT, credential=COSMOS_KEY)
    database = client.create_database_if_not_exists(id=COSMOS_DATABASE)
    _container = database.create_container_if_not_exists(
        id=BIRDS_CONTAINER,
        partition_key=PartitionKey(path="/family_code"),
    )
    return _container


def load_all_species() -> list[dict]:
    """Read every document from the birds container."""
    container = get_container()
    return list(container.read_all_items())
