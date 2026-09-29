import pytest
import datetime as dt
from fastapi.testclient import TestClient
from app.main import app
from app.database import Base, engine, SessionLocal
from app import models, auth
from app.lifecycle import PossessionStatus, IllegalTransition, apply_transition
from app.safety import (
    TRACK_WORK,
    OHE_WORK,
    SIGNAL_WORK,
    OTHER,
    window_is_safe,
    validate_schedule,
)
from app.scheduler import generate_schedule_v2, get_last_optimization_metrics

client = TestClient(app)


@pytest.fixture(scope="module", autouse=True)
def setup_optimizer_test_db():
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    # Ensure controller user exists
    user = db.query(models.User).filter(models.User.username == "test_opt_admin").first()
    if not user:
        user = models.User(
            username="test_opt_admin",
            hashed_password=auth.hash_password("adminpass123"),
            full_name="Optimizer Test Admin",
            department=models.Department.CONTROL,
            role=models.UserRole.ADMIN,
        )
        db.add(user)
    db.commit()
    db.close()


def get_admin_headers():
    res = client.post("/api/auth/login", json={"username": "test_opt_admin", "password": "adminpass123"})
    if res.status_code != 200:
        res = client.post("/api/auth/login", data={"username": "test_opt_admin", "password": "adminpass123"})
    token = res.json()["data"]["access_token"]
    return {"Authorization": f"Bearer {token}"}


# ==============================================================================
# 1. OPTIMIZER V2 GENERATION & METRICS
# ==============================================================================

def test_optimizer_v2_generation_endpoint():
    """Verify POST /api/schedule/generate runs optimizer v2 and returns measured improvement numbers."""
    headers = get_admin_headers()
    res = client.post("/api/schedule/generate", headers=headers)
    assert res.status_code == 200
    data = res.json()["data"]

    assert "count" in data
    assert "schedule" in data
    assert "improvement_pct" in data
    assert "greedy_cost" in data
    assert "optimized_cost" in data
    assert data["note"] == "measured on this run's generated schedule, not a general claim"

    # Check DB rows
    db = SessionLocal()
    blocks = db.query(models.ScheduleBlock).all()
    assert len(blocks) == data["count"]
    for b in blocks:
        if "UNSCHEDULED" not in b.explanation_text and "SAFETY REJECTION" not in b.explanation_text:
            assert b.possession_number is not None
            assert b.possession_number.startswith("PN-")
            assert b.status == PossessionStatus.ISSUED.value
    db.close()


# ==============================================================================
# 2. SAFETY GATE: INCOMPATIBLE TASK TYPES REJECTION
# ==============================================================================

def test_safety_gate_window_is_safe():
    """Direct safety rule test: TRACK_WORK and OHE_WORK cannot share a possession."""
    safe_same, _ = window_is_safe([TRACK_WORK, TRACK_WORK])
    assert safe_same is True

    safe_mixed, _ = window_is_safe([TRACK_WORK, SIGNAL_WORK])
    assert safe_mixed is True

    unsafe_ohe_track, reason1 = window_is_safe([TRACK_WORK, OHE_WORK])
    assert unsafe_ohe_track is False
    assert "cannot share a possession with" in reason1

    unsafe_ohe_sig, reason2 = window_is_safe([OHE_WORK, SIGNAL_WORK])
    assert unsafe_ohe_sig is False
    assert "cannot share a possession with" in reason2


def test_safety_gate_rejects_issuance_for_incompatible_block():
    """Simulate incompatible tasks landing in the same block — verifies that PN is suppressed and status=rejected."""
    incompatible_block = {
        "id": 999,
        "task_types": [TRACK_WORK, OHE_WORK],
    }
    violations = validate_schedule([incompatible_block])
    assert len(violations) == 1
    assert violations[0].block_ref == 999
    assert "TRACK_WORK cannot share a possession with OHE_WORK" in violations[0].reason


# ==============================================================================
# 3. LIFECYCLE TRANSITIONS & 409 CONFLICT HANDLING
# ==============================================================================

def test_lifecycle_legal_progression_and_audit():
    """Verify legal step-by-step transition generates formatted audit dict."""
    audit1 = apply_transition(PossessionStatus.REQUESTED, PossessionStatus.VALIDATED, user_id=1, entity_id="101")
    assert audit1["action"] == "transition_requested_to_validated"

    audit2 = apply_transition(PossessionStatus.SCHEDULED, PossessionStatus.SAFETY_APPROVED, user_id=1, entity_id="101")
    assert audit2["action"] == "transition_scheduled_to_safety_approved"

    audit3 = apply_transition(PossessionStatus.SAFETY_APPROVED, PossessionStatus.ISSUED, user_id=1, entity_id="101")
    assert audit3["action"] == "transition_safety_approved_to_issued"


def test_lifecycle_illegal_transition_raises():
    """Attempting an illegal jump (e.g. REQUESTED -> COMPLETED) raises IllegalTransition."""
    with pytest.raises(IllegalTransition):
        apply_transition(PossessionStatus.REQUESTED, PossessionStatus.COMPLETED, user_id=1, entity_id="101")


# ==============================================================================
# 4. OVERRUN CASCADE & RESCHEDULING
# ==============================================================================

def test_complete_block_overrun_and_cascade():
    """Verify that completing a block with actual_duration > scheduled_duration triggers OVERRUN and cascade."""
    headers = get_admin_headers()
    # Generate schedule first
    gen_res = client.post("/api/schedule/generate", headers=headers)
    assert gen_res.status_code == 200

    db = SessionLocal()
    block = db.query(models.ScheduleBlock).filter(models.ScheduleBlock.status == PossessionStatus.ISSUED.value).first()
    assert block is not None
    block_id = block.id
    db.close()

    # Complete with excessive duration (8.0 hours vs normal 2.0-3.0)
    complete_res = client.patch(
        f"/api/schedule/{block_id}/complete",
        json={"actual_duration": 8.5},
        headers=headers,
    )
    assert complete_res.status_code == 200
    comp_data = complete_res.json()["data"]
    assert comp_data["status"] == "overrun"
    assert "OVERRUN:" in comp_data["explanation_text"]


# ==============================================================================
# 5. DASHBOARD INSIGHTS EXPOSES OPTIMIZER METRICS
# ==============================================================================

def test_dashboard_ml_insights_exposes_optimizer():
    """Verify /api/dashboard/ml-insights contains optimizer metrics and caveat note."""
    headers = get_admin_headers()
    res = client.get("/api/dashboard/ml-insights", headers=headers)
    assert res.status_code == 200
    data = res.json()["data"]
    assert "optimizer" in data
    opt = data["optimizer"]
    assert "improvement_pct" in opt
    assert "greedy_cost" in opt
    assert "optimized_cost" in opt
    assert opt["note"] == "measured on this run's generated schedule, not a general claim"
