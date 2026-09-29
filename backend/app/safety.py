"""
Safety compatibility rules for RailSync.

This is a SAMPLE rule set for demo purposes, not an official G&SR (General & Subsidiary
Rules) ruleset — label it as such to judges. Replace INCOMPATIBLE_TASK_TYPES with your
team's actual domain rules if a railway-background teammate can supply them; the shape
of the check won't need to change.

Two tasks are incompatible if they cannot safely share a single possession (i.e. cannot
be worked on at the same time in the same block) — e.g. an OHE (overhead line) shutdown
and active track work in the same section need separate sign-off in most real rulebooks
because track staff can't be certified for electrical isolation and vice versa.
"""
from itertools import combinations
from typing import Iterable

# Task "type" here is a coarse category — map your Defect.defect_type / department
# into one of these when building Task objects for the scheduler.
TRACK_WORK = "TRACK_WORK"
OHE_WORK = "OHE_WORK"
SIGNAL_WORK = "SIGNAL_WORK"
OTHER = "OTHER"

# Unordered pairs that cannot be merged into the same possession.
INCOMPATIBLE_TASK_TYPES: set[frozenset] = {
    frozenset({TRACK_WORK, OHE_WORK}),   # electrical isolation vs. track staff on-foot
    frozenset({OHE_WORK, SIGNAL_WORK}),  # OHE isolation vs. live signal testing
}


def types_compatible(type_a: str, type_b: str) -> bool:
    if type_a == type_b:
        return True
    return frozenset({type_a, type_b}) not in INCOMPATIBLE_TASK_TYPES


def window_is_safe(task_types: Iterable[str]) -> tuple[bool, str | None]:
    """Checks every pair of task types proposed for one shared window/possession."""
    types = list(task_types)
    for a, b in combinations(types, 2):
        if not types_compatible(a, b):
            return False, f"{a} cannot share a possession with {b} — separate sign-off required"
    return True, None


class SafetyViolation:
    def __init__(self, block_ref, reason: str):
        self.block_ref = block_ref
        self.reason = reason

    def __repr__(self):
        return f"SafetyViolation({self.block_ref!r}: {self.reason})"


def validate_schedule(blocks) -> list[SafetyViolation]:
    """
    Final gate before a possession number is issued.

    `blocks` is any iterable of objects/dicts with `.task_types` (list[str]) and an
    identifier (`.id` or `["id"]`) — adapt the two attribute accesses below to your
    actual ScheduleBlock shape when wiring this in.
    """
    violations = []
    for block in blocks:
        task_types = block.task_types if hasattr(block, "task_types") else block["task_types"]
        block_id = block.id if hasattr(block, "id") else block.get("id")
        ok, reason = window_is_safe(task_types)
        if not ok:
            violations.append(SafetyViolation(block_id, reason))
    return violations
