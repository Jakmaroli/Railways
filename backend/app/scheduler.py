"""
Block allocation engine.

Unlike a plain "assign slot to task" stub, this:
  1. Builds each corridor's free-time windows per day by subtracting COA timetable
     (train movement) slots from the 24h day — the actual "unified visibility" the
     pitch promises.
  2. Sorts pending defects by priority_score (from scoring.py) so the highest-urgency
     work claims the best windows first.
  3. Packs tasks into windows first-fit, and opportunistically MERGES two tasks into
     one block when they land in the same window and their combined duration still
     fits — this is the "reduce duplicate disruptions" behaviour the whole system
     exists for.
  4. Emits an explanation string per block so the output is auditable, not a black box.

generate_schedule() takes plain dict/DataFrame-like inputs so it has no FastAPI/DB
dependency and can be unit tested or reused from the /whatif endpoint with overrides.
"""
import datetime as dt
from typing import List, Dict, Optional
import pandas as pd

from .scoring import priority_score_batch, explain_priority

PLANNING_HORIZON_DAYS = 14
DAY_START_MIN = 0
DAY_END_MIN = 24 * 60


def _to_min(hhmm: str) -> int:
    h, m = hhmm.split(":")
    return int(h) * 60 + int(m)


def _to_hhmm(mins: int) -> str:
    mins = int(mins) % (24 * 60)
    return f"{mins // 60:02d}:{mins % 60:02d}"


def _free_windows_for_day(corridor_id: str, day_of_week: int, timetable_df: pd.DataFrame,
                           date_str: Optional[str] = None, min_window_min: int = 30) -> List[tuple]:
    """Subtract that day's train-movement slots from the full day to get free windows (in minutes).

    If date_str is provided and matches specific_date entries for this corridor, those one-off
    live movements take precedence and override the recurring weekly template for that date.
    """
    busy = []
    if not timetable_df.empty:
        has_specific_date = "specific_date" in timetable_df.columns
        date_rows = pd.DataFrame()
        if has_specific_date and date_str:
            date_rows = timetable_df[
                (timetable_df["corridor_id"] == corridor_id) & (timetable_df["specific_date"] == date_str)
            ]
        if not date_rows.empty:
            for _, r in date_rows.iterrows():
                busy.append((_to_min(r["start_time"]), _to_min(r["end_time"])))
        else:
            mask = (timetable_df["corridor_id"] == corridor_id) & (timetable_df["day_of_week"] == day_of_week)
            if has_specific_date:
                mask = mask & (timetable_df["specific_date"].isna() | (timetable_df["specific_date"] == ""))
            day_rows = timetable_df[mask]
            for _, r in day_rows.iterrows():
                busy.append((_to_min(r["start_time"]), _to_min(r["end_time"])))
    busy.sort()

    windows = []
    cursor = DAY_START_MIN
    for start, end in busy:
        if start > cursor:
            windows.append((cursor, start))
        cursor = max(cursor, end)
    if cursor < DAY_END_MIN:
        windows.append((cursor, DAY_END_MIN))

    return [(s, e) for s, e in windows if (e - s) >= min_window_min]


def _upcoming_dates(horizon_days: int = PLANNING_HORIZON_DAYS, start: Optional[dt.date] = None):
    start = start or dt.date.today()
    return [start + dt.timedelta(days=i) for i in range(horizon_days)]


