"""
RailSync Security & Envelope Middleware Stack:
1. RequestTracingMiddleware: Attaches unique X-Request-ID, measures request duration, and logs diagnostics securely.
2. CSRFProtectionMiddleware: Enforces double-submit CSRF token defense-in-depth on cookie-authenticated mutations.
3. EnvelopeMiddleware: Standardizes 2xx JSON responses under /api into {"status": "success", "data": ...}.
"""
import json
import time
import uuid
import secrets
import logging
import re
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import Response, JSONResponse
from starlette.requests import Request

from .auth import get_client_ip

logger = logging.getLogger("railsync.middleware")

SAFE_REQUEST_ID_REGEX = re.compile(r"^[a-zA-Z0-9_-]{1,64}$")
CSRF_EXEMPT_PATHS = {
    "/api/auth/login",
    "/api/auth/railsync/login",
    "/api/health",
}


class RequestTracingMiddleware(BaseHTTPMiddleware):
    """Enforces request ID traceability and safe, masked diagnostic logging without leaking sensitive data."""

    async def dispatch(self, request: Request, call_next):
        # Validate incoming client request ID or generate a new UUIDv4
        req_id_header = request.headers.get("x-request-id", "").strip()
        if req_id_header and SAFE_REQUEST_ID_REGEX.match(req_id_header):
            request_id = req_id_header
        else:
            request_id = str(uuid.uuid4())

        request.state.request_id = request_id
        start_time = time.perf_counter()

        try:
            response = await call_next(request)
        except Exception as exc:
            client_ip = get_client_ip(request)
            logger.exception(
                "unhandled_server_exception method=%s path=%s request_id=%s ip=%s",
                request.method,
                request.url.path,
                request_id,
                client_ip,
            )
            response = JSONResponse(
                status_code=500,
                content={
                    "status": "error",
                    "error": {
                        "code": 500,
                        "message": "Internal server error",
                    },
                },
                headers={"X-Request-ID": request_id},
            )

        duration_ms = (time.perf_counter() - start_time) * 1000.0
        response.headers["X-Request-ID"] = request_id


        # Diagnostic log (never logs passwords, cookies, or auth tokens)
        client_ip = get_client_ip(request)
        logger.info(
            "request_completed method=%s path=%s status=%d latency_ms=%.2f request_id=%s ip=%s",
            request.method,
            request.url.path,
            response.status_code,
            duration_ms,
            request_id,
            client_ip,
        )

        return response


class CSRFProtectionMiddleware(BaseHTTPMiddleware):
    """Defense-in-depth CSRF protection for cookie-authenticated state-changing requests (POST, PUT, PATCH, DELETE)."""

    async def dispatch(self, request: Request, call_next):
        request_id = getattr(request.state, "request_id", str(uuid.uuid4()))

        # CSRF only applies to mutations on /api
        if not request.url.path.startswith("/api"):
            return await call_next(request)

        if request.method in ("GET", "HEAD", "OPTIONS", "TRACE"):
            return await call_next(request)

        if request.url.path in CSRF_EXEMPT_PATHS:
            return await call_next(request)

        # Check if cookie-based session is in use
        has_access_cookie = "railsync_access" in request.cookies
        has_csrf_cookie = "railsync_csrf" in request.cookies

        # If cookie authentication is active, enforce X-CSRF-Token validation
        if has_access_cookie or has_csrf_cookie:
            csrf_cookie = request.cookies.get("railsync_csrf")
            csrf_header = request.headers.get("x-csrf-token")

            if not csrf_cookie or not csrf_header or not secrets.compare_digest(csrf_cookie, csrf_header):
                logger.warning(
                    "csrf_validation_failed path=%s request_id=%s has_cookie=%s has_header=%s",
                    request.url.path,
                    request_id,
                    bool(csrf_cookie),
                    bool(csrf_header),
                )
                return JSONResponse(
                    status_code=403,
                    content={
                        "status": "error",
                        "error": {
                            "code": 403,
                            "message": "CSRF token missing or invalid",
                        },
                    },
                    headers={"X-Request-ID": request_id},
                )

        return await call_next(request)


class EnvelopeMiddleware(BaseHTTPMiddleware):
    """Standardizes every REST response under /api into {"status": "success", "data": ...}."""

    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)

        # Only touch /api JSON responses
        if not request.url.path.startswith("/api"):
            return response

        content_type = response.headers.get("content-type", "")
        if "application/json" not in content_type:
            return response

        # Non-2xx bodies are handled by exception handlers
        if not (200 <= response.status_code < 300):
            return response

        body = b"".join([chunk async for chunk in response.body_iterator])
        try:
            payload = json.loads(body)
        except (json.JSONDecodeError, UnicodeDecodeError):
            return Response(
                content=body,
                status_code=response.status_code,
                media_type=response.media_type,
                headers=dict(response.headers),
            )

        # Avoid double-wrapping if already shaped
        if isinstance(payload, dict) and payload.get("status") in ("success", "error"):
            new_body = json.dumps(payload).encode("utf-8")
        else:
            wrapped = {"status": "success", "data": payload}
            new_body = json.dumps(wrapped).encode("utf-8")

        new_raw_headers = [(k, v) for k, v in response.raw_headers if k.lower() != b"content-length"]
        new_res = Response(
            content=new_body,
            status_code=response.status_code,
            media_type="application/json",
        )
        new_res.raw_headers = new_raw_headers
        return new_res

