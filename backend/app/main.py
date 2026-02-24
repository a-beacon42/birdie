"""Birdie API — FastAPI application entry point."""

import logging
import os
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address

from app.config import settings
from app.routers import birds, chat, regions
from app.services.cosmos import get_birds_container
from app.services.chat_service import close_http_client as close_chat_client
from app.services.ebird_service import close_http_client as close_ebird_client

# --- Structured logging ---
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
    datefmt="%Y-%m-%dT%H:%M:%S",
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup: validate config, eagerly initialise the Cosmos DB connection."""
    # Validate critical configuration
    missing: list[str] = []
    if not settings.cosmos_endpoint:
        missing.append("COSMOS_ENDPOINT")
    if not settings.azure_openai_endpoint:
        missing.append("AZURE_OPENAI_ENDPOINT")
    if not settings.azure_openai_deployment_name:
        missing.append("AZURE_OPENAI_DEPLOYMENT_NAME")
    if not settings.ebird_api_key:
        missing.append("EBIRD_API_KEY")
    if settings.is_production and not settings.api_key:
        missing.append("API_KEY (required in production)")

    if missing:
        logger.warning("Missing configuration: %s", ", ".join(missing))

    try:
        get_birds_container()
        logger.info("Cosmos DB connection initialised successfully")
    except Exception as e:
        logger.warning(
            "Cosmos DB init failed at startup (will retry on first request): %s", e
        )
    yield
    # Shutdown: close persistent HTTP clients
    await close_chat_client()
    await close_ebird_client()
    logger.info("HTTP clients closed")


app = FastAPI(
    title="Birdie API",
    description="Backend for the Birdie bird identification flashcard app.",
    version="0.1.0",
    lifespan=lifespan,
)

# --- Rate limiter (shared across all routers) ---
_limiter = Limiter(key_func=get_remote_address)
app.state.limiter = _limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# CORS — allow the Expo dev server and any configured origins
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type", "X-API-Key"],
)

# Register routers under versioned API prefix
_API_V1 = "/api/v1"
app.include_router(birds.router, prefix=_API_V1)
app.include_router(regions.router, prefix=_API_V1)
app.include_router(chat.router, prefix=_API_V1)


@app.get("/health")
async def health():
    """Liveness probe — always responds if the process is running."""
    return {"status": "ok"}


@app.get("/health/ready")
async def health_ready():
    """Readiness probe — verifies Cosmos DB connectivity."""
    try:
        container = get_birds_container()
        # Lightweight: read 1 item to verify the connection
        list(container.query_items(
            query="SELECT VALUE COUNT(1) FROM c",
            enable_cross_partition_query=True,
            max_item_count=1,
        ))
        return {"status": "ready", "cosmos": "connected"}
    except Exception as e:
        logger.warning("Readiness check failed: %s", e)
        return JSONResponse(
            status_code=503,
            content={"status": "not ready", "cosmos": "unavailable"},
        )


# --- Serve the Expo web build if the static directory exists ---
# In production the multi-stage Docker build copies the web export to ./static.
# Mounted AFTER API routes so /api/* and /health are handled by FastAPI first.
_static_dir = Path(__file__).resolve().parent.parent / "static"
if _static_dir.is_dir():
    app.mount("/", StaticFiles(directory=str(_static_dir), html=True), name="web")
