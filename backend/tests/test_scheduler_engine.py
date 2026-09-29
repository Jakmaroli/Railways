import datetime as dt
import random

from app.scheduler_engine import (
    Task, Window, build_windows_from_timetable, greedy_initial,
    simulated_annealing, cost, optimize, _window_load,
)
from app.safety import window_is_safe, TRACK_WORK, OHE_WORK, SIGNAL_WORK, OTHER


def make_busy_map():
    # COR-01 has a morning and evening peak Mon-Fri (dow 0-4), free on weekends.
    busy = {}
    for dow in range(5):
        busy[("COR-01", dow)] = [(6 * 60, 11 * 60), (17 * 60, 22 * 60)]
    return busy


def make_tasks(n=12, seed=1):
    rng = random.Random(seed)
    types = [TRACK_WORK, OHE_WORK, SIGNAL_WORK, OTHER]
    tasks = []
    for i in range(n):
        tasks.append(Task(
            task_id=i,
            corridor_id="COR-01",
            duration_min=rng.choice([60, 90, 120, 150]),
            priority=round(rng.uniform(1, 10), 1),
            task_type=rng.choice(types),
            ready_date=dt.date.today(),
        ))
    return tasks


def assert_feasible(state, tasks_by_id, windows_by_id):
    for window_id, task_ids in state.window_order.items():
        if not task_ids:
            continue
        window = windows_by_id[window_id]
        load = sum(tasks_by_id[t].duration_min for t in task_ids)
        assert load <= window.length, f"capacity violated in {window_id}: {load} > {window.length}"
        types = [tasks_by_id[t].task_type for t in task_ids]
        ok, reason = window_is_safe(types)
        assert ok, f"safety violated in {window_id}: {reason}"
        # every task assigned to exactly the window recorded in `assignment`
    for task_id, window_id in state.assignment.items():
        assert task_id in state.window_order[window_id]


def test_greedy_initial_is_feasible():
    windows = build_windows_from_timetable(["COR-01"], make_busy_map(), horizon_days=7)
    tasks = make_tasks()
    tasks_by_id = {t.task_id: t for t in tasks}
    windows_by_id = {w.id: w for w in windows}

    state = greedy_initial(tasks, windows)
    assert_feasible(state, tasks_by_id, windows_by_id)
    # with 7 days of decent daily free time, all 12 small tasks should fit
    assert len(state.unplaced) == 0


def test_annealing_never_breaks_constraints():
    windows = build_windows_from_timetable(["COR-01"], make_busy_map(), horizon_days=7)
    tasks = make_tasks(n=20, seed=7)
    tasks_by_id = {t.task_id: t for t in tasks}
    windows_by_id = {w.id: w for w in windows}

    initial = greedy_initial(tasks, windows)
    best = simulated_annealing(initial, tasks, windows, iterations=1500, seed=42)
    assert_feasible(best, tasks_by_id, windows_by_id)


def test_annealing_improves_or_matches_greedy_cost():
    windows = build_windows_from_timetable(["COR-01"], make_busy_map(), horizon_days=7)
    tasks = make_tasks(n=20, seed=7)
    tasks_by_id = {t.task_id: t for t in tasks}
    windows_by_id = {w.id: w for w in windows}

    initial = greedy_initial(tasks, windows)
    initial_cost = cost(initial, tasks_by_id, windows_by_id)

    best = simulated_annealing(initial, tasks, windows, iterations=3000, seed=42)
    best_cost = cost(best, tasks_by_id, windows_by_id)

    assert best_cost <= initial_cost


def test_optimize_reports_real_measured_improvement():
    windows = build_windows_from_timetable(["COR-01"], make_busy_map(), horizon_days=7)
    tasks = make_tasks(n=20, seed=7)

    result = optimize(tasks, windows, seed=42)
    assert result["optimized_cost"] <= result["greedy_cost"]
    assert result["improvement_pct"] >= 0
    assert len(result["blocks"]) > 0


def test_incompatible_types_never_share_a_window():
    windows = build_windows_from_timetable(["COR-01"], make_busy_map(), horizon_days=7)
    # force a scenario where OHE and TRACK tasks would love to share the only window
    tasks = [
        Task(task_id=1, corridor_id="COR-01", duration_min=60, priority=9, task_type=OHE_WORK),
        Task(task_id=2, corridor_id="COR-01", duration_min=60, priority=9, task_type=TRACK_WORK),
    ]
    tasks_by_id = {t.task_id: t for t in tasks}
    windows_by_id = {w.id: w for w in windows}

    state = greedy_initial(tasks, windows)
    assert_feasible(state, tasks_by_id, windows_by_id)
    # they must have landed in different windows despite both being top priority
    assert state.assignment[1] != state.assignment[2]

    best = simulated_annealing(state, tasks, windows, iterations=1000, seed=1)
    assert_feasible(best, tasks_by_id, windows_by_id)


def test_deterministic_with_fixed_seed():
    windows = build_windows_from_timetable(["COR-01"], make_busy_map(), horizon_days=7)
    tasks = make_tasks(n=15, seed=3)

    r1 = optimize(tasks, windows, seed=123)
    r2 = optimize(tasks, windows, seed=123)
    assert r1["optimized_cost"] == r2["optimized_cost"]
