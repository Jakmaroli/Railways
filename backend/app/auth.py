import os
import math
import time
import uuid
import hashlib
import logging
import datetime as dt
from dataclasses import dataclass
from typing import Optional, Union, List

from fastapi import Request, HTTPException, status, Depends
from jose import jwt, JWTError
import bcrypt
import redis

from . import models

logger = logging.getLogger("railsync.auth")

ENV = os.getenv("ENV", "development").lower()
JWT_SECRET = os.getenv("JWT_SECRET")

# Enforce JWT_SECRET security posture
if not JWT_SECRET:
    if ENV == "production":
        raise RuntimeError(
            "CRITICAL SECURITY CONFIGURATION ERROR: JWT_SECRET environment variable "
            "must be explicitly set when ENV=production. Refusing to start with insecure defaults."
        )
    SECRET_KEY = "dev-secret-change-in-production-local-testing-only-32bytes"
else:
    if ENV == "production" and JWT_SECRET in ("change-this-in-production", "dev-secret-change-in-production"):
        raise RuntimeError(
            "CRITICAL SECURITY CONFIGURATION ERROR: Production cannot use default or placeholder JWT_SECRET."
        )
    SECRET_KEY = JWT_SECRET

ALGORITHM = "HS256"
JWT_ISSUER = os.getenv("JWT_ISSUER", "railsync-api")
JWT_AUDIENCE = os.getenv("JWT_AUDIENCE", "railsync-web")
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "15"))

# Trusted reverse proxies for client IP extraction
TRUSTED_PROXIES = [p.strip() for p in os.getenv("TRUSTED_PROXIES", "127.0.0.1,::1").split(",") if p.strip()]

# Dummy bcrypt hash for constant-time comparison on nonexistent user lookup
DUMMY_HASH = bcrypt.hashpw(b"railsync_dummy_salt_for_timing_mitigation", bcrypt.gensalt()).decode("utf-8")


def is_cookie_secure() -> bool:
    """Return whether authentication cookies must require HTTPS (Secure=True).
    Defaults to True unless COOKIE_SECURE is explicitly set to false."""
    cookie_sec = os.getenv("COOKIE_SECURE", "true").lower()
    return cookie_sec not in ("false", "0", "no")


def fingerprint(value: str) -> str:
    """Hash sensitive identifiers with SHA-256 before logging or storing in Redis keys."""
    return hashlib.sha256(value.encode("utf-8")).hexdigest()[:32]


def get_client_ip(request: Request) -> str:
    """Extract trusted client IP without blindly trusting client-supplied X-Forwarded-For headers.
    If the direct client is not a trusted proxy, X-Forwarded-For is ignored to prevent IP spoofing.
    """
    if not request.client or not request.client.host:
        return "127.0.0.1"

    peer_ip = request.client.host
    if peer_ip in TRUSTED_PROXIES:
        xff = request.headers.get("x-forwarded-for")
        if xff:
            # Rightmost untrusted hop in forwarded list
            hops = [ip.strip() for ip in xff.split(",") if ip.strip()]
            if hops:
                return hops[-1]
    return peer_ip


@dataclass(frozen=True)
class CurrentUser:
    """Immutable identity object for authenticated requests, avoiding per-request database lookups."""
    user_id: int
    role: str
    department: str
    username: str = ""
    full_name: str = ""

    @property
    def id(self) -> int:
        return self.user_id


def init_redis_client():
    redis_url = os.getenv("REDIS_URL")
    if redis_url:
        try:
            client = redis.from_url(redis_url, decode_responses=False)
            client.ping()
            logger.info("Connected to distributed Redis instance at %s", redis_url.split("@")[-1])
            return client
        except Exception as exc:
            if ENV == "production":
                raise RuntimeError(
                    f"CRITICAL SECURITY CONFIGURATION ERROR: Failed to connect to Redis ({exc}) in production."
                )
            logger.warning("Failed to connect to configured REDIS_URL (%s). Falling back to fakeredis mock.", exc)

    if ENV == "production":
        raise RuntimeError(
            "CRITICAL SECURITY CONFIGURATION ERROR: REDIS_URL must be configured in production for distributed rate limiting."
        )

    # In dev/testing, use fakeredis for zero-setup local resilience
    try:
        import fakeredis
        logger.info("Using fakeredis in-memory mock for local development/testing rate limiting.")
        return fakeredis.FakeStrictRedis()
    except Exception as exc:
        raise RuntimeError(f"Cannot initialize rate limiting backend: {exc}")


