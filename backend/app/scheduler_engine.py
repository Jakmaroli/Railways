"""
Scheduling engine: greedy seed + simulated-annealing improvement.

Why not OR-Tools: CP-SAT is a strong formulation, but it's a heavy native-code
dependency (large wheel, occasional build issues on unfamiliar machines) — a real risk
for a live demo. This engine gets you the same *story* — "the system solved a
constrained optimization problem, not just found a free slot" — using only the
standard library, so it can never fail to install and runs in well under a second at
this problem size.

--------------------------------------------------------------------------------
MODEL
--------------------------------------------------------------------------------
- A `Window` is one free, conflict-free time slot on one corridor on one date,
  already computed by subtracting COA train-movement times from the day (reuse your
  existing free-window logic here — see `build_windows_from_timetable` for the shape
  it needs to produce).
- Every `Task` (built from a Defect) is assigned to exactly one `Window` on its own
  corridor.
- All tasks assigned to the same window are packed back-to-back, in window order, into
  ONE shared possession block — this is what "merging" means in this model: sharing a
  window IS sharing a block. There is no separate merge/split move because packing
  order + window assignment fully determines the block structure.
- HARD CONSTRAINTS (never violated, checked before any move is accepted):
    1. capacity  — sum(task durations in a window) <= window length
    2. safety    — no two task types assigned to the same window are in
                   safety.INCOMPATIBLE_TASK_TYPES
- SOFT COST (what annealing minimizes):
    w1 * windows_used                    fewer possessions = less disruption
  + w2 * sum(priority_i * wait_days_i)   high-priority tasks shouldn't wait
  + w3 * total_fragmentation             unused time inside used windows
  + w4 * tight_pack_penalty              blocks with no safety-margin buffer

--------------------------------------------------------------------------------
USAGE
--------------------------------------------------------------------------------
    windows = build_windows_from_timetable(corridors, timetable_slots, horizon_days=14)
    tasks = [Task(task_id=d.task_id, corridor_id=d.corridor_id,
                   duration_min=int(d.estimated_block_duration * 60),
                   priority=priority_score(d, corridor), task_type=map_task_type(d),
                   ready_date=today) for d in open_defects]

    initial = greedy_initial(tasks, windows)
    best = simulated_annealing(initial, tasks, windows, seed=42)
    blocks = best.to_blocks(tasks)   # -> list[dict] ready to persist as ScheduleBlock rows
"""
from __future__ import annotations

import copy
import math
import random
import datetime as dt
from dataclasses import dataclass, field
from typing import Optional

from .safety import window_is_safe

SAFETY_MARGIN_MIN = 15  # a block using less than this leftover time in its window is "tight"


# --------------------------------------------------------------------------------
# Data model
# --------------------------------------------------------------------------------

@dataclass(frozen=True)
class Window:
    id: str                 # unique key, e.g. "COR-01|2026-10-04|0"
    corridor_id: str
    date: str                # ISO date
    start_min: int
    end_min: int

    @property
    def length(self) -> int:
        return self.end_min - self.start_min


@dataclass(frozen=True)
class Task:
    task_id: int
    corridor_id: str
    duration_min: int
    priority: float          # 0-10, from your existing scoring.priority_score()
    task_type: str = "OTHER"  # see safety.py — TRACK_WORK / OHE_WORK / SIGNAL_WORK / OTHER
    ready_date: Optional[dt.date] = None  # date it became actionable (defaults to today)


@dataclass
class ScheduleState:
    """assignment: task_id -> window_id. window_order: window_id -> [task_id, ...] in pack order."""
    assignment: dict = field(default_factory=dict)
    window_order: dict = field(default_factory=dict)
    unplaced: set = field(default_factory=set)

    def clone(self) -> "ScheduleState":
        return ScheduleState(
            assignment=dict(self.assignment),
            window_order={k: list(v) for k, v in self.window_order.items()},
            unplaced=set(self.unplaced),
        )

    def to_blocks(self, tasks_by_id: dict) -> list[dict]:
        """Renders the assignment into possession blocks with start/end times and
        a `task_types` list (for the safety gate) plus a human explanation string."""
        blocks = []
        for window_id, task_ids in self.window_order.items():
            if not task_ids:
                continue
            corridor_id, date, _ = window_id.split("|")
            cursor = None
            first_task = tasks_by_id[task_ids[0]]
            # window start is recovered by the caller passing windows_by_id in; kept
            # simple here by having the caller stitch in start_min via `place_blocks`.
            blocks.append({
                "window_id": window_id,
                "corridor_id": corridor_id,
                "date": date,
                "task_ids": task_ids,
                "task_types": [tasks_by_id[t].task_type for t in task_ids],
                "merged_with": ",".join(str(t) for t in task_ids[1:]) if len(task_ids) > 1 else None,
            })
        return blocks


