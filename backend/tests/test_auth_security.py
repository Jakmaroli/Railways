import os
import time
import pytest
import fakeredis
from fastapi.testclient import TestClient
from jose import jwt

from app.main import app, validate_environment
from app.database import Base, engine, SessionLocal
from app import models, auth

client = TestClient(app)


@pytest.fixture(autouse=True)
def clean_rate_limits():
    """Ensure clean rate limits between all tests."""
    auth.login_rate_limiter.reset_all()
    yield
    auth.login_rate_limiter.reset_all()


@pytest.fixture(scope="module", autouse=True)
def setup_security_test_db():
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    # Create test user if not exists
    user = db.query(models.User).filter(models.User.username == "sec_test_user").first()
    if not user:
        user = models.User(
            username="sec_test_user",
            hashed_password=auth.hash_password("SecPass123!"),
            full_name="Security Test Engineer",
            department=models.Department.TMS,
            role=models.UserRole.ENGINEER,
        )
        db.add(user)
        db.commit()
    db.close()


# ==============================================================================
# 1. CORS TESTS
# ==============================================================================

def test_cors_allowed_origin_succeeds():
    """1. Allowed origin receives CORS permission and credentials."""
    headers = {"Origin": "http://localhost:5173"}
    res = client.get("/api/health", headers=headers)
    assert res.status_code == 200
    assert res.headers.get("access-control-allow-origin") == "http://localhost:5173"
    assert res.headers.get("access-control-allow-credentials") == "true"


def test_cors_disallowed_origin_rejected():
    """2. Disallowed origin does not receive CORS permission."""
    headers = {"Origin": "https://malicious-attacker.com"}
    res = client.get("/api/health", headers=headers)
    assert res.status_code == 200
    # Starlette CORSMiddleware omits access-control-allow-origin for unauthorized origins
    assert "access-control-allow-origin" not in res.headers


def test_cors_options_preflight():
    """3. OPTIONS preflight succeeds for legitimate origin with allowed methods and headers."""
    headers = {
        "Origin": "http://localhost:5173",
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "Content-Type,Authorization,X-CSRF-Token",
    }
    res = client.options("/api/auth/railsync/login", headers=headers)
    assert res.status_code == 200
    assert res.headers.get("access-control-allow-origin") == "http://localhost:5173"
    assert "POST" in res.headers.get("access-control-allow-methods", "")
    assert res.headers.get("access-control-max-age") == "600"


# ==============================================================================
# 2. RATE LIMITING TESTS
# ==============================================================================

def test_rate_limiting_first_attempts_and_typos_tolerated():
    """1. First login attempts are allowed, minor typos do not instantly lock out."""
    for i in range(3):
        res = client.post(
            "/api/auth/railsync/login",
            json={"username": "typo_user", "password": "wrong_typo_pass"},
        )
        assert res.status_code == 401

    # 4th and 5th are still allowed
    for i in range(2):
        res = client.post(
            "/api/auth/railsync/login",
            json={"username": "typo_user", "password": "wrong_typo_pass"},
        )
        assert res.status_code == 401


def test_rate_limiting_exhaustion_returns_429_with_headers():
    """2. Throttled attempt returns 429 with Retry-After and RateLimit-* headers."""
    for _ in range(5):
        client.post(
            "/api/auth/railsync/login",
            json={"username": "burst_target", "password": "wrong_password"},
        )

    # 6th attempt should be blocked
    res = client.post(
        "/api/auth/railsync/login",
        json={"username": "burst_target", "password": "wrong_password"},
    )
    assert res.status_code == 429
    assert res.json()["status"] == "error"
    assert res.json()["error"]["code"] == 429
    assert res.json()["error"]["message"] == "Too many login attempts. Please try again later."
    assert "Retry-After" in res.headers
    assert int(res.headers["Retry-After"]) > 0
    assert res.headers.get("RateLimit-Limit") == "5"
    assert res.headers.get("RateLimit-Remaining") == "0"
    assert "RateLimit-Reset" in res.headers
    assert "X-Request-ID" in res.headers


