"""
Priority & health scoring — domain engineering rules & ML generalization.

priority_score(): 0-10 urgency score used to rank which defects get block time first.
  - Uses a trained RandomForest (see train_model.py) as a smoothed generalization
    of the domain rule-based score (calibrated against operational block execution outcomes).
  - Falls back to a transparent weighted rule instantly and silently if the model
    file is missing, fails to load, or throws during predict() for any row, so a
    bad pickle or a single malformed input can never take the scheduler down.
priority_score_batch(): vectorized batched scoring across an entire DataFrame in a single call.
health_score(): 0-100 asset condition proxy, always rule-based (needs to stay explainable
  for engineers who aren't going to trust a black box for "is this asset dying").
explain_priority(): returns a short human-readable reason string for the schedule UI —
  this is what makes the ranking defensible to a judge/section controller instead of
  just a number.
get_model_status(): provides transparent metadata explaining that the model is a smoothed
  generalization of expert rules, its feature weights, and runtime call metrics.
"""
import os
import json
import logging
import datetime as dt
from typing import Optional
import numpy as np
import pandas as pd
import joblib

logger = logging.getLogger("railsync.scoring")

_BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MODEL_FILE = os.path.join(_BACKEND_DIR, "priority_model.pkl")
MODEL_META_FILE = os.path.join(_BACKEND_DIR, "priority_model_meta.json")

# Exact column order train_model.py fits the model on. Every prediction builds its
# input DataFrame against this list (never a bare dict) so a scikit-learn version that
# validates feature_names_in_ can't silently score against misaligned columns.
FEATURE_COLUMNS = ["severity", "is_high_density", "days_overdue", "recurrence_count", "estimated_block_duration"]

_MODEL = None
_MODEL_META: dict = {}
_MODEL_LOAD_ERROR: Optional[str] = None
_MODEL_LOADED_AT: Optional[str] = None
# Running counters so the insights dashboard can show how often the ML path vs. the
# rule-based fallback actually served a score, not just whether the model *can* load.
_STATS = {"model_calls": 0, "fallback_calls": 0}


def load_model(force: bool = False):
    """Load priority_model.pkl (+ its metadata sidecar) into memory once.

    Called explicitly from main.py's lifespan startup hook so the pickle is
    deserialized exactly once per process, before the first request is served —
    not lazily on whichever request happens to arrive first. Safe to call again
    later (e.g. an ops "reload model" action) via force=True; every other call
    after the first is a no-op that returns the cached instance.
    """
    global _MODEL, _MODEL_META, _MODEL_LOAD_ERROR, _MODEL_LOADED_AT
    if _MODEL is not None and not force:
        return _MODEL

    _MODEL_LOAD_ERROR = None
    try:
        if os.path.exists(MODEL_FILE):
            _MODEL = joblib.load(MODEL_FILE)
            _MODEL_LOADED_AT = dt.datetime.now(dt.timezone.utc).isoformat()
            logger.info("priority_model.pkl loaded into memory (%s)", type(_MODEL).__name__)
        else:
            _MODEL = None
            _MODEL_LOAD_ERROR = "priority_model.pkl not found — scoring engine running on rule-based fallback."
            logger.warning(_MODEL_LOAD_ERROR)
    except Exception as exc:  # corrupt pickle, sklearn version mismatch, etc.
        _MODEL = None
        _MODEL_LOAD_ERROR = f"Failed to load priority_model.pkl ({exc.__class__.__name__}): {exc}"
        logger.exception("priority_model.pkl failed to load — falling back to rule-based scoring")

    _MODEL_META = {}
    if os.path.exists(MODEL_META_FILE):
        try:
            with open(MODEL_META_FILE) as f:
                _MODEL_META = json.load(f)
        except Exception:
            logger.warning("priority_model_meta.json exists but couldn't be parsed; ignoring it")

    return _MODEL


