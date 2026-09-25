import pytest
import pandas as pd
import numpy as np
from app import scoring


def test_rule_fallback_matches_formula():
    """Verify that _rule_based_priority implements the exact weighted domain formula."""
    test_cases = [
        # (severity, is_high_density, days_overdue, recurrence_count, duration)
        (3, 0, 0, 0, 2.0),
        (5, 1, 10, 3, 4.0),
        (1, 0, 0, 0, 0.5),
        (4, 1, 0, 2, 6.0),
    ]

    for sev, hd, od, rec, dur in test_cases:
        criticality = sev * 2.0
        urgency = min(10.0, od * 0.4 + rec * 1.2)
        impact = hd * 6.0 + min(4.0, dur * 0.6)
        base = 0.4 * criticality + 0.35 * urgency + 0.25 * impact
        expected = round(max(0.0, min(10.0, base)), 2)

        actual = scoring._rule_based_priority(sev, hd, od, rec, dur)
        assert actual == expected, f"Mismatch for inputs {(sev, hd, od, rec, dur)}: expected {expected}, got {actual}"


def test_model_load_failure_path():
    """Verify that when the model is unavailable or throws during prediction,

    the scoring engine seamlessly falls back to the transparent rule without raising exceptions.
    """
    defect = {
        "task_id": 101,
        "corridor_id": "COR-01",
        "severity": 4,
        "due_date": "2026-09-01",
        "recurrence_count": 2,
        "estimated_block_duration": 3.0,
    }
    corridor = {"corridor_id": "COR-01", "is_high_density": True}

    # Temporarily set _MODEL and load_model to simulate missing/failed model
    orig_model = scoring._MODEL
    orig_load_model = scoring.load_model
    try:
        scoring._MODEL = None
        scoring.load_model = lambda force=False: None
        initial_fallback_calls = scoring._STATS["fallback_calls"]

        score = scoring.priority_score(defect, corridor)

        # Must return valid float between 0 and 10
        assert 0.0 <= score <= 10.0
        assert scoring._STATS["fallback_calls"] > initial_fallback_calls

        # Compare directly to rule calculation
        expected_score = scoring._rule_based_priority(
            severity=4,
            is_high_density=1,
            days_overdue=scoring._days_overdue("2026-09-01"),
            recurrence_count=2,
            estimated_block_duration=3.0,
        )
        assert score == expected_score
    finally:
        scoring._MODEL = orig_model
        scoring.load_model = orig_load_model


def test_batch_scoring_matches_individual():
    """Verify that priority_score_batch produces consistent scores with priority_score."""
    defects = pd.DataFrame([
        {"corridor_id": "C1", "severity": 5, "due_date": "2026-09-01", "recurrence_count": 3, "estimated_block_duration": 4.0},
        {"corridor_id": "C2", "severity": 2, "due_date": "2026-10-15", "recurrence_count": 0, "estimated_block_duration": 1.5},
        {"corridor_id": "C1", "severity": 3, "due_date": "2026-09-20", "recurrence_count": 1, "estimated_block_duration": 2.0},
    ])
    corridor_lookup = {
        "C1": {"corridor_id": "C1", "is_high_density": True},
        "C2": {"corridor_id": "C2", "is_high_density": False},
    }

    batch_scores = scoring.priority_score_batch(defects, corridor_lookup)
    assert len(batch_scores) == len(defects)

    for idx, row in defects.iterrows():
        single_score = scoring.priority_score(row.to_dict(), corridor_lookup[row["corridor_id"]])
        assert abs(batch_scores[idx] - single_score) < 0.05


def test_health_score():
    """Verify health score reflects degradation with severity and overdue days."""
    good_defect = {"severity": 1, "due_date": "2026-12-31"}
    bad_defect = {"severity": 5, "due_date": "2026-08-01"}

    assert scoring.health_score(good_defect) > scoring.health_score(bad_defect)
    assert 0.0 <= scoring.health_score(bad_defect) <= 100.0


def test_explain_priority():
    """Verify plain-language reason includes key factors for transparency."""
    defect = {
        "severity": 5,
        "due_date": "2026-08-01",
        "recurrence_count": 3,
        "estimated_block_duration": 3.0,
    }
    corridor = {"is_high_density": True}
    explanation = scoring.explain_priority(defect, corridor)

    assert "severity 5/5" in explanation
    assert "recurred 3x" in explanation
    assert "high-density corridor" in explanation