def generate_schedule(defects_df: pd.DataFrame, corridors_df: pd.DataFrame,
                       timetable_df: pd.DataFrame) -> pd.DataFrame:
    if defects_df is None or defects_df.empty:
        return pd.DataFrame(columns=[
            "task_id", "corridor_id", "date", "slot_start", "slot_end",
            "priority_score", "merged_with", "explanation_text"
        ])

    corridor_lookup: Dict[str, dict] = {}
    if corridors_df is not None and not corridors_df.empty:
        corridor_lookup = {r["corridor_id"]: r.to_dict() for _, r in corridors_df.iterrows()}

    pending = defects_df[defects_df.get("status", "open").isin(["open", pd.NA]) | defects_df["status"].isna()] \
        if "status" in defects_df.columns else defects_df.copy()
    if pending.empty:
        pending = defects_df.copy()

    # Batched priority scoring in a single call across all pending defects
    scores = priority_score_batch(pending, corridor_lookup)
    pending["priority_score"] = scores

    tasks = []
    for _, row in pending.iterrows():
        d = row.to_dict()
        corridor = corridor_lookup.get(d.get("corridor_id"))
        score = float(d["priority_score"])
        reason = explain_priority(d, corridor)
        tasks.append({
            "task_id": int(d["task_id"]),
            "corridor_id": d["corridor_id"],
            "estimated_block_duration": float(d.get("estimated_block_duration", 2.0) or 2.0),
            "priority_score": score,
            "reason": reason,
        })
    tasks.sort(key=lambda t: t["priority_score"], reverse=True)

    dates = _upcoming_dates()
    # per-corridor, per-date list of (start,end) windows already carved up during this run
    window_state: Dict[tuple, List[tuple]] = {}

    def get_windows(corridor_id, date):
        key = (corridor_id, date)
        if key not in window_state:
            dow = date.weekday()
            date_str = date.isoformat()
            window_state[key] = _free_windows_for_day(corridor_id, dow, timetable_df, date_str=date_str)
        return window_state[key]

    results = []
    # tracks the last placed block per (corridor_id, date, window_index) to allow merging
    last_block_in_window: Dict[tuple, dict] = {}

    for task in tasks:
        placed = False
        for date in dates:
            windows = get_windows(task["corridor_id"], date)
            for w_idx, (w_start, w_end) in enumerate(windows):
                free_len = w_end - w_start
                dur_min = int(task["estimated_block_duration"] * 60)
                win_key = (task["corridor_id"], date, w_idx)

                # Try merge: if a block already sits in this window and there's still room
                prior = last_block_in_window.get(win_key)
                if prior is not None:
                    prior_end = _to_min(prior["slot_end"])
                    if prior_end + dur_min <= w_end:
                        new_start = prior_end
                        new_end = prior_end + dur_min
                        merged_ids = (prior["merged_with"].split(",") if prior["merged_with"] else [str(prior["task_id"])])
                        merged_ids.append(str(task["task_id"]))
                        prior["merged_with"] = ",".join(merged_ids)
                        prior["explanation_text"] += f" | merged with task {task['task_id']} (shared window, no extra disruption)"
                        # extend the block's own end to cover both tasks
                        prior["slot_end"] = _to_hhmm(new_end)
                        windows[w_idx] = (new_end, w_end)
                        placed = True
                        break

                if not placed and free_len >= dur_min:
                    slot_start = w_start
                    slot_end = w_start + dur_min
                    block = {
                        "task_id": task["task_id"],
                        "corridor_id": task["corridor_id"],
                        "date": date.isoformat(),
                        "slot_start": _to_hhmm(slot_start),
                        "slot_end": _to_hhmm(slot_end),
                        "priority_score": task["priority_score"],
                        "merged_with": None,
                        "explanation_text": f"{task['reason']}; slot chosen: low-traffic window on {date.isoformat()}.",
                    }
                    results.append(block)
                    last_block_in_window[win_key] = block
                    windows[w_idx] = (slot_end, w_end)
                    placed = True
            if placed:
                break
        if not placed:
            results.append({
                "task_id": task["task_id"],
                "corridor_id": task["corridor_id"],
                "date": dates[-1].isoformat(),
                "slot_start": "00:00",
                "slot_end": "00:00",
                "priority_score": task["priority_score"],
                "merged_with": None,
                "explanation_text": "UNSCHEDULED: no free window found in the planning horizon — escalate for a special block.",
            })

    return pd.DataFrame(results)
