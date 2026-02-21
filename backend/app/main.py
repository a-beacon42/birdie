"""Birdie API — FastAPI application entry point."""

from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

from app.config import settings
from app.routers import birds, chat, regions
from app.services.cosmos import get_birds_container


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup: eagerly initialise the Cosmos DB connection & container."""
    try:
        get_birds_container()
    except Exception as e:
        # Log but don't crash — allows health check to respond even if Cosmos is misconfigured
        import logging

        logging.warning(
            f"Cosmos DB init failed at startup (will retry on first request): {e}"
        )
    yield


app = FastAPI(
    title="Birdie API",
    description="Backend for the Birdie bird identification flashcard app.",
    version="0.1.0",
    lifespan=lifespan,
)

# --- Rate limiter error handler ---
app.state.limiter = chat.limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# CORS — allow the Expo dev server and any configured origins
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type", "X-API-Key"],
)

# Register routers
app.include_router(birds.router)
app.include_router(regions.router)
app.include_router(chat.router)


@app.get("/health")
async def health():
    return {"status": "ok"}
