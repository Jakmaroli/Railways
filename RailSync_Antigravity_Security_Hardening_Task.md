# RailSync Authentication Hardening — Antigravity Implementation Task

## Objective

Harden and restore the RailSync login flow without weakening the existing security posture.

The implementation must:
- preserve strong encryption/password hashing;
- never expose raw database/stack errors to clients;
- prevent username/account enumeration;
- use explicit CORS allowlists;
- add distributed, tiered login rate limiting;
- return correct HTTP 429 responses with rate-limit headers;
- move authentication tokens out of localStorage into secure HttpOnly cookies;
- reduce unnecessary database lookups during authenticated traffic;
- maintain low latency for railway operation sync APIs;
- remain production-ready for Railway deployment.

---

# 1. Inspect the existing project first

Before modifying anything:

1. Inspect the backend authentication implementation.
2. Inspect CORS middleware/configuration.
3. Inspect JWT creation and verification.
4. Inspect `get_current_user()` / authentication dependencies.
5. Inspect frontend login/AuthContext/Axios code.
6. Inspect Docker/Railway environment configuration.
7. Inspect existing exception handlers.
8. Inspect database configuration.
9. Inspect whether Redis is already present.
10. Preserve existing API behavior unless a change is required below.

Do not blindly replace working code. Integrate into the existing architecture.

---

# 2. CORS hardening

The current configuration must NOT use:

```python
allow_origins=["*"]
```

with credentials.

Implement an environment-driven explicit allowlist.

Example:

```env
RAILSYNC_ALLOWED_ORIGINS=https://railsync.example.com,https://staging.railsync.example.com
```

Parse the comma-separated list safely.

Use:

```python
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
```

Requirements:

- Never use wildcard origin.
- Never use wildcard methods/headers unless the existing application genuinely requires them.
- Production must fail startup if no allowed production origin is configured.
- Valid browser preflight requests must succeed.
- Invalid origins must not receive CORS permission.
- Do not bypass the firewall or reverse proxy.

---

# 3. Standardize login endpoint

The preferred endpoint is:

```text
POST /api/auth/railsync/login
```

If the project currently uses:

```text
POST /api/auth/login
```

either migrate the frontend to the new endpoint or temporarily retain a compatibility route if removing it would break existing clients.

Do not duplicate authentication logic between routes.

Both routes, if retained, must use the same rate limiting and authentication implementation.

---

# 4. Tiered login rate limiting

Implement distributed rate limiting using Redis.

If Redis is not currently installed:

```txt
redis>=5,<6
```

Use an environment variable:

```env
REDIS_URL=redis://...
```

Do not use an in-memory-only limiter for production.

Apply multiple limits to:

### IP burst

```text
5 attempts / 60 seconds / IP
```

### IP sustained

```text
30 attempts / 10 minutes / IP
```

### Username/account

```text
8 attempts / 10 minutes / normalized username
```

The goal is to tolerate minor user mistakes while stopping brute-force attacks.

The username should be normalized consistently, e.g.:

```python
username_key = username.strip().lower()
```

Do not place raw sensitive usernames directly into Redis keys. Hash/fingerprint the identifier.

Example:

```python
import hashlib

def fingerprint(value: str) -> str:
    return hashlib.sha256(
        value.encode("utf-8")
    ).hexdigest()[:32]
```

Redis keys should look like:

```text
rl:railsync:login:ip:<fingerprint>
rl:railsync:login:user:<fingerprint>
rl:railsync:login:sustained:<fingerprint>
```

Use atomic Redis operations or a Lua script where necessary to prevent race conditions.

---

# 5. Rate-limit response contract

Rate limiting MUST produce:

```http
HTTP/1.1 429 Too Many Requests
Retry-After: 42
RateLimit-Limit: 5
RateLimit-Remaining: 0
RateLimit-Reset: 1234567890
```

JSON:

```json
{
  "status": "error",
  "error": {
    "code": 429,
    "message": "Too many login attempts. Please try again later."
  }
}
```

Never convert an intentional rate-limit exception into HTTP 500.

The global exception handling layer must preserve HTTP exception headers.

For example:

```python
headers = dict(exc.headers or {})
```

and return them in the response.

---

# 6. Client IP handling

Do NOT blindly trust arbitrary:

```text
X-Forwarded-For
```

