import os
import uuid
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from .database import Base, engine, SessionLocal
from . import models, scoring
from .middleware import EnvelopeMiddleware, CSRFProtectionMiddleware, RequestTracingMiddleware
from .seed import seed
from .routers import auth, corridors, defects, schedule, whatif, dashboard, block_requests, timetable

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("railsync")

ENV = os.getenv("ENV", "development").lower()


def validate_environment():
    """Verify security prerequisites and fail fast on insecure configuration."""
    env = os.getenv("ENV", "development").lower()
    jwt_secret = os.getenv("JWT_SECRET")
    redis_url = os.getenv("REDIS_URL")
    database_url = os.getenv("DATABASE_URL", "sqlite:///./railsync.db")
    allowed_origins_raw = os.getenv("RAILSYNC_ALLOWED_ORIGINS") or os.getenv("ALLOWED_ORIGINS")

    if env == "production":
        if not jwt_secret or jwt_secret in ("change-this-in-production", "dev-secret-change-in-production"):
            raise RuntimeError(
                "CRITICAL SECURITY CONFIGURATION ERROR: A strong, unique JWT_SECRET is required in production."
            )
        if not allowed_origins_raw or "*" in allowed_origins_raw:
            raise RuntimeError(
                "CRITICAL SECURITY CONFIGURATION ERROR: Production must fail startup if no allowed production "
                "origin is configured or wildcard is used in RAILSYNC_ALLOWED_ORIGINS."
            )
        if not redis_url:
            raise RuntimeError(
                "CRITICAL SECURITY CONFIGURATION ERROR: REDIS_URL is required in production for distributed rate limiting."
            )
        if not database_url or database_url.startswith("sqlite"):
            raise RuntimeError(
                "CRITICAL SECURITY CONFIGURATION ERROR: PostgreSQL is required in production. SQLite cannot be used."
            )



@asynccontextmanager
async def lifespan(app: FastAPI):
    # --- Startup ---
    validate_environment()

    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        seed(db)
    finally:
        db.close()

    # Load priority_model.pkl into memory exactly once
    scoring.load_model()
    status = scoring.get_model_status()
    if status["loaded"]:
        logger.info("ML scoring engine ready: %s (feature set: %s)",
                    status["model_type"], ", ".join(status["feature_columns"]))
    else:
        logger.warning("ML scoring engine NOT loaded (%s) — serving priority scores from rule-based fallback.",
                       status["load_error"])

    yield
    # --- Shutdown ---


app = FastAPI(
    title="RailSync AI",
    description="Unified AI-powered block planning system for Indian Railways (SIH26027)",
    version="2.1.0",
    lifespan=lifespan,
)

# Parse explicit CORS allowlist
raw_origins = os.getenv("RAILSYNC_ALLOWED_ORIGINS") or os.getenv("ALLOWED_ORIGINS")
if raw_origins:
    ALLOWED_ORIGINS = [orig.strip() for orig in raw_origins.split(",") if orig.strip()]
else:
    ALLOWED_ORIGINS = ["http://localhost:5173", "http://localhost:4173", "http://localhost:5180"]

# Forbid wildcard origin with credentials
if "*" in ALLOWED_ORIGINS:
    raise RuntimeError("Wildcard origin '*' is forbidden with allow_credentials=True.")

# Middleware registered from innermost to outermost:
# 1. Envelope: formats successful JSON responses
# 2. CSRF: validates X-CSRF-Token on cookie-authenticated mutations
# 3. RequestTracing: assigns X-Request-ID and logs diagnostics
# 4. CORS: outermost wrapper ensuring all responses and preflight requests receive CORS headers
app.add_middleware(EnvelopeMiddleware)
app.add_middleware(CSRFProtectionMiddleware)
app.add_middleware(RequestTracingMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=[
        "GET",
        "POST",
        "PUT",
        "PATCH",
        "DELETE",
        "OPTIONS",
    ],
    allow_headers=[
        "Content-Type",
        "Authorization",
        "X-CSRF-Token",
        "X-Request-ID",
    ],
    expose_headers=[
        "X-Request-ID",
        "RateLimit-Limit",
        "RateLimit-Remaining",
        "RateLimit-Reset",
        "Retry-After",
    ],
    max_age=600,
)


# ---- Standardized error handling ----------------------------------------------
# Preserves headers (such as Retry-After, RateLimit-*, and X-Request-ID) while
# enforcing generic messages for 401, 429, and 500 to prevent information leakage.

@app.exception_handler(StarletteHTTPException)
async def http_exception_handler(request: Request, exc: StarletteHTTPException):
    headers = dict(exc.headers or {})
    request_id = getattr(request.state, "request_id", None) or str(uuid.uuid4())
    headers["X-Request-ID"] = request_id

    if exc.status_code == 401:
        message = "Invalid username or password."
    elif exc.status_code == 429:
        message = "Too many login attempts. Please try again later."
    elif exc.status_code == 403:
        message = exc.detail if exc.detail not in ("Forbidden", "") else "Not authorized for this action"
    elif exc.status_code == 500:
        message = "Internal server error"
    else:
        message = exc.detail

    return JSONResponse(
        status_code=exc.status_code,
        content={"status": "error", "error": {"code": exc.status_code, "message": message}},
        headers=headers,
    )


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    request_id = getattr(request.state, "request_id", None) or str(uuid.uuid4())
    headers = {"X-Request-ID": request_id}
    return JSONResponse(
        status_code=422,
        content={
            "status": "error",
            "error": {"code": 422, "message": "Request validation failed", "details": exc.errors()},
        },
        headers=headers,
    )


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    request_id = getattr(request.state, "request_id", None) or str(uuid.uuid4())
    headers = {"X-Request-ID": request_id}
    # Log detailed traceback internally; return generic 500 to client
    logger.exception("Unhandled server exception on %s %s [request_id=%s]", request.method, request.url.path, request_id)
    return JSONResponse(
        status_code=500,
        content={"status": "error", "error": {"code": 500, "message": "Internal server error"}},
        headers=headers,
    )


app.include_router(auth.router)
app.include_router(corridors.router)
app.include_router(defects.router)
app.include_router(schedule.router)
app.include_router(whatif.router)
app.include_router(dashboard.router)
app.include_router(block_requests.router)
app.include_router(timetable.router)


@app.get("/api/health")
def health():
    """Liveness probe reporting model status."""
    model_status = scoring.get_model_status()
    return {
        "service": "railsync-backend",
        "version": app.version,
        "priority_model_loaded": model_status["loaded"],
        "fallback_active": model_status["fallback_active"],
    }