def test_rate_limiter_shared_through_redis():
    """3. Rate limiter state is shared across instances through Redis."""
    shared_redis = fakeredis.FakeStrictRedis()
    limiter_1 = auth.RedisTieredLoginRateLimiter(shared_redis)
    limiter_2 = auth.RedisTieredLoginRateLimiter(shared_redis)

    # 5 failures recorded via instance 1
    for _ in range(5):
        limiter_1.record_failure("192.168.1.100", "shared_target")

    # Instance 2 immediately sees the rate limit
    with pytest.raises(Exception) as exc_info:
        limiter_2.check_rate_limit("192.168.1.100", "shared_target")
    assert exc_info.value.status_code == 429


def test_spoofed_forwarded_ip_cannot_bypass_limiter():
    """4. Spoofed X-Forwarded-For headers from untrusted clients cannot bypass the limiter."""
    # Attempt 5 logins with spoofed distinct X-Forwarded-For IPs from direct client
    for i in range(5):
        res = client.post(
            "/api/auth/railsync/login",
            json={"username": f"user_{i}", "password": "badpassword"},
            headers={"X-Forwarded-For": f"203.0.113.{i + 1}"},
        )
        assert res.status_code == 401

    # 6th attempt with another fake IP must still be blocked by socket IP rate limit
    res_blocked = client.post(
        "/api/auth/railsync/login",
        json={"username": "user_another", "password": "badpassword"},
        headers={"X-Forwarded-For": "203.0.113.99"},
    )
    assert res_blocked.status_code == 429


# ==============================================================================
# 3. AUTHENTICATION & ENUMERATION TESTS
# ==============================================================================

def test_valid_login_succeeds():
    """Valid login succeeds via standard endpoint and sets HttpOnly cookies."""
    res = client.post(
        "/api/auth/railsync/login",
        json={"username": "sec_test_user", "password": "SecPass123!"},
    )
    assert res.status_code == 200
    data = res.json()["data"]
    assert data["user"]["username"] == "sec_test_user"
    assert "railsync_access" in res.cookies
    assert "railsync_csrf" in res.cookies


def test_auth_errors_generic_and_indistinguishable():
    """Nonexistent user and wrong password return the identical 401 response."""
    # Nonexistent user
    res_nonexistent = client.post(
        "/api/auth/railsync/login",
        json={"username": "definitely_does_not_exist_user_123", "password": "AnyPassword123!"},
    )
    # Wrong password
    res_wrong_pass = client.post(
        "/api/auth/railsync/login",
        json={"username": "sec_test_user", "password": "WrongPassword123!"},
    )

    assert res_nonexistent.status_code == 401
    assert res_wrong_pass.status_code == 401

    body_1 = res_nonexistent.json()
    body_2 = res_wrong_pass.json()

    assert body_1 == body_2
    assert body_1 == {
        "status": "error",
        "error": {
            "code": 401,
            "message": "Invalid username or password.",
        },
    }


def test_jwt_validation_rejections():
    """JWT signature, expiry, issuer, audience, and required claims are strictly validated."""
    # 1. Invalid signature
    tampered_token = jwt.encode(
        {"sub": "sec_test_user", "user_id": 1, "role": "engineer", "dept": "TMS",
         "iss": auth.JWT_ISSUER, "aud": auth.JWT_AUDIENCE, "exp": int(time.time() + 900)},
        "wrong_tampered_secret_key_32chars",
        algorithm="HS256",
    )
    res = client.get("/api/auth/me", cookies={"railsync_access": tampered_token})
    assert res.status_code == 401

    # 2. Expired token
    expired_token = jwt.encode(
        {"sub": "sec_test_user", "user_id": 1, "role": "engineer", "dept": "TMS",
         "iss": auth.JWT_ISSUER, "aud": auth.JWT_AUDIENCE, "exp": int(time.time() - 60)},
        auth.SECRET_KEY,
        algorithm="HS256",
    )
    res_exp = client.get("/api/auth/me", cookies={"railsync_access": expired_token})
    assert res_exp.status_code == 401

    # 3. Wrong issuer
    wrong_iss_token = jwt.encode(
        {"sub": "sec_test_user", "user_id": 1, "role": "engineer", "dept": "TMS",
         "iss": "rogue-issuer", "aud": auth.JWT_AUDIENCE, "exp": int(time.time() + 900)},
        auth.SECRET_KEY,
        algorithm="HS256",
    )
    res_iss = client.get("/api/auth/me", cookies={"railsync_access": wrong_iss_token})
    assert res_iss.status_code == 401

    # 4. Wrong audience
    wrong_aud_token = jwt.encode(
        {"sub": "sec_test_user", "user_id": 1, "role": "engineer", "dept": "TMS",
         "iss": auth.JWT_ISSUER, "aud": "rogue-audience", "exp": int(time.time() + 900)},
        auth.SECRET_KEY,
        algorithm="HS256",
    )
    res_aud = client.get("/api/auth/me", cookies={"railsync_access": wrong_aud_token})
    assert res_aud.status_code == 401

    # 5. Missing required claims
    missing_claims_token = jwt.encode(
        {"sub": "sec_test_user", "iss": auth.JWT_ISSUER, "aud": auth.JWT_AUDIENCE, "exp": int(time.time() + 900)},
        auth.SECRET_KEY,
        algorithm="HS256",
    )
    res_claims = client.get("/api/auth/me", cookies={"railsync_access": missing_claims_token})
    assert res_claims.status_code == 401