headers from clients.

If Railway/reverse proxies provide forwarded IP information, configure the trusted proxy boundary correctly and only use trusted proxy-provided client IPs.

Do not allow a client to spoof its IP and bypass rate limiting.

---

# 7. Secure JWT configuration

Remove insecure fallbacks such as:

```python
os.getenv("JWT_SECRET", "dev-secret-change-in-production")
```

Production must fail startup when the JWT secret is missing.

Use:

```python
SECRET_KEY = os.getenv("JWT_SECRET")

if not SECRET_KEY:
    raise RuntimeError("JWT_SECRET is required")
```

JWT should contain:

```text
sub
role
dept
iat
exp
iss
aud
```

Example:

```python
now = datetime.now(timezone.utc)
expire = now + timedelta(minutes=15)

payload = {
    **data,
    "iat": now,
    "exp": expire,
    "iss": JWT_ISSUER,
    "aud": JWT_AUDIENCE,
}
```

Validate:

- signature;
- expiration;
- issuer;
- audience;
- required claims.

Do not weaken the cryptographic algorithm.

If the existing algorithm is secure and already deployed, preserve compatibility unless there is a compelling reason to migrate.

---

# 8. Access-token lifetime

Change excessively long access-token lifetimes.

Target:

```text
10–15 minutes
```

Recommended:

```python
ACCESS_TOKEN_EXPIRE_MINUTES = 15
```

Do NOT create 12-hour access tokens merely to avoid reauthentication.

If persistent sessions are needed, implement refresh tokens separately.

---

# 9. Secure cookie-based authentication

The frontend currently stores the JWT in localStorage.

Remove JWT storage from localStorage.

The access token should be issued as:

```python
response.set_cookie(
    key="railsync_access",
    value=token,
    httponly=True,
    secure=True,
    samesite="strict",
    max_age=900,
    path="/",
)
```

Requirements:

- `HttpOnly=True`
- `Secure=True`
- `SameSite="strict"`
- short lifetime
- appropriate path
- never expose token to JavaScript

Do not log the cookie value.

Do not return the JWT in the normal login JSON response if it is no longer required by the frontend.

---

# 10. Frontend Axios changes

Configure Axios:

```typescript
const client = axios.create({
  baseURL: "/api",
  withCredentials: true,
});
```

Remove code that does:

```typescript
localStorage.getItem("railsync_token")
```

Remove code that does:

```typescript
localStorage.setItem("railsync_token", ...)
```

Remove manual:

```typescript
Authorization: Bearer <token>
```

in the browser if authentication is fully cookie-based.

The browser should automatically send the secure HttpOnly cookie.

---

# 11. CSRF protection

Because authentication uses cookies, implement defense-in-depth CSRF protection.

Use a CSRF cookie/token pattern.

For example:

```text
railsync_access
    HttpOnly
    Secure
    SameSite=Strict

railsync_csrf
    Secure
    SameSite=Strict
    NOT HttpOnly
```

For state-changing requests:

```text
POST
PUT
PATCH
DELETE
```

require:

```http
X-CSRF-Token: <csrf-token>
```

Validate the CSRF token server-side.

Do not require CSRF tokens for safe GET requests unless the existing architecture requires it.

---

# 12. Stateless request authentication

The existing authentication dependency performs a database lookup on every authenticated request.

Refactor the normal request path to:

```text
request
  ↓
read secure cookie
  ↓
verify JWT
  ↓
validate exp/iss/aud
  ↓
read sub/role/dept
  ↓
authorization
  ↓
endpoint
```

Do NOT query PostgreSQL for every authenticated request.

Create an immutable object such as:

```python
@dataclass(frozen=True)
class CurrentUser:
    user_id: int
    role: str
    department: str
```

Return it from the authentication dependency.

---

# 13. Important revocation trade-off

Short-lived stateless JWTs cannot instantly know that an account was disabled.

Therefore:

- keep access JWT lifetime around 15 minutes;
- implement refresh-token rotation/revocation if persistent sessions are needed;
- do not create long-lived access tokens.

If the application already has a session/revocation mechanism, integrate with it instead of creating a duplicate mechanism.

---

# 14. Add /auth/me

Add:

```text
GET /api/auth/me
```

The endpoint should derive the authenticated identity from the JWT.

