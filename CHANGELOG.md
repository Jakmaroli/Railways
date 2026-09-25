# Hardening pass — v2.1.0

A targeted pass on top of the v2.0.0 rebuild (see README's "What changed from the
original prototype" table). This didn't touch the architecture — it closes the
specific gaps between what v2.0.0 already did and a genuinely production-grade
ML API: eager model loading, indexed hot-path queries, a consistent response
envelope, and the ML Insights dashboard the plan called for but v2.0.0 didn't have.

| Area | Before | After |
|---|---|---|
| Model loading | Lazy — loaded on whichever request hit `priority_score()` first | Eager — `scoring.load_model()` runs in FastAPI's `lifespan` startup hook, before the app accepts traffic. Still cached as a singleton either way; the lazy path stays as a safety net for code that imports `scoring` directly (e.g. tests) |
| Feature integrity | Dict → `pd.DataFrame([...])`, relying on Python dict ordering | Explicit `columns=FEATURE_COLUMNS` on every prediction, matching `train_model.py`'s fit order exactly |
| Fallback visibility | Silent `except: pass` on predict failure | Logged, and tracked — `calls_scored_by_model` / `calls_scored_by_fallback` counters exposed via `/api/dashboard/ml-insights` |
| DB indexes | Only `users.username` | Indexed every column actually filtered/sorted on: `defects.status`, `defects.corridor_id`, `defects.due_date`, `schedule_blocks.date`, `schedule_blocks.corridor_id`, `schedule_blocks.status`, `block_requests.status`, `block_requests.corridor_id`, plus a composite `(corridor_id, day_of_week)` index on `timetable_slots` |
| API response shape | Mixed — some endpoints returned `{"status": "success", ...}`, most returned the bare model/list, errors returned FastAPI's default `{"detail": ...}` | Every `/api/*` response is now `{"status": "success", "data": ...}` or `{"status": "error", "error": {"code", "message", ...}}`, applied uniformly by `app/middleware.py` and three exception handlers in `main.py` — no route handler wraps its own response |
| ML Insights | Not present | New `GET /api/dashboard/ml-insights` + `frontend/src/pages/Insights.tsx`: live model status, per-feature importance bars, validation MAE, and real block-outcome totals (scheduled / completed / overrun / merged) |
| Model metadata | `train_model.py` printed validation MAE + importances to stdout and discarded them | Also written to `backend/priority_model_meta.json`, read by `scoring.py` at startup so the Insights dashboard has real numbers instead of "not available" |

## Frontend compatibility note

The response envelope change is transparent to every existing page: `frontend/src/api/client.ts`'s
axios response interceptor unwraps `response.data.data` automatically, so `Overview.tsx`,
`Schedule.tsx`, `Defects.tsx`, `WhatIf.tsx`, `Submit.tsx`, and `AuthContext.tsx` needed **zero**
changes — they still read `response.data` exactly as before. Only `client.ts` itself, plus the
new `Insights.tsx` page and its two nav/route wire-ups (`Sidebar.tsx`, `App.tsx`), changed.

## Verified

- `uvicorn app.main:app` boots cleanly; startup log confirms the model loads before
  "Application startup complete."
- `python train_model.py` regenerates `priority_model.pkl` + `priority_model_meta.json`
  deterministically (fixed seed) — confirmed identical feature importances before/after.
- Full request cycle exercised end-to-end: login (success + wrong-password error),
  `/schedule/generate`, `/dashboard/ml-insights` (model-call counters increment correctly),
  a 422 validation error, and a 401 on an unauthenticated request — all in the new envelope
  shape.
- `npm run build` (`tsc -b && vite build`) and `oxlint` both pass clean on the frontend.
- Every new index confirmed present in the SQLite schema via `sqlite_master`.

## Suggested next steps (unchanged scope, noted for later)

- The frontend's visual design (dark control-room theme, signal-amber/green/red status
  colors, corridor possession chart) was already in place before this pass and wasn't
  touched. If you want it pushed further — motion, richer charts, a landing/marketing
  page — that's a separate, larger pass and worth scoping on its own.
- `priority_model.pkl` is retrained with this pass (same seed, same weights) purely to
  produce the metadata sidecar; if your deployment pipeline pins the pkl's hash, regenerate
  and re-pin it.