# ==============================================================================
# 4. COOKIE SECURITY TESTS
# ==============================================================================

def test_cookie_security_attributes_and_logout():
    """Access cookie is HttpOnly, Secure, SameSite=Strict; logout deletes cookie."""
    res = client.post(
        "/api/auth/railsync/login",
        json={"username": "sec_test_user", "password": "SecPass123!"},
    )
    assert res.status_code == 200

    cookie_header = res.headers.get("set-cookie", "")
    assert "railsync_access=" in cookie_header
    assert "httponly" in cookie_header.lower()
    assert "samesite=strict" in cookie_header.lower()
    assert "secure" in cookie_header.lower()

    # Logout clears cookies
    logout_res = client.post("/api/auth/logout")
    assert logout_res.status_code == 200
    logout_cookie_header = logout_res.headers.get("set-cookie", "")
    assert 'railsync_access=""' in logout_cookie_header or 'max-age=0' in logout_cookie_header.lower() or 'expires=' in logout_cookie_header.lower()


# ==============================================================================
# 5. CSRF PROTECTION TESTS
# ==============================================================================

def test_csrf_protection_on_mutations():
    """State-changing requests with cookie authentication require matching X-CSRF-Token."""
    login_res = client.post(
        "/api/auth/railsync/login",
        json={"username": "sec_test_user", "password": "SecPass123!"},
    )
    access_cookie = login_res.cookies.get("railsync_access")
    csrf_cookie = login_res.cookies.get("railsync_csrf")
    cookies = {"railsync_access": access_cookie, "railsync_csrf": csrf_cookie}

    # 1. Missing CSRF header -> 403 Forbidden
    res_missing = client.post(
        "/api/defects",
        json={
            "source_system": "TMS",
            "asset_id": "TRK-01",
            "corridor_id": "COR-API-01",
            "defect_type": "Rail Fracture",
            "severity": 4,
            "date_reported": "2026-10-01",
            "due_date": "2026-10-05",
            "estimated_block_duration": 2.5,
            "department": "TMS",
        },
        cookies=cookies,
    )
    assert res_missing.status_code == 403
    assert res_missing.json()["error"]["code"] == 403

    # 2. Invalid CSRF header -> 403 Forbidden
    res_invalid = client.post(
        "/api/defects",
        json={
            "source_system": "TMS",
            "asset_id": "TRK-01",
            "corridor_id": "COR-API-01",
            "defect_type": "Rail Fracture",
            "severity": 4,
            "date_reported": "2026-10-01",
            "due_date": "2026-10-05",
            "estimated_block_duration": 2.5,
            "department": "TMS",
        },
        cookies=cookies,
        headers={"X-CSRF-Token": "invalid_token_value_here"},
    )
    assert res_invalid.status_code == 403

    # 3. Valid CSRF header -> Succeeds
    res_valid = client.post(
        "/api/defects",
        json={
            "source_system": "TMS",
            "asset_id": "TRK-01",
            "corridor_id": "COR-API-01",
            "defect_type": "Rail Fracture",
            "severity": 4,
            "date_reported": "2026-10-01",
            "due_date": "2026-10-05",
            "estimated_block_duration": 2.5,
            "department": "TMS",
        },
        cookies=cookies,
        headers={"X-CSRF-Token": csrf_cookie},
    )
    assert res_valid.status_code == 201


