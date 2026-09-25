# RailSync AI — Unified Block Planning System (SIH26027)

A rebuild of the original prototype (`Railways_027`) for the AI-powered automatic
block planning problem statement — unifying TMS, SMMS, TDMS, COA and BDMS data so a
section controller can plan track possessions with one AI-ranked, conflict-checked
schedule instead of five departments emailing spreadsheets at each other.

## What changed from the original prototype

The original was a single-file Flask app: one SQLite table, a rule/ML hybrid score,
a scheduler that assigned slots without checking for train-movement conflicts, and
five unstyled HTML pages. This rebuild addresses the specific gaps a judge would
flag in a second round:

| Area | Original | This rebuild |
|---|---|---|
| Data model | One flat table | Proper relational model: `Corridor`, `TimetableSlot` (with dynamic date overrides), `Defect`, `BlockRequest` (with `PN-YYYY-XXXX` possession numbers and rejection feedback), `ScheduleBlock`, `AuditLog`, `User` |
| Access control & Security | None | JWT auth, 3 roles (admin/engineer/viewer), strict CORS via `ALLOWED_ORIGINS`, production JWT_SECRET enforcement, and login rate limiting (429) |
| Scheduling | Assigns slots, doesn't check for clashes | Subtracts real COA train-movement windows, supports date-specific timetable overrides, and **merges compatible tasks into shared blocks** to cut disruption count |
| Safety Authority | None | Official `PN-YYYY-XXXX` possession numbers generated upon authorization, linked to schedule blocks, and recorded in audit logs |
| Priority model | RandomForest with no visibility into *why* | Domain rule-based scoring smoothed by RandomForest generalization, calibrated with real operational completion/overrun telemetry and plain-language reasoning |
| Overrun handling | Not modelled | Completing a block late is tracked and flagged for downstream reschedule |
| Frontend | 5 unstyled static pages | React app with a corridor possession chart (time on x-axis, corridors as tracks, train movements vs maintenance blocks) built with Recharts |
| Stack | Flask + SQLite + vanilla JS | FastAPI + SQLAlchemy (Postgres-ready) + React/TypeScript/Tailwind |

## Architecture

```
backend/    FastAPI + SQLAlchemy + SQLite (swap to Postgres via DATABASE_URL)
  app/
    models.py        SQLAlchemy models (including possession numbers & dynamic timetable dates)
    scoring.py        priority_score_batch() / health_score() / explain_priority()
    scheduler.py       generate_schedule() — conflict-aware engine with merge logic
    routers/            auth, corridors, defects, block-requests, schedule, whatif, dashboard, timetable
  train_model.py       fits RandomForest on domain rules blended with real logged outcomes
  tests/              pytest test suite covering scheduler, scoring, and API lifecycles

frontend/   React + TypeScript + Vite + Tailwind v4
  src/
    pages/              Login, Overview, Defects, Schedule (with PN authorization UI), WhatIf, Submit, Insights
    components/         Sidebar, KpiStrip, CorridorTimeline (Recharts-based possession view), StatusBadge
```

## Running it locally

**Backend**
```bash
cd backend
pip install -r requirements.txt
python train_model.py      # trains and saves priority_model.pkl
pytest                     # runs test suite
uvicorn app.main:app --reload --port 8000
```
The first request auto-creates and seeds the SQLite DB with 5 corridors, 6 demo
users (one per department, password `railsync123`), a week of timetable slots, and
10 sample defects.

**Frontend**
```bash
cd frontend
npm install
npm run build              # typecheck and bundle
npm run dev
```
Visit `http://localhost:5173` — the Vite dev server proxies `/api` to the backend
on port 8000. Sign in as `controller` / `railsync123` to generate a schedule and issue
possession numbers, or as `tms_engineer` (etc.) to submit defects and track block demand feedback.

## Security & Architecture Considerations

- **CORS Configuration**: Controlled via `ALLOWED_ORIGINS` (defaults to `http://localhost:5173`).
- **Secret Management**: Production deployments (`ENV=production`) require an explicit `JWT_SECRET`; default fallback is restricted to development mode.
- **Login Rate Limiting**: In-memory sliding window protects `POST /api/auth/login` against brute force credential attempts.
- **Token Storage Known Limitation**: For prototype convenience, tokens are held in `localStorage`. Production deployments should migrate to `httpOnly`, `Secure`, `SameSite=Strict` cookies with CSRF token verification.

## Demo accounts

| Username | Department | Role |
|---|---|---|
| `controller` | CONTROL | admin — can generate/commit schedule & issue possession numbers |
| `tms_engineer` | TMS | engineer |
| `smms_engineer` | SMMS | engineer |
| `tdms_engineer` | TDMS | engineer |
| `bdms_officer` | BDMS | engineer |
| `coa_planner` | COA | viewer |

Password for all: `railsync123`

## Suggested next steps for the next SIH round

- Expand single-corridor scheduling to joint multi-corridor cross-network optimization.
- Add an automated notification dispatch channel (SMS/WhatsApp stub) so department engineers receive real-time possession approval alerts and rejection feedback directly.
- Add WebSocket push so the possession timeline chart updates live when another user generates or completes a block, instead of requiring a page refresh.