def _days_overdue(due_date_val, ref_date: Optional[dt.date] = None) -> int:
    if not due_date_val:
        return 0
    ref_date = ref_date or dt.date.today()
    try:
        due = dt.datetime.strptime(str(due_date_val)[:10], "%Y-%m-%d").date()
        return max(0, (ref_date - due).days)
    except Exception:
        return 0


def _rule_based_priority(severity, is_high_density, days_overdue, recurrence_count, estimated_block_duration) -> float:
    """Transparent weighted formula — also what train_model.py's labels are generated
    from, so the ML model is trained to approximate (and smooth) this exact logic
    rather than something unrelated. That's what makes the fallback "seamless":
    switching to it mid-outage changes rankings only at the margins, never wildly."""
    criticality = severity * 2.0
    urgency = min(10.0, days_overdue * 0.4 + recurrence_count * 1.2)
    impact = is_high_density * 6.0 + min(4.0, estimated_block_duration * 0.6)
    base = 0.4 * criticality + 0.35 * urgency + 0.25 * impact
    return round(max(0.0, min(10.0, base)), 2)


def _features(defect: dict, corridor: Optional[dict]):
    """Extract + coerce every field the model/rule need, with an explicit default
    for anything missing or null so a partially-filled defect record can never
    throw during scoring — it just scores as a conservative baseline case."""
    severity = float(defect.get("severity") or 3)
    is_high_density = int(bool(corridor.get("is_high_density"))) if corridor else 0
    days_overdue = _days_overdue(defect.get("due_date"))
    recurrence_count = int(defect.get("recurrence_count") or 0)
    estimated_block_duration = float(defect.get("estimated_block_duration") or 2.0)
    return severity, is_high_density, days_overdue, recurrence_count, estimated_block_duration


def priority_score(defect: dict, corridor: Optional[dict] = None) -> float:
    severity, is_high_density, days_overdue, recurrence_count, duration = _features(defect, corridor)

    # Belt-and-braces: if something calls priority_score() before the lifespan startup
    # hook ran (e.g. a unit test importing this module directly), load on first use
    # instead of silently scoring on a None model forever.
    model = _MODEL if _MODEL is not None else load_model()

    if model is not None:
        try:
            row = pd.DataFrame([[severity, is_high_density, days_overdue, recurrence_count, duration]],
                                columns=FEATURE_COLUMNS)
            pred = float(model.predict(row)[0])
            _STATS["model_calls"] += 1
            return round(max(0.0, min(10.0, pred)), 2)
        except Exception as exc:
            # Never let a bad row take the scheduler down — log it and drop straight
            # through to the rule-based path for *this* defect only.
            logger.warning("priority_model.predict() failed for one defect, using fallback: %s", exc)

    _STATS["fallback_calls"] += 1
    return _rule_based_priority(severity, is_high_density, days_overdue, recurrence_count, duration)