# ==============================================================================
# 6. ERROR HANDLING & TRACEABILITY TESTS
# ==============================================================================

def test_request_id_attached_to_all_responses():
    """X-Request-ID is attached to every response, including errors."""
    res = client.get("/api/health")
    assert "X-Request-ID" in res.headers
    req_id = res.headers["X-Request-ID"]
    assert len(req_id) >= 16

    # Client-supplied request ID is preserved if safe
    custom_id = "test-req-trace-12345"
    res_custom = client.get("/api/health", headers={"X-Request-ID": custom_id})
    assert res_custom.headers.get("X-Request-ID") == custom_id


def test_unhandled_exception_returns_generic_500_without_stack_leak(monkeypatch):
    """Unhandled exceptions produce generic 500 without leaking stack traces or SQL."""
    from app import scoring
    monkeypatch.setattr(scoring, "get_model_status", lambda: 1 / 0)

    app.middleware_stack = None
    err_client = TestClient(app, raise_server_exceptions=False)
    res = err_client.get("/api/health")
    assert res.status_code == 500
    assert res.json() == {
        "status": "error",
        "error": {
            "code": 500,
            "message": "Internal server error",
        },
    }
    assert "ZeroDivisionError" not in res.text
    assert "Traceback" not in res.text
    assert "X-Request-ID" in res.headers
    app.middleware_stack = None



# ==============================================================================
# 7. PRODUCTION SECURITY CONFIGURATION FAIL-FAST TESTS
# ==============================================================================

def test_production_fails_without_jwt_secret(monkeypatch):
    """Production mode must fail startup if JWT_SECRET is missing or default."""
    monkeypatch.setenv("ENV", "production")
    monkeypatch.setenv("JWT_SECRET", "change-this-in-production")
    monkeypatch.setenv("REDIS_URL", "redis://localhost:6379/0")
    monkeypatch.setenv("DATABASE_URL", "postgresql://user:pass@localhost:5432/db")
    monkeypatch.setenv("RAILSYNC_ALLOWED_ORIGINS", "https://railsync.app")

    with pytest.raises(RuntimeError) as exc:
        validate_environment()
    assert "JWT_SECRET" in str(exc.value)


def test_production_fails_with_wildcard_cors(monkeypatch):
    """Production mode must fail startup if CORS wildcard is used."""
    monkeypatch.setenv("ENV", "production")
    monkeypatch.setenv("JWT_SECRET", "valid_strong_production_secret_32_bytes_min")
    monkeypatch.setenv("REDIS_URL", "redis://localhost:6379/0")
    monkeypatch.setenv("DATABASE_URL", "postgresql://user:pass@localhost:5432/db")
    monkeypatch.setenv("RAILSYNC_ALLOWED_ORIGINS", "*")

    with pytest.raises(RuntimeError) as exc:
        validate_environment()
    assert "wildcard" in str(exc.value).lower() or "allowed production origin" in str(exc.value).lower()


def test_production_fails_with_sqlite(monkeypatch):
    """Production mode must fail startup if SQLite is configured."""
    monkeypatch.setenv("ENV", "production")
    monkeypatch.setenv("JWT_SECRET", "valid_strong_production_secret_32_bytes_min")
    monkeypatch.setenv("REDIS_URL", "redis://localhost:6379/0")
    monkeypatch.setenv("DATABASE_URL", "sqlite:///./railsync.db")
    monkeypatch.setenv("RAILSYNC_ALLOWED_ORIGINS", "https://railsync.app")

    with pytest.raises(RuntimeError) as exc:
        validate_environment()
    assert "SQLite" in str(exc.value)


def test_production_fails_without_redis(monkeypatch):
    """Production mode must fail startup if REDIS_URL is missing."""
    monkeypatch.setenv("ENV", "production")
    monkeypatch.setenv("JWT_SECRET", "valid_strong_production_secret_32_bytes_min")
    monkeypatch.delenv("REDIS_URL", raising=False)
    monkeypatch.setenv("DATABASE_URL", "postgresql://user:pass@localhost:5432/db")
    monkeypatch.setenv("RAILSYNC_ALLOWED_ORIGINS", "https://railsync.app")

    with pytest.raises(RuntimeError) as exc:
        validate_environment()
    assert "REDIS_URL" in str(exc.value)
