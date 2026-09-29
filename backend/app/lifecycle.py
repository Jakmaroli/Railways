"""
Possession lifecycle state machine.

Extends whatever status field your ScheduleBlock/BlockRequest currently has into a
full lifecycle. Wire `apply_transition` in wherever you currently do
`block.status = X` — it validates the transition is legal and returns an audit-log
row shape so every state change is recorded, not just the final one.
"""
from enum import Enum
import datetime as dt


class PossessionStatus(str, Enum):
    REQUESTED = "requested"           # BDMS demand raised / defect scheduled by optimizer
    VALIDATED = "validated"           # passed data validation (corridor/date sanity)
    SCHEDULED = "scheduled"           # placed into a window by the optimizer
    SAFETY_APPROVED = "safety_approved"  # passed safety.validate_schedule()
    ISSUED = "issued"                 # possession number generated
    ACTIVE = "active"                 # controller has started the block
    COMPLETED = "completed"
    OVERRUN = "overrun"
    RESCHEDULED = "rescheduled"       # spun off after an overrun cascade
    REJECTED = "rejected"             # failed safety or was declined


# legal_from[state] = set of states that can transition INTO `state`
_LEGAL_TRANSITIONS = {
    PossessionStatus.VALIDATED: {PossessionStatus.REQUESTED},
    PossessionStatus.SCHEDULED: {PossessionStatus.VALIDATED, PossessionStatus.RESCHEDULED},
    PossessionStatus.SAFETY_APPROVED: {PossessionStatus.SCHEDULED},
    PossessionStatus.ISSUED: {PossessionStatus.SAFETY_APPROVED},
    PossessionStatus.ACTIVE: {PossessionStatus.ISSUED},
    PossessionStatus.COMPLETED: {PossessionStatus.ACTIVE},
    PossessionStatus.OVERRUN: {PossessionStatus.ACTIVE},
    PossessionStatus.RESCHEDULED: {PossessionStatus.OVERRUN},
    PossessionStatus.REJECTED: {PossessionStatus.SCHEDULED, PossessionStatus.SAFETY_APPROVED, PossessionStatus.REQUESTED},
}


class IllegalTransition(Exception):
    pass


def apply_transition(current: PossessionStatus, target: PossessionStatus,
                      user_id: int, entity_id: str, reason: str = "") -> dict:
    """
    Validates current -> target is legal, and returns a dict shaped for your
    AuditLog table. Does NOT write to the DB — the caller commits it, so this stays
    testable without a database.
    """
    allowed_from = _LEGAL_TRANSITIONS.get(target)
    if allowed_from is not None and current not in allowed_from:
        raise IllegalTransition(
            f"Cannot move possession from '{current.value}' to '{target.value}' "
            f"(allowed only from: {sorted(s.value for s in allowed_from)})"
        )
    return {
        "user_id": user_id,
        "action": f"transition_{current.value}_to_{target.value}",
        "entity": "schedule_block",
        "entity_id": entity_id,
        "details": reason,
        "timestamp": dt.datetime.now(dt.timezone.utc),
    }


def next_possession_number(year: int, sequence: int) -> str:
    """PN-YYYY-XXXX, matching the format your repo README already documents."""
    return f"PN-{year}-{sequence:04d}"