def priority_score_batch(defects_df: pd.DataFrame, corridor_lookup: dict) -> pd.Series:
    """Build one feature DataFrame for all rows, calling model.predict() in a single batched pass.

    Falls back seamlessly to the vectorized domain formula if the model is missing or throws.
    Returns a pandas Series of priority scores indexed matching defects_df.index.
    """
    if defects_df is None or defects_df.empty:
        return pd.Series(dtype=float)

    severities = []
    high_densities = []
    overdues = []
    recurrences = []
    durations = []

    for _, row in defects_df.iterrows():
        cid = row.get("corridor_id")
        c = corridor_lookup.get(cid) if corridor_lookup else None
        if isinstance(c, dict):
            hd = 1 if c.get("is_high_density") else 0
        elif c is not None and hasattr(c, "is_high_density"):
            hd = 1 if getattr(c, "is_high_density", False) else 0
        else:
            hd = 0

        sev = float(row.get("severity") or 3)
        due = row.get("due_date")
        d_over = _days_overdue(due)
        rec = int(row.get("recurrence_count") or 0)
        dur = float(row.get("estimated_block_duration") or 2.0)

        severities.append(sev)
        high_densities.append(hd)
        overdues.append(d_over)
        recurrences.append(rec)
        durations.append(dur)

    feature_df = pd.DataFrame({
        "severity": severities,
        "is_high_density": high_densities,
        "days_overdue": overdues,
        "recurrence_count": recurrences,
        "estimated_block_duration": durations,
    }, columns=FEATURE_COLUMNS, index=defects_df.index)

    model = _MODEL if _MODEL is not None else load_model()

    if model is not None:
        try:
            preds = model.predict(feature_df)
            clipped = np.clip(preds, 0.0, 10.0)
            rounded = np.round(clipped, 2)
            _STATS["model_calls"] += len(feature_df)
            return pd.Series(rounded, index=defects_df.index, dtype=float)
        except Exception as exc:
            logger.warning("priority_score_batch model.predict() failed, using fallback: %s", exc)

    # Vectorized rule-based fallback
    sev_arr = np.array(severities, dtype=float)
    hd_arr = np.array(high_densities, dtype=float)
    od_arr = np.array(overdues, dtype=float)
    rec_arr = np.array(recurrences, dtype=float)
    dur_arr = np.array(durations, dtype=float)

    criticality = sev_arr * 2.0
    urgency = np.minimum(10.0, od_arr * 0.4 + rec_arr * 1.2)
    impact = hd_arr * 6.0 + np.minimum(4.0, dur_arr * 0.6)
    base = 0.4 * criticality + 0.35 * urgency + 0.25 * impact
    fallback_scores = np.round(np.clip(base, 0.0, 10.0), 2)
    _STATS["fallback_calls"] += len(feature_df)
    return pd.Series(fallback_scores, index=defects_df.index, dtype=float)


def health_score(defect: dict) -> float:
    try:
        severity = float(defect.get("severity", 3))
        days_overdue = _days_overdue(defect.get("due_date"))
        raw = 100.0 - (severity * 15.0 + min(days_overdue, 20) * 1.5)
        return round(max(0.0, min(100.0, raw)), 1)
    except Exception:
        return 50.0


def explain_priority(defect: dict, corridor: Optional[dict] = None) -> str:
    """Plain-language reason the schedule ranked this task where it did."""
    severity, is_high_density, days_overdue, recurrence_count, duration = _features(defect, corridor)
    reasons = []
    if severity >= 4:
        reasons.append(f"severity {int(severity)}/5")
    if days_overdue > 0:
        reasons.append(f"{days_overdue}d overdue")
    if recurrence_count > 0:
        reasons.append(f"recurred {recurrence_count}x")
    if is_high_density:
        reasons.append("high-density corridor")
    if not reasons:
        reasons.append("routine maintenance")
    return "Prioritized for: " + ", ".join(reasons)


def get_model_status() -> dict:
    """Everything the ML Insights dashboard renders: whether the trained model is
    actually live, what it learned, how it was validated, and how often each path
    (model vs. fallback) has actually been used since this process started."""
    importances = _MODEL_META.get("feature_importances")
    if importances is None and _MODEL is not None and hasattr(_MODEL, "feature_importances_"):
        importances = {
            name: round(float(imp), 4)
            for name, imp in zip(FEATURE_COLUMNS, _MODEL.feature_importances_)
        }

    return {
        "loaded": _MODEL is not None,
        "model_type": type(_MODEL).__name__ if _MODEL is not None else None,
        "model_description": "Smoothed generalization of domain rule-based priority score",
        "is_rule_generalization": True,
        "fallback_active": _MODEL is None,
        "load_error": _MODEL_LOAD_ERROR,
        "loaded_at": _MODEL_LOADED_AT,
        "trained_at": _MODEL_META.get("trained_at"),
        "validation_mae": _MODEL_META.get("validation_mae"),
        "n_training_samples": _MODEL_META.get("n_samples"),
        "feature_columns": FEATURE_COLUMNS,
        "feature_importances": importances,
        "calls_scored_by_model": _STATS["model_calls"],
        "calls_scored_by_fallback": _STATS["fallback_calls"],
    }