class RedisTieredLoginRateLimiter:
    """Distributed, tiered login rate limiter backed by Redis.
    Enforces atomic sliding-window checks across:
      - IP burst: 5 attempts / 60 seconds
      - IP sustained: 30 attempts / 10 minutes (600s)
      - Username: 8 attempts / 10 minutes (600s)
    """

    def __init__(self, redis_client=None):
        self._redis = redis_client

    @property
    def redis(self):
        if self._redis is None:
            self._redis = init_redis_client()
        return self._redis

    def set_redis_client(self, client):
        """Allows test fixtures to inject custom Redis or fakeredis instances."""
        self._redis = client

    def check_rate_limit(self, client_ip: str, username: str):
        now = time.time()
        ip_fp = fingerprint(client_ip)
        user_fp = fingerprint(username.strip().lower())

        burst_key = f"rl:railsync:login:ip:{ip_fp}"
        sustained_key = f"rl:railsync:login:sustained:{ip_fp}"
        user_key = f"rl:railsync:login:user:{user_fp}"

        pipe = self.redis.pipeline(transaction=True)
        # IP burst: 60s, limit 5
        pipe.zremrangebyscore(burst_key, "-inf", now - 60)
        pipe.zcard(burst_key)
        pipe.zrange(burst_key, 0, 0, withscores=True)

        # IP sustained: 600s, limit 30
        pipe.zremrangebyscore(sustained_key, "-inf", now - 600)
        pipe.zcard(sustained_key)
        pipe.zrange(sustained_key, 0, 0, withscores=True)

        # User: 600s, limit 8
        pipe.zremrangebyscore(user_key, "-inf", now - 600)
        pipe.zcard(user_key)
        pipe.zrange(user_key, 0, 0, withscores=True)

        res = pipe.execute()
        burst_count, burst_oldest = res[1], res[2]
        sustained_count, sustained_oldest = res[4], res[5]
        user_count, user_oldest = res[7], res[8]

        # 1. Burst limit check
        if burst_count >= 5:
            oldest_ts = burst_oldest[0][1] if burst_oldest else now
            retry_after = max(1, math.ceil(oldest_ts + 60 - now))
            reset_epoch = int(now + retry_after)
            logger.warning(
                "rate_limit_exceeded tier=ip_burst ip=%s count=%d retry_after=%d",
                client_ip, burst_count, retry_after
            )
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Too many login attempts. Please try again later.",
                headers={
                    "Retry-After": str(retry_after),
                    "RateLimit-Limit": "5",
                    "RateLimit-Remaining": "0",
                    "RateLimit-Reset": str(reset_epoch),
                },
            )

        # 2. Sustained limit check
        if sustained_count >= 30:
            oldest_ts = sustained_oldest[0][1] if sustained_oldest else now
            retry_after = max(1, math.ceil(oldest_ts + 600 - now))
            reset_epoch = int(now + retry_after)
            logger.warning(
                "rate_limit_exceeded tier=ip_sustained ip=%s count=%d retry_after=%d",
                client_ip, sustained_count, retry_after
            )
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Too many login attempts. Please try again later.",
                headers={
                    "Retry-After": str(retry_after),
                    "RateLimit-Limit": "30",
                    "RateLimit-Remaining": "0",
                    "RateLimit-Reset": str(reset_epoch),
                },
            )

        # 3. User account limit check
        if user_count >= 8:
            oldest_ts = user_oldest[0][1] if user_oldest else now
            retry_after = max(1, math.ceil(oldest_ts + 600 - now))
            reset_epoch = int(now + retry_after)
            logger.warning(
                "rate_limit_exceeded tier=user username_fp=%s count=%d retry_after=%d",
                user_fp, user_count, retry_after
            )
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Too many login attempts. Please try again later.",
                headers={
                    "Retry-After": str(retry_after),
                    "RateLimit-Limit": "8",
                    "RateLimit-Remaining": "0",
                    "RateLimit-Reset": str(reset_epoch),
                },
            )

    def record_failure(self, client_ip: str, username: str):
        now = time.time()
        ip_fp = fingerprint(client_ip)
        user_fp = fingerprint(username.strip().lower())
        member = f"{now}:{uuid.uuid4().hex[:8]}"

        burst_key = f"rl:railsync:login:ip:{ip_fp}"
        sustained_key = f"rl:railsync:login:sustained:{ip_fp}"
        user_key = f"rl:railsync:login:user:{user_fp}"

        pipe = self.redis.pipeline(transaction=True)
        pipe.zadd(burst_key, {member: now})
        pipe.expire(burst_key, 70)
        pipe.zadd(sustained_key, {member: now})
        pipe.expire(sustained_key, 610)
        pipe.zadd(user_key, {member: now})
        pipe.expire(user_key, 610)
        pipe.execute()

    def reset_user(self, username: str):
        user_fp = fingerprint(username.strip().lower())
        user_key = f"rl:railsync:login:user:{user_fp}"
        self.redis.delete(user_key)

    def reset_all(self):
        """Helper for test suites to wipe rate limit keys."""
        try:
            keys = self.redis.keys("rl:railsync:login:*")
            if keys:
                self.redis.delete(*keys)
        except Exception:
            pass


