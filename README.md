# RailSync AI — Unified Block Planning & Safety Optimization System (SIH26027)

RailSync AI is an enterprise-grade, AI-powered automatic block planning and possession management system designed for Indian Railways. It unifies disparate operational feeds across **TMS** (Track Management), **SMMS** (Signals & Telecom), **TDMS** (Traction Distribution/OHE), **COA** (Control Office Application train timetables), and **BDMS** (Block Demand Management) into a unified, conflict-checked, and safety-verified schedule.

Instead of section controllers and departmental engineers coordinating maintenance across email threads and disparate spreadsheets, RailSync AI delivers an optimized, auditable plan that maximizes track maintenance throughput while strictly protecting passenger train punctuality and headway gaps.

---

## Key System Capabilities

| Capability | Technical Description | Operational Benefit |
|---|---|---|
| **Intelligent Priority Scoring** | RandomForest ML regressor trained on domain safety rules and calibrated against real block execution telemetry (`explain_priority`, feature weights sidecar), backed by an instantaneous domain-rule fallback. | Ranks urgent track defects objectively, removing inter-departmental conflict over track possession time. |
| **AI Heuristic Schedule Optimizer** | Greedy initialization combined with a simulated-annealing local search optimizer (`backend/app/scheduler_engine.py`) that opportunistically merges co-located tasks into shared low-traffic windows. | Reduces duplicate corridor possessions, minimizes track downtime, and measures exact before/after schedule cost improvements. |
| **Safety Compatibility Gate** | Pre-issuance safety validation gate (`backend/app/safety.py`) enforcing discipline segregation (e.g. electrical OHE isolation vs. track staff on-foot). | Automatically intercepts incompatible tasks from sharing a possession, generates human-readable rejection reasons, and blocks unauthorized possession issuance. |
| **Complete Possession Lifecycle** | 10-state validated state machine (`backend/app/lifecycle.py`): `REQUESTED → VALIDATED → SCHEDULED → SAFETY_APPROVED → ISSUED → ACTIVE → COMPLETED \| OVERRUN → RESCHEDULED`. | Eliminates unlogged status changes, enforces strict legal transitions with HTTP 409 conflict checks, and writes tamper-evident audit records. |
| **Dynamic Overrun Cascading** | Detects possession overruns during block completion and automatically reschedules downstream conflicting blocks on the same corridor. | Prevents compounding delays across congested rail corridors and provides controllers with instant cascade visibility. |
| **Tamper-Evident Authority** | Issues official, sequential possession numbers (`PN-YYYY-XXXX`) upon controller authorization, linking approved blocks to department station registers. | Replaces unverified phone/memo authorizations with an auditable cryptographic safety ledger. |
| **Dynamic Headway Protection** | Subtracts COA train-movement slots from 24h corridor availability with support for live date-specific timetable overrides. | Guarantees maintenance blocks only claim genuine traffic gaps without causing passenger train detention. |

---

## Hardened Security Architecture

RailSync AI implements a zero-trust, production-ready security posture:

- **Secure Cookie Authentication**: Authentication tokens are issued as short-lived (15-min) JWTs stored in `HttpOnly`, `Secure`, `SameSite=Strict` cookies (`railsync_access`), keeping tokens inaccessible to malicious JavaScript.
- **CSRF Defense-in-Depth**: Double-submit cookie verification (`railsync_csrf` validated against `X-CSRF-Token` headers) protects all state-changing requests (`POST`, `PUT`, `PATCH`, `DELETE`).
- **Distributed Tiered Rate Limiting**: Redis-backed atomic sliding-window rate limiting protects login endpoints across three tiers:
  - *IP Burst*: 5 attempts / 60 seconds
  - *IP Sustained*: 30 attempts / 10 minutes
  - *Username*: 8 attempts / 10 minutes
- **Anti-Enumeration Protection**: Consistent 401 responses and constant-time dummy bcrypt hashing (`DUMMY_HASH`) eliminate user enumeration and timing side-channels.
- **Strict CORS Allowlists**: Enforces explicit origins via `RAILSYNC_ALLOWED_ORIGINS`; wildcards (`*`) with credentials are completely forbidden and trigger fail-fast startup.
- **Stateless Authorization**: Requests authenticate statelessly via decoded JWT claims (`CurrentUser`), eliminating per-request database bottlenecks and maintaining high throughput for operations APIs.
- **Auditability & Traceability**: Every request is assigned a unique `X-Request-ID` propagated through server logs and response headers, with sensitive parameters masked via SHA-256 fingerprinting.

---

## System Architecture

