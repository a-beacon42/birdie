"""Shared configuration for the ETL pipeline."""

import os
from dotenv import load_dotenv

load_dotenv()

COSMOS_ENDPOINT = os.getenv("COSMOS_ENDPOINT", "")
COSMOS_KEY = os.getenv("COSMOS_KEY", "")
COSMOS_DATABASE = os.getenv("COSMOS_DATABASE", "birdie")

EBIRD_API_KEY = os.getenv("EBIRD_API_KEY", "")

INAT_S3_BUCKET = os.getenv("INAT_S3_BUCKET", "inaturalist-open-data")

DATA_DIR = os.path.join(os.path.dirname(__file__), "data")
os.makedirs(DATA_DIR, exist_ok=True)
