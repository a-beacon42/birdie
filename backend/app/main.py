"""Birdie API — FastAPI application entry point."""

import json as _json
import logging
import os
import time
import uuid
from contextlib import asynccontextmanager
from contextvars import ContextVar
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address
from starlette.middleware.base import BaseHTTPMiddleware

from app.config import settings
from app.routers import auth, birds, chat, decks, regions, stats
from app.services.cosmos import get_birds_container
from app.services.cosmos_init import ensure_containers
from app.services.chat_service import close_http_client as close_chat_client
from app.services.ebird_service import close_http_client as close_ebird_client

# ---------------------------------------------------------------------------
#  Structured JSON logging with correlation IDs
# ---------------------------------------------------------------------------

_correlation_id: ContextVar[str] = ContextVar("correlation_id", default="-")


class _JSONFormatter(logging.Formatter):
    """Emit one-line JSON log records with correlation IDs."""

    def format(self, record: logging.LogRecord) -> str:
        payload = {
            "time": self.formatTime(record, self.datefmt),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
            "correlation_id": _correlation_id.get("-"),
        }
        if record.exc_info and record.exc_info[1]:
            payload["exception"] = self.formatException(record.exc_info)
        return _json.dumps(payload, default=str)


def _configure_logging() -> None:
    handler = logging.StreamHandler()
    handler.setFormatter(_JSONFormatter())
    root = logging.getLogger()
    root.handlers.clear()
    root.addHandler(handler)
    root.setLevel(logging.INFO)
    # Quieten noisy libraries
    logging.getLogger("azure").setLevel(logging.WARNING)
    logging.getLogger("httpcore").setLevel(logging.WARNING)
    logging.getLogger("httpx").setLevel(logging.WARNING)


_configure_logging()
logger = logging.getLogger(__name__)


class RequestLoggingMiddleware(BaseHTTPMiddleware):
    """Log every request with method, path, status, latency, and correlation ID."""

    async def dispatch(self, request: Request, call_next):  # type: ignore[override]
        cid = request.headers.get("X-Request-ID") or uuid.uuid4().hex[:16]
        _correlation_id.set(cid)
        start = time.perf_counter()
        response = await call_next(request)
        elapsed_ms = (time.perf_counter() - start) * 1000
        logger.info(
            "%s %s -> %s (%.1fms)",
            request.method,
            request.url.path,
            response.status_code,
            elapsed_ms,
        )
        response.headers["X-Request-ID"] = cid
        return response


# ---------------------------------------------------------------------------
#  OpenTelemetry — distributed tracing (FastAPI, httpx, Azure Monitor)
# ---------------------------------------------------------------------------


def _configure_opentelemetry() -> None:
    """Set up OpenTelemetry tracing if APPLICATIONINSIGHTS_CONNECTION_STRING is set."""
    conn_str = os.environ.get("APPLICATIONINSIGHTS_CONNECTION_STRING", "")
    if not conn_str:
        logger.info(
            "OpenTelemetry: APPLICATIONINSIGHTS_CONNECTION_STRING not set — tracing disabled"
        )
        return

    try:
        from opentelemetry import trace
        from opentelemetry.sdk.resources import Resource
        from opentelemetry.sdk.trace import TracerProvider
        from opentelemetry.sdk.trace.export import BatchSpanProcessor
        from azure.monitor.opentelemetry.exporter import AzureMonitorTraceExporter
        from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor
        from opentelemetry.instrumentation.httpx import HTTPXClientInstrumentor

        resource = Resource.create(
            {"service.name": "birdie-api", "service.version": "2.0.0"}
        )
        provider = TracerProvider(resource=resource)

        exporter = AzureMonitorTraceExporter(connection_string=conn_str)
        provider.add_span_processor(BatchSpanProcessor(exporter))

        trace.set_tracer_provider(provider)

        # Auto-instrument FastAPI and httpx
        FastAPIInstrumentor.instrument()
        HTTPXClientInstrumentor.instrument()

        logger.info("OpenTelemetry tracing enabled (Azure Monitor)")
    except ImportError as e:
        logger.warning("OpenTelemetry packages not available, tracing disabled: %s", e)
    except Exception as e:
        logger.warning("OpenTelemetry initialization failed: %s", e)


_configure_opentelemetry()


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
    if not settings.email_encryption_key:
        missing.append("EMAIL_ENCRYPTION_KEY (required for user accounts)")

    if missing:
        logger.warning("Missing configuration: %s", ", ".join(missing))

    try:
        get_birds_container()
        ensure_containers()
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
    allow_methods=["GET", "POST", "PUT", "DELETE"],
    allow_headers=["Content-Type", "X-API-Key", "Authorization", "X-Request-ID"],
)

# Request logging middleware (added after CORS so it sees actual responses)
app.add_middleware(RequestLoggingMiddleware)

# Register routers under versioned API prefix
_API_V1 = "/api/v1"
app.include_router(auth.router, prefix=_API_V1)
app.include_router(birds.router, prefix=_API_V1)
app.include_router(decks.router, prefix=_API_V1)
app.include_router(regions.router, prefix=_API_V1)
app.include_router(stats.router, prefix=_API_V1)
app.include_router(chat.router, prefix=_API_V1)

# Backward-compat: also serve routes at /api (without version prefix)
# so existing callers that haven't migrated to /api/v1 still work.
_API_COMPAT = "/api"
app.include_router(auth.router, prefix=_API_COMPAT, include_in_schema=False)
app.include_router(birds.router, prefix=_API_COMPAT, include_in_schema=False)
app.include_router(decks.router, prefix=_API_COMPAT, include_in_schema=False)
app.include_router(regions.router, prefix=_API_COMPAT, include_in_schema=False)
app.include_router(stats.router, prefix=_API_COMPAT, include_in_schema=False)
app.include_router(chat.router, prefix=_API_COMPAT, include_in_schema=False)


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
        list(
            container.query_items(
                query="SELECT VALUE COUNT(1) FROM c",
                enable_cross_partition_query=True,
                max_item_count=1,
            )
        )
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