```
railsync/
├── backend/                                  # FastAPI High-Performance Backend
│   ├── app/
│   │   ├── auth.py                           # JWT, Redis tiered rate limiting, stateless CurrentUser
│   │   ├── database.py                       # SQLAlchemy session management (Postgres / SQLite)
│   │   ├── lifecycle.py                      # PossessionStatus 10-state machine & transition validator
│   │   ├── main.py                           # FastAPI application, CORS, lifespan & error handlers
│   │   ├── middleware.py                     # CSRF verification, Request ID tracing, response envelopes
│   │   ├── models.py                         # Relational data models (Corridors, Defects, Schedule, etc.)
│   │   ├── routers/                          # API endpoints (auth, schedule, defects, timetable, dashboard)
│   │   ├── safety.py                         # Inter-departmental safety compatibility rules & gate
│   │   ├── scheduler.py                      # Multi-pass greedy & simulated annealing schedule optimizer
│   │   ├── scheduler_engine.py               # Local search optimization engine & window construction
│   │   ├── schemas.py                        # Pydantic validation schemas
│   │   ├── scoring.py                        # ML inference engine & transparent rule fallbacks
│   │   └── seed.py                           # Initial database seeding for corridors and demo data
│   ├── priority_model.pkl                    # Calibrated priority scoring model
│   ├── priority_model_meta.json              # Model feature weights and training metrics
│   ├── requirements.txt                      # Python dependencies
│   └── tests/                                # 48 automated test cases (security, engine, lifecycle)
│
├── frontend/                                 # React 19 + TypeScript + Vite Dashboard
│   ├── src/
│   │   ├── api/client.ts                     # Axios client with CSRF interceptor & 429 error handling
│   │   ├── components/                       # CorridorTimeline, Navigation, Layout, Drawers
│   │   │   └── ui/                           # Primitive components (Card, Badge, Button, Drawer)
│   │   ├── context/AuthContext.tsx           # Cookie-based auth provider with stateless /auth/me
│   │   ├── pages/                            # Overview, Schedule, Defects, What-If, Insights, Alerts
│   │   └── types.ts                          # TypeScript domain interfaces & status definitions
│   ├── vite.config.ts                        # Development server & proxy configuration
│   └── package.json                          # Frontend dependencies
│
└── docker-compose.yml                        # Multi-container orchestration (backend, redis, frontend)
```

---

## Running Locally

### Prerequisites
- Python 3.10+
- Node.js 18+ & npm
- (Optional) Redis server or Docker

### 1. Backend Setup

```bash
cd backend
python -m venv .venv
source .venv/bin/activate       # On Windows: .venv\Scripts\Activate.ps1
pip install -r requirements.txt

# Run automated test suites (48/48 tests)
pytest -v

# Start FastAPI backend (port 8050)
uvicorn app.main:app --host 127.0.0.1 --port 8050 --reload
```

The database auto-seeds on first startup with:
- 5 key Indian Railways corridors (e.g. Mumbai-Pune Ghat, Delhi-Agra)
- 6 departmental user accounts
- Realistic timetable slots and peak train movements
- 10 active track defects across TMS, SMMS, and TDMS

### 2. Frontend Setup

```bash
cd frontend
npm install

# Run linter and typecheck build
npm run lint
npm run build

# Start Vite dev server (port 5180)
npm run dev
```

Visit **`http://localhost:5180`** in your browser. The Vite development server automatically proxies all `/api/*` network calls to the backend on `127.0.0.1:8050`.

---

## Demo Accounts

Sign in using any of the following provisioned departmental accounts (Default password: **`railsync123`**):

| Username | Department | System Role | Operational Permissions |
|---|---|---|---|
| `controller` | **CONTROL** | Section Controller (`admin`) | Full system authority: run AI optimizer, commit possession schedules, issue official PN numbers, complete blocks. |
| `tms_engineer` | **TMS** | Track Engineer (`engineer`) | Report track defects, submit permanent-way block demands, view corridor timelines. |
| `smms_engineer` | **SMMS** | Signaling Engineer (`engineer`) | Report signal & interlocking faults, submit signal maintenance demands. |
| `tdms_engineer` | **TDMS** | Traction Engineer (`engineer`) | Report OHE & electrical line defects, submit power-isolation block demands. |
| `bdms_officer` | **BDMS** | Bridge Engineer (`engineer`) | Review cross-departmental block demands and track bearing inspection requests. |
| `coa_planner` | **COA** | Timetable Planner (`viewer`) | Ingest live train timetable movements, inspect headway gaps and punctuality charts. |

---

## Verification & Automated Tests

RailSync AI includes comprehensive automated testing:

```bash
# Run full backend test suite
pytest backend/tests/ -v

# Verification coverage:
# - backend/tests/test_api_endpoints.py           (API workflows & PN issuance)
# - backend/tests/test_auth_security.py            (CORS, Redis rate limits, CSRF, JWT, fail-fast)
# - backend/tests/test_lifecycle.py                (10-state progression, illegal transition prevention)
# - backend/tests/test_optimizer_v2_integration.py (Simulated annealing, safety gate, overrun cascade)
# - backend/tests/test_scheduler.py                (Headway gap calculation & merge verification)
# - backend/tests/test_scheduler_engine.py         (Deterministic local search optimization)
# - backend/tests/test_scoring.py                  (ML priority predictions & rule fallbacks)
```