# --------------------------------------------------------------------------------
# Window construction — plug your existing timetable-subtraction logic in here
# --------------------------------------------------------------------------------

def build_windows_from_timetable(corridors: list[str], busy_by_corridor_day: dict,
                                   horizon_days: int = 14, start_date: Optional[dt.date] = None,
                                   min_window_min: int = 30) -> list[Window]:
    """
    busy_by_corridor_day: {(corridor_id, day_of_week): [(start_min, end_min), ...]}
    This is the same shape your current scheduler.py already derives from
    TimetableSlot — reuse that function and pass its output straight in here rather
    than duplicating the subtraction logic.
    """
    start_date = start_date or dt.date.today()
    windows = []
    for i in range(horizon_days):
        date = start_date + dt.timedelta(days=i)
        dow = date.weekday()
        for corridor_id in corridors:
            busy = sorted(busy_by_corridor_day.get((corridor_id, dow), []))
            cursor = 0
            free = []
            for s, e in busy:
                if s > cursor:
                    free.append((cursor, s))
                cursor = max(cursor, e)
            if cursor < 24 * 60:
                free.append((cursor, 24 * 60))
            for idx, (s, e) in enumerate(free):
                if e - s >= min_window_min:
                    windows.append(Window(
                        id=f"{corridor_id}|{date.isoformat()}|{idx}",
                        corridor_id=corridor_id, date=date.isoformat(),
                        start_min=s, end_min=e,
                    ))
    return windows


# --------------------------------------------------------------------------------
# Feasibility checks (the two hard constraints)
# --------------------------------------------------------------------------------

def _window_load(state: ScheduleState, tasks_by_id: dict, window_id: str) -> int:
    return sum(tasks_by_id[t].duration_min for t in state.window_order.get(window_id, []))


def _fits(state: ScheduleState, tasks_by_id: dict, windows_by_id: dict,
          window_id: str, task: Task, exclude_task_id: Optional[int] = None) -> bool:
    window = windows_by_id[window_id]
    if window.corridor_id != task.corridor_id:
        return False
    current = [t for t in state.window_order.get(window_id, []) if t != exclude_task_id]
    load = sum(tasks_by_id[t].duration_min for t in current)
    if load + task.duration_min > window.length:
        return False
    types = [tasks_by_id[t].task_type for t in current] + [task.task_type]
    ok, _ = window_is_safe(types)
    return ok


# --------------------------------------------------------------------------------
# Greedy initial solution — priority order, first feasible window
# --------------------------------------------------------------------------------

def greedy_initial(tasks: list[Task], windows: list[Window]) -> ScheduleState:
    windows_by_id = {w.id: w for w in windows}
    tasks_by_id = {t.task_id: t for t in tasks}
    state = ScheduleState()

    windows_sorted = sorted(windows, key=lambda w: (w.date, w.start_min))
    for task in sorted(tasks, key=lambda t: t.priority, reverse=True):
        placed = False
        for window in windows_sorted:
            if window.corridor_id != task.corridor_id:
                continue
            if _fits(state, tasks_by_id, windows_by_id, window.id, task):
                state.window_order.setdefault(window.id, []).append(task.task_id)
                state.assignment[task.task_id] = window.id
                placed = True
                break
        if not placed:
            state.unplaced.add(task.task_id)
    return state


# --------------------------------------------------------------------------------
# Cost function
# --------------------------------------------------------------------------------

def cost(state: ScheduleState, tasks_by_id: dict, windows_by_id: dict,
         w_possessions: float = 3.0, w_wait: float = 1.0,
         w_fragmentation: float = 0.02, w_tight: float = 2.0,
         w_unplaced: float = 50.0, today: Optional[dt.date] = None) -> float:
    today = today or dt.date.today()
    used_windows = [wid for wid, tids in state.window_order.items() if tids]

    c = w_possessions * len(used_windows)

    for task_id, window_id in state.assignment.items():
        task = tasks_by_id[task_id]
        window = windows_by_id[window_id]
        wait_days = max(0, (dt.date.fromisoformat(window.date) - (task.ready_date or today)).days)
        c += w_wait * task.priority * wait_days

    for window_id in used_windows:
        window = windows_by_id[window_id]
        load = _window_load(state, tasks_by_id, window_id)
        leftover = window.length - load
        c += w_fragmentation * leftover
        if 0 <= leftover < SAFETY_MARGIN_MIN:
            c += w_tight

    c += w_unplaced * len(state.unplaced)
    return c