login_rate_limiter = RedisTieredLoginRateLimiter()


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8")[:72], bcrypt.gensalt()).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(plain.encode("utf-8")[:72], hashed.encode("utf-8"))
    except Exception:
        return False


def create_access_token(data: dict) -> str:
    """Create a cryptographically signed JWT with strict issuer, audience, and 15-minute expiry."""
    to_encode = data.copy()
    now = dt.datetime.now(dt.timezone.utc)
    expire = now + dt.timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({
        "iat": int(now.timestamp()),
        "exp": int(expire.timestamp()),
        "iss": JWT_ISSUER,
        "aud": JWT_AUDIENCE,
    })
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)


def get_current_user(request: Request) -> CurrentUser:
    """Stateless authentication dependency.
    Extracts and validates JWT from secure HttpOnly cookie (or Authorization header for programmatic API clients).
    Performs NO database queries during request processing.
    """
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid username or password.",
        headers={"WWW-Authenticate": "Bearer"},
    )

    # 1. Read secure HttpOnly cookie
    token = request.cookies.get("railsync_access")

    # 2. Fallback to Authorization: Bearer header for test client and API tools
    if not token:
        auth_header = request.headers.get("authorization")
        if auth_header and auth_header.startswith("Bearer "):
            token = auth_header.split(" ", 1)[1].strip()

    if not token:
        raise credentials_exception

    try:
        payload = jwt.decode(
            token,
            SECRET_KEY,
            algorithms=[ALGORITHM],
            audience=JWT_AUDIENCE,
            issuer=JWT_ISSUER,
            options={
                "verify_signature": True,
                "verify_exp": True,
                "verify_aud": True,
                "verify_iss": True,
            }
        )
        username = payload.get("sub")
        role = payload.get("role")
        dept = payload.get("dept")
        user_id = payload.get("user_id")
        full_name = payload.get("full_name", username or "")

        # All claims must be present
        if not username or not role or not dept or user_id is None:
            raise credentials_exception

        return CurrentUser(
            user_id=int(user_id),
            role=str(role),
            department=str(dept),
            username=str(username),
            full_name=str(full_name),
        )
    except JWTError:
        raise credentials_exception


def require_roles(*roles: Union[models.UserRole, str]):
    """Dependency factory restricting an endpoint to specific roles."""
    allowed_roles = {r.value if hasattr(r, "value") else str(r) for r in roles}

    def dependency(user: CurrentUser = Depends(get_current_user)) -> CurrentUser:
        user_role_str = user.role.value if hasattr(user.role, "value") else str(user.role)
        if user_role_str not in allowed_roles:
            raise HTTPException(status_code=403, detail="Not authorized for this action")
        return user

    return dependency
