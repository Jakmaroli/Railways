import secrets
import logging
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy.orm import Session

from .. import models, schemas
from ..database import get_db
from ..auth import (
    verify_password,
    create_access_token,
    get_current_user,
    CurrentUser,
    login_rate_limiter,
    get_client_ip,
    fingerprint,
    is_cookie_secure,
    DUMMY_HASH,
    ACCESS_TOKEN_EXPIRE_MINUTES,
)

logger = logging.getLogger("railsync.auth.router")

router = APIRouter(prefix="/api/auth", tags=["auth"])


async def _extract_credentials(request: Request) -> tuple[str, str]:
    """Parse username and password from JSON, form-data, or x-www-form-urlencoded."""
    content_type = request.headers.get("content-type", "").lower()
    username = ""
    password = ""

    if "application/json" in content_type:
        try:
            body = await request.json()
            if isinstance(body, dict):
                username = str(body.get("username", "") or "")
                password = str(body.get("password", "") or "")
        except Exception:
            pass
    elif "application/x-www-form-urlencoded" in content_type or "multipart/form-data" in content_type:
        try:
            form = await request.form()
            username = str(form.get("username", "") or "")
            password = str(form.get("password", "") or "")
        except Exception:
            pass

    if not username and not password:
        # Fallback to query params or empty
        username = request.query_params.get("username", "")
        password = request.query_params.get("password", "")

    return username, password


async def _handle_login(request: Request, response: Response, db: Session):
    client_ip = get_client_ip(request)
    request_id = getattr(request.state, "request_id", "unknown")
    username_raw, password = await _extract_credentials(request)
    normalized_username = username_raw.strip().lower()

    if not normalized_username or not password:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid username or password.",
        )

    # 1. Tiered rate limiting check (IP burst, IP sustained, and username)
    login_rate_limiter.check_rate_limit(client_ip, normalized_username)

    # 2. Database lookup
    user = db.query(models.User).filter(models.User.username == normalized_username).first()

    # 3. Cryptographic verification with timing attack mitigation
    if not user:
        # Perform constant-time dummy verification so execution time does not reveal username existence
        verify_password("dummy_password", DUMMY_HASH)
        login_rate_limiter.record_failure(client_ip, normalized_username)
        logger.warning(
            "authentication_failure request_id=%s username_fp=%s ip=%s reason=nonexistent_user",
            request_id,
            fingerprint(normalized_username),
            client_ip,
        )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid username or password.",
        )

    if not verify_password(password, user.hashed_password):
        login_rate_limiter.record_failure(client_ip, normalized_username)
        logger.warning(
            "authentication_failure request_id=%s username_fp=%s ip=%s reason=bad_password",
            request_id,
            fingerprint(normalized_username),
            client_ip,
        )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid username or password.",
        )

    # Successful login: reset username rate limit bucket
    login_rate_limiter.reset_user(normalized_username)

    # 4. Create short-lived, signed JWT
    user_role_str = user.role.value if hasattr(user.role, "value") else str(user.role)
    user_dept_str = user.department.value if hasattr(user.department, "value") else str(user.department)

    token_payload = {
        "sub": user.username,
        "user_id": user.id,
        "role": user_role_str,
        "dept": user_dept_str,
        "full_name": user.full_name,
    }
    token = create_access_token(token_payload)

    # 5. Set HttpOnly, Secure, SameSite=Strict session cookie
    cookie_secure = is_cookie_secure()
    max_age_seconds = ACCESS_TOKEN_EXPIRE_MINUTES * 60

    response.set_cookie(
        key="railsync_access",
        value=token,
        httponly=True,
        secure=cookie_secure,
        samesite="strict",
        max_age=max_age_seconds,
        path="/",
    )

    # 6. Issue double-submit CSRF cookie (readable by frontend client)
    csrf_token = secrets.token_urlsafe(32)
    response.set_cookie(
        key="railsync_csrf",
        value=csrf_token,
        httponly=False,
        secure=cookie_secure,
        samesite="strict",
        max_age=max_age_seconds,
        path="/",
    )

    logger.info(
        "authentication_success request_id=%s username_fp=%s ip=%s",
        request_id,
        fingerprint(normalized_username),
        client_ip,
    )

    user_out = schemas.UserOut.model_validate(user)
    return {
        "user": user_out,
        "token_type": "bearer",
        "access_token": token,  # retained for backward compatibility with programmatic test callers
    }


@router.post("/railsync/login")
async def login_standard(request: Request, response: Response, db: Session = Depends(get_db)):
    """Standard hardened RailSync login endpoint setting secure HttpOnly cookies."""
    return await _handle_login(request, response, db)


@router.post("/login")
async def login_compat(request: Request, response: Response, db: Session = Depends(get_db)):
    """Backward-compatibility login endpoint mapping to the exact same hardened logic."""
    return await _handle_login(request, response, db)


@router.post("/logout")
@router.post("/railsync/logout")
def logout(response: Response):
    """Secure logout clearing HttpOnly authentication and CSRF cookies."""
    response.delete_cookie(key="railsync_access", path="/")
    response.delete_cookie(key="railsync_csrf", path="/")
    return {"message": "Logged out successfully"}


@router.get("/me", response_model=schemas.UserOut)
def me(current_user: CurrentUser = Depends(get_current_user)):
    """Session restoration endpoint deriving user identity statelessly from JWT without DB query."""
    return schemas.UserOut(
        id=current_user.user_id,
        username=current_user.username,
        full_name=current_user.full_name,
        department=models.Department(current_user.department),
        role=models.UserRole(current_user.role),
    )