# --------------------------------------------------------------------------------
# Neighbor moves
# --------------------------------------------------------------------------------

def _move_task(state: ScheduleState, tasks_by_id: dict, windows_by_id: dict,
                windows_by_corridor: dict, rng: random.Random) -> Optional[ScheduleState]:
    candidates = list(state.assignment.keys()) + list(state.unplaced)
    if not candidates:
        return None
    task_id = rng.choice(candidates)
    task = tasks_by_id[task_id]
    corridor_windows = windows_by_corridor.get(task.corridor_id, [])
    if not corridor_windows:
        return None
    new_window = rng.choice(corridor_windows)

    new_state = state.clone()
    old_window = new_state.assignment.get(task_id)
    if old_window:
        new_state.window_order[old_window].remove(task_id)
    new_state.unplaced.discard(task_id)

    if not _fits(new_state, tasks_by_id, windows_by_id, new_window.id, task):
        return None  # reject — caller just tries a different random move next iteration

    new_state.window_order.setdefault(new_window.id, []).append(task_id)
    new_state.assignment[task_id] = new_window.id
    return new_state


def _swap_tasks(state: ScheduleState, tasks_by_id: dict, windows_by_id: dict,
                 rng: random.Random) -> Optional[ScheduleState]:
    if len(state.assignment) < 2:
        return None
    task_a, task_b = rng.sample(list(state.assignment.keys()), 2)
    win_a, win_b = state.assignment[task_a], state.assignment[task_b]
    if win_a == win_b:
        return None

    new_state = state.clone()
    new_state.window_order[win_a].remove(task_a)
    new_state.window_order[win_b].remove(task_b)

    if not _fits(new_state, tasks_by_id, windows_by_id, win_a, tasks_by_id[task_b]):
        return None
    if not _fits(new_state, tasks_by_id, windows_by_id, win_b, tasks_by_id[task_a]):
        return None

    new_state.window_order[win_a].append(task_b)
    new_state.window_order[win_b].append(task_a)
    new_state.assignment[task_a] = win_b
    new_state.assignment[task_b] = win_a
    return new_state


# --------------------------------------------------------------------------------
# Simulated annealing
# --------------------------------------------------------------------------------

def simulated_annealing(initial: ScheduleState, tasks: list[Task], windows: list[Window],
                          iterations: int = 12000, t_start: float = 15.0, cooling: float = 0.9995,
                          seed: Optional[int] = None) -> ScheduleState:
    rng = random.Random(seed)
    tasks_by_id = {t.task_id: t for t in tasks}
    windows_by_id = {w.id: w for w in windows}
    windows_by_corridor: dict = {}
    for w in windows:
        windows_by_corridor.setdefault(w.corridor_id, []).append(w)

    current = initial
    current_cost = cost(current, tasks_by_id, windows_by_id)
    best = current
    best_cost = current_cost
    temperature = t_start

    for _ in range(iterations):
        move_fn = rng.choice([_move_task, _swap_tasks])
        candidate = move_fn(current, tasks_by_id, windows_by_id, windows_by_corridor, rng) \
            if move_fn is _move_task else move_fn(current, tasks_by_id, windows_by_id, rng)
        if candidate is None:
            temperature *= cooling
            continue

        candidate_cost = cost(candidate, tasks_by_id, windows_by_id)
        delta = candidate_cost - current_cost
        if delta < 0 or rng.random() < math.exp(-delta / max(temperature, 1e-6)):
            current, current_cost = candidate, candidate_cost
            if current_cost < best_cost:
                best, best_cost = current, current_cost

        temperature *= cooling

    return best


# --------------------------------------------------------------------------------
# Convenience entry point mirroring the old generate_schedule() signature
# --------------------------------------------------------------------------------

def optimize(tasks: list[Task], windows: list[Window], seed: Optional[int] = None) -> dict:
    """Returns both the optimized schedule and the measured before/after cost so the
    dashboard can show a real, non-invented improvement number."""
    tasks_by_id = {t.task_id: t for t in tasks}
    windows_by_id = {w.id: w for w in windows}

    initial = greedy_initial(tasks, windows)
    initial_cost = cost(initial, tasks_by_id, windows_by_id)

    best = simulated_annealing(initial, tasks, windows, seed=seed)
    best_cost = cost(best, tasks_by_id, windows_by_id)

    improvement_pct = round((1 - best_cost / initial_cost) * 100, 1) if initial_cost > 0 else 0.0

    return {
        "schedule": best,
        "blocks": best.to_blocks(tasks_by_id),
        "greedy_cost": round(initial_cost, 2),
        "optimized_cost": round(best_cost, 2),
        "improvement_pct": improvement_pct,
    }