Use it when the frontend loads to restore the current session.

Do not expose JWT contents unnecessarily.

---

# 15. Generic authentication errors

All authentication failures must look equivalent to the client.

Use:

```json
{
  "status": "error",
  "error": {
    "code": 401,
    "message": "Invalid username or password."
  }
}
```

Use the same public message for:

- nonexistent username;
- wrong password;
- disabled account;
- invalid credentials;
- other authentication failures where revealing the distinction would enable enumeration.

Never return:

```text
User does not exist
```

or:

```text Password is incorrect
```

or raw database errors.

---

# 16. Secure diagnostic logging

The server must still record useful diagnostic information.

Add request IDs.

If a request does not contain a trusted request ID:

```python
request_id = str(uuid.uuid4())
```

Return:

```http
X-Request-ID: <id>
```

in responses.

Security logs may include:

```text
request_id
hashed username
trusted client IP
route
status
reason
timestamp
latency
```

Do NOT log:

```text
password
JWT
cookie value
Authorization header
database password
JWT_SECRET
CSRF token
raw SQL errors
```

Hash sensitive identifiers before logging.

Example:

```python
logger.warning(
    "authentication_failure "
    "request_id=%s "
    "username_fp=%s "
    "ip=%s "
    "reason=%s",
    request_id,
    fingerprint(username),
    client_ip,
    reason,
)
```

---

# 17. Global error handling

Preserve the existing structured error response.

Requirements:

### 401

```json
{
  "status": "error",
  "error": {
    "code": 401,
    "message": "Invalid username or password."
  }
}
```

### 403

Generic authorization failure.

### 429

```json
{
  "status": "error",
  "error": {
    "code": 429,
    "message": "Too many login attempts. Please try again later."
  }
}
```

Must preserve:

```text
Retry-After
RateLimit-Limit
RateLimit-Remaining
RateLimit-Reset
X-Request-ID
```

### 500

```json
{
  "status": "error",
  "error": {
    "code": 500,
    "message": "Internal server error"
  }
}
```

Detailed exception information belongs only in server logs.

---

# 18. Logout

Implement:

```text
POST /api/auth/logout
```

The endpoint must clear the authentication cookie.

Example:

```python
response.delete_cookie(
    key="railsync_access",
    path="/",
)
```

If refresh tokens are implemented, revoke/rotate the relevant refresh token family.

---

# 19. Production environment configuration

Do not commit real secrets.

Production configuration should use:

```env
DATABASE_URL=<Railway PostgreSQL URL>
REDIS_URL=<Railway Redis URL>
JWT_SECRET=<strong secret>
JWT_ISSUER=railsync-api
JWT_AUDIENCE=railsync-web
RAILSYNC_ALLOWED_ORIGINS=https://<production-frontend-domain>
```

Remove:

```text
JWT_SECRET=change-this-in-production
```

from production deployment configuration.

The application must refuse to start if required production secrets are missing.

---

# 20. Database

If PostgreSQL is already configured, preserve it.

If SQLite is still used in the production Railway deployment, migrate production to PostgreSQL.

SQLite can remain useful for local development if desired.

Do not rewrite unrelated database models.

---

# 21. Performance requirements

Authentication changes must not increase latency for normal RailSync operation-sync APIs.

Target:

```text
Normal authenticated API request:
JWT verification + authorization
NO database lookup
```

Login itself may perform:

```text
Redis rate check
+
one user lookup
+
bcrypt verification
+
JWT creation
```

Do not cache passwords.

Do not weaken bcrypt/work factor merely for speed.

Do not bypass authentication during traffic spikes.

---

# 22. Frontend rate-limit UX

Axios should handle:

```text
401
```

by clearing local user state and redirecting to login.

For:

```text
429
```

show a friendly message based on `Retry-After`.

Example:

```typescript
if (err.response?.status === 429) {
  const retryAfter =
    err.response.headers["retry-after"];

  err.message = retryAfter
    ? `Too many attempts. Try again in ${retryAfter} seconds.`
    : "Too many attempts. Please try again later.";
}
```

Do not expose internal Redis/database errors.

---

# 23. Automated tests

Add/modify tests for all of the following.

## CORS

Test:

1. allowed origin succeeds;
2. disallowed origin does not receive CORS permission;
3. credentials are allowed only for allowlisted origins;
4. OPTIONS preflight works for legitimate frontend origin.

## Rate limiting

Test:

1. first login attempts are allowed;
2. minor typos remain usable;
3. limit eventually returns 429;
4. `Retry-After` exists;
5. `RateLimit-*` headers exist;
6. rate limiter is shared through Redis;
7. spoofed forwarded IP cannot bypass the limiter.

## Authentication

Test:

1. valid login succeeds;
2. wrong password returns 401;
3. nonexistent user returns the same public 401 response;
4. disabled user does not reveal account state;
5. JWT signature is validated;
6. expired JWT is rejected;
7. incorrect issuer is rejected;
8. incorrect audience is rejected;
9. missing required claims are rejected.

## Cookies

Test:

```text
HttpOnly=true
Secure=true
SameSite=Strict
```

Test logout clears the cookie.

## CSRF

Test state-changing requests:

- valid CSRF token succeeds;
- missing token fails;
- invalid token fails.

## Error handling

Test:

- intentional 429 stays 429;
- headers survive exception handling;
- unexpected exceptions become generic 500;
- stack traces never appear in API responses.

---

# 24. Do not make these changes

NEVER:

- use CORS `*` with credentials;
- disable TLS;
- weaken password hashing;
- return database exceptions;
- expose JWTs to JavaScript unnecessarily;
- put JWTs in localStorage;
- disable rate limiting to fix login friction;
- bypass authentication for internal routes;
- trust arbitrary client-supplied `X-Forwarded-For`;
- hard-code production secrets;
- log passwords or tokens;
- create 12-hour access JWTs just for convenience;
- remove firewall protections.

---

# 25. Implementation order

Implement in this order:

1. Inspect current authentication/CORS/error architecture.
2. Add configuration validation.
3. Fix explicit CORS allowlist.
4. Add Redis connection.
5. Implement atomic tiered login rate limiter.
6. Integrate limiter with login.
7. Preserve 429 headers through global error handling.
8. Implement secure cookie-based JWT.
9. Remove frontend JWT localStorage handling.
10. Add JWT issuer/audience validation.
11. Refactor authenticated request dependency to avoid DB lookups.
12. Add CSRF protection.
13. Add `/auth/me`.
14. Implement secure logout.
15. Improve request/security logging.
16. Add tests.
17. Update Docker/Railway environment configuration.
18. Run backend tests.
19. Run frontend build/tests.
20. Perform a final security review.

---

# 26. Definition of Done

The work is complete only when:

- [ ] production CORS contains no wildcard origin;
- [ ] legitimate browser preflight succeeds;
- [ ] invalid origins receive no CORS permission;
- [ ] login has distributed Redis rate limiting;
- [ ] login returns 429 instead of 500 when throttled;
- [ ] 429 contains Retry-After;
- [ ] rate-limit headers are preserved;
- [ ] small user typos are tolerated;
- [ ] brute-force attempts are throttled;
- [ ] JWT is not stored in localStorage;
- [ ] JWT is HttpOnly/Secure/SameSite=Strict;
- [ ] JWT has short expiry;
- [ ] JWT issuer and audience are validated;
- [ ] authenticated requests don't perform unnecessary DB lookups;
- [ ] CSRF protection exists for state-changing cookie-authenticated requests;
- [ ] authentication failures are generic;
- [ ] server logs contain useful masked diagnostics;
- [ ] passwords/tokens/secrets never appear in logs;
- [ ] request IDs are available for troubleshooting;
- [ ] missing production secrets fail startup;
- [ ] PostgreSQL is used for production persistence;
- [ ] Redis is used for distributed rate limiting;
- [ ] automated security/authentication tests pass;
- [ ] frontend login/logout/session restoration work;
- [ ] existing RailSync operation-sync functionality remains intact.

---

# 27. Final deliverable from Antigravity

After implementation, provide:

1. A concise list of files changed.
2. A concise explanation of each security change.
3. Required new environment variables.
4. Any database migration commands.
5. Any Railway deployment configuration changes.
6. Test commands and results.
7. Any compatibility/API changes.
8. Any remaining security risks or assumptions.

Do not claim completion unless the application has actually been tested.

The goal is a hardened, low-latency RailSync authentication system — not merely a cosmetic login fix.
