import pytest
from app.lifecycle import PossessionStatus, apply_transition, IllegalTransition, next_possession_number


def test_legal_forward_path():
    seq = [
        (PossessionStatus.REQUESTED, PossessionStatus.VALIDATED),
        (PossessionStatus.VALIDATED, PossessionStatus.SCHEDULED),
        (PossessionStatus.SCHEDULED, PossessionStatus.SAFETY_APPROVED),
        (PossessionStatus.SAFETY_APPROVED, PossessionStatus.ISSUED),
        (PossessionStatus.ISSUED, PossessionStatus.ACTIVE),
        (PossessionStatus.ACTIVE, PossessionStatus.COMPLETED),
    ]
    for current, target in seq:
        row = apply_transition(current, target, user_id=1, entity_id="42")
        assert row["action"] == f"transition_{current.value}_to_{target.value}"


def test_illegal_skip_is_rejected():
    with pytest.raises(IllegalTransition):
        apply_transition(PossessionStatus.REQUESTED, PossessionStatus.ISSUED, user_id=1, entity_id="42")


def test_overrun_can_reschedule():
    row = apply_transition(PossessionStatus.OVERRUN, PossessionStatus.RESCHEDULED, user_id=1, entity_id="42",
                            reason="37 min overrun, 2 downstream trains affected")
    assert "37 min overrun" in row["details"]


def test_possession_number_format():
    assert next_possession_number(2026, 42) == "PN-2026-0042"
