"""Migrate Cosmos DB data from one account to another.

Reads all documents from the source birds container and upserts them into
the destination. Useful for migrating across regions (e.g. WUS2 → EUS2).

Usage:
    1. Copy .env.migration.example → .env.migration and fill in values
    2. Run:  python tools/etl/migrate_cosmos.py
"""

import os
import sys
import time

from dotenv import load_dotenv

# Load migration-specific env file (falls back to .env if not found)
_migration_env = os.path.join(os.path.dirname(__file__), ".env.migration")
if os.path.exists(_migration_env):
    load_dotenv(_migration_env)
else:
    load_dotenv()

# ── Source (old account) ──────────────────────────────────────────────
SRC_ENDPOINT = os.getenv("SRC_COSMOS_ENDPOINT", "")
SRC_KEY = os.getenv("SRC_COSMOS_KEY", "")
SRC_DATABASE = os.getenv("SRC_COSMOS_DATABASE", "birdie")

# ── Destination (new account) ────────────────────────────────────────
DST_ENDPOINT = os.getenv("DST_COSMOS_ENDPOINT", "")
DST_KEY = os.getenv("DST_COSMOS_KEY", "")
DST_DATABASE = os.getenv("DST_COSMOS_DATABASE", "birdie")

CONTAINER_NAME = "birds"
PARTITION_KEY_PATH = "/family_code"


def validate_config() -> None:
    missing = []
    if not SRC_ENDPOINT:
        missing.append("SRC_COSMOS_ENDPOINT")
    if not SRC_KEY:
        missing.append("SRC_COSMOS_KEY")
    if not DST_ENDPOINT:
        missing.append("DST_COSMOS_ENDPOINT")
    if not DST_KEY:
        missing.append("DST_COSMOS_KEY")
    if missing:
        print(f"ERROR: Missing environment variables: {', '.join(missing)}")
        print(f"Set them in {_migration_env} or as env vars.")
        sys.exit(1)
    if SRC_ENDPOINT == DST_ENDPOINT:
        print("ERROR: Source and destination endpoints are the same!")
        sys.exit(1)


def migrate() -> None:
    from azure.cosmos import CosmosClient, PartitionKey

    validate_config()

    print(f"Source:      {SRC_ENDPOINT}")
    print(f"Destination: {DST_ENDPOINT}")
    print()

    # ── Connect to source ────────────────────────────────────────────
    print("Connecting to source account...")
    src_client = CosmosClient(SRC_ENDPOINT, credential=SRC_KEY)
    src_container = src_client.get_database_client(SRC_DATABASE).get_container_client(
        CONTAINER_NAME
    )

    # ── Connect to destination (create DB/container if needed) ───────
    print("Connecting to destination account...")
    dst_client = CosmosClient(DST_ENDPOINT, credential=DST_KEY)
    dst_db = dst_client.create_database_if_not_exists(id=DST_DATABASE)
    dst_container = dst_db.create_container_if_not_exists(
        id=CONTAINER_NAME,
        partition_key=PartitionKey(path=PARTITION_KEY_PATH),
    )

    # ── Read all source documents ────────────────────────────────────
    print("Reading all documents from source...")
    items = list(src_container.read_all_items())
    total = len(items)
    print(f"Found {total} documents to migrate\n")

    if total == 0:
        print("Nothing to migrate.")
        return

    # ── Upsert into destination ──────────────────────────────────────
    start = time.time()
    success = 0
    errors = 0

    for i, item in enumerate(items):
        try:
            dst_container.upsert_item(item)
            success += 1
        except Exception as e:
            errors += 1
            print(f"  ERROR on doc {item.get('id', '?')}: {e}")

        if (i + 1) % 100 == 0 or (i + 1) == total:
            elapsed = time.time() - start
            rate = (i + 1) / elapsed if elapsed > 0 else 0
            print(f"  {i + 1}/{total}  ({rate:.0f} docs/sec)")

    elapsed = time.time() - start
    print(f"\nDone in {elapsed:.1f}s — {success} copied, {errors} errors")

    # ── Verify counts match ──────────────────────────────────────────
    print("\nVerifying destination count...")
    dst_count = len(
        list(
            dst_container.query_items(
                "SELECT c.id FROM c", enable_cross_partition_query=True
            )
        )
    )
    print(f"  Source:      {total} documents")
    print(f"  Destination: {dst_count} documents")

    if dst_count == total:
        print("  ✓ Counts match!")
    else:
        print("  ✗ Count mismatch — investigate before deleting source account")


if __name__ == "__main__":
    migrate()
