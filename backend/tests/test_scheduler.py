import pytest
import datetime as dt
import pandas as pd
from app.scheduler import _free_windows_for_day, generate_schedule, _to_min, _to_hhmm


def test_free_window_subtraction():
    """Verify that busy train movement windows are subtracted from 24h, producing accurate free windows."""
    timetable_df = pd.DataFrame([
        {"corridor_id": "C1", "day_of_week": 0, "start_time": "08:00", "end_time": "11:00", "specific_date": None},
        {"corridor_id": "C1", "day_of_week": 0, "start_time": "15:00", "end_time": "18:00", "specific_date": None},
    ])

    windows = _free_windows_for_day("C1", 0, timetable_df, min_window_min=30)

    # Free windows should be:
    # 00:00 - 08:00 (0 to 480)
    # 11:00 - 15:00 (660 to 900)
    # 18:00 - 24:00 (1080 to 1440)
    assert len(windows) == 3
    assert windows[0] == (0, 480)
    assert windows[1] == (660, 900)
    assert windows[2] == (1080, 1440)


def test_free_window_minimum_duration_filter():
    """Verify that windows smaller than min_window_min are filtered out."""
    # Window between 08:00 and 08:20 is only 20 mins
    timetable_df = pd.DataFrame([
        {"corridor_id": "C1", "day_of_week": 1, "start_time": "00:00", "end_time": "08:00", "specific_date": None},
        {"corridor_id": "C1", "day_of_week": 1, "start_time": "08:20", "end_time": "24:00", "specific_date": None},
    ])

    # 30-min threshold should reject the 20-min slot
    windows = _free_windows_for_day("C1", 1, timetable_df, min_window_min=30)
    assert len(windows) == 0

    # 15-min threshold should accept it
    windows_small = _free_windows_for_day("C1", 1, timetable_df, min_window_min=15)
    assert len(windows_small) == 1
    assert windows_small[0] == (480, 500)


def test_dynamic_date_specific_timetable_override():
    """Verify that date-specific entries override the recurring weekly timetable template."""
    # Recurring Monday template has trains 06:00 - 18:00
    # Date-specific entry for 2026-10-05 (Monday) has only 20:00 - 22:00
    timetable_df = pd.DataFrame([
        {"corridor_id": "C1", "day_of_week": 0, "start_time": "06:00", "end_time": "18:00", "specific_date": None},
        {"corridor_id": "C1", "day_of_week": 0, "start_time": "20:00", "end_time": "22:00", "specific_date": "2026-10-05"},
    ])

    # Standard weekly Monday (without date_str) uses the recurring template
    weekly_windows = _free_windows_for_day("C1", 0, timetable_df)
    assert (0, 360) in weekly_windows   # 00:00 - 06:00
    assert (1080, 1440) in weekly_windows  # 18:00 - 24:00

    # Specific date 2026-10-05 uses the live COA movement override
    specific_windows = _free_windows_for_day("C1", 0, timetable_df, date_str="2026-10-05")
    assert (0, 1200) in specific_windows     # 00:00 - 20:00 is completely free!
    assert (1320, 1440) in specific_windows   # 22:00 - 24:00


def test_merge_logic():
    """Verify that compatible tasks on the same corridor in the same window are merged into one block."""
    corridors_df = pd.DataFrame([
        {"corridor_id": "COR-MERGE", "name": "Merge Test Line", "division": "D1", "zone": "Z1", "is_high_density": False, "avg_daily_trains": 20}
    ])
    # 2 defects on the same corridor
    defects_df = pd.DataFrame([
        {
            "task_id": 1,
            "corridor_id": "COR-MERGE",
            "severity": 4,
            "due_date": "2026-10-01",
            "recurrence_count": 0,
            "estimated_block_duration": 2.0,  # 2 hours
            "status": "open",
        },
        {
            "task_id": 2,
            "corridor_id": "COR-MERGE",
            "severity": 3,
            "due_date": "2026-10-02",
            "recurrence_count": 0,
            "estimated_block_duration": 1.5,  # 1.5 hours
            "status": "open",
        },
    ])
    # Corridor has a free window of 6 hours from 01:00 to 07:00 (busy 07:00 - 24:00)
    timetable_df = pd.DataFrame([
        {"corridor_id": "COR-MERGE", "day_of_week": i, "start_time": "07:00", "end_time": "24:00", "specific_date": None}
        for i in range(7)
    ])

    schedule_df = generate_schedule(defects_df, corridors_df, timetable_df)

    # Should produce 1 merged block, not 2 separate blocks!
    assert len(schedule_df) == 1
    block = schedule_df.iloc[0]
    assert block["merged_with"] is not None
    assert "2" in str(block["merged_with"])
    assert "merged with task 2" in block["explanation_text"]

    # Slot start is 00:00 (free window 00:00-07:00), combined duration is 3.5 hrs (210 mins) -> slot_end 03:30
    assert block["slot_start"] == "00:00"
    assert block["slot_end"] == "03:30"


def test_unscheduled_fallback_path():
    """Verify that tasks exceeding all free windows are gracefully flagged as UNSCHEDULED."""
    corridors_df = pd.DataFrame([
        {"corridor_id": "COR-BUSY", "name": "Ultra Busy Line", "division": "D1", "zone": "Z1", "is_high_density": True, "avg_daily_trains": 80}
    ])
    # Train movement takes almost the full day across all 7 days, leaving only 30 min free windows
    timetable_df = pd.DataFrame([
        {"corridor_id": "COR-BUSY", "day_of_week": i, "start_time": "00:30", "end_time": "24:00", "specific_date": None}
        for i in range(7)
    ])
    # Defect requires a 4-hour block
    defects_df = pd.DataFrame([
        {
            "task_id": 99,
            "corridor_id": "COR-BUSY",
            "severity": 5,
            "due_date": "2026-09-25",
            "recurrence_count": 0,
            "estimated_block_duration": 4.0,
            "status": "open",
        }
    ])

    schedule_df = generate_schedule(defects_df, corridors_df, timetable_df)

    assert len(schedule_df) == 1
    block = schedule_df.iloc[0]
    assert block["slot_start"] == "00:00"
    assert block["slot_end"] == "00:00"
    assert "UNSCHEDULED" in block["explanation_text"]
