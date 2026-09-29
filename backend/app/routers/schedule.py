import os
import datetime as dt
from typing import List
import pandas as pd
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from .. import models, schemas
from ..database import get_db
from ..auth import get_current_user, require_roles
from ..scheduler import (
    generate_schedule,
    generate_schedule_v2,
    get_last_optimization_metrics,
    map_discipline_to_task_type,
    _to_hhmm,
)
from ..safety import validate_schedule
from ..lifecycle import PossessionStatus, apply_transition, IllegalTransition

router = APIRouter(prefix="/api/schedule", tags=["schedule"])
USE_OPTIMIZER_V2 = os.getenv("SCHEDULER_ENGINE", "v2") == "v2"


def _dfs(db: Session):
    defects_df = pd.read_sql(db.query(models.Defect).statement, db.bind)
    corridors_df = pd.read_sql(db.query(models.Corridor).statement, db.bind)
    timetable_df = pd.read_sql(db.query(models.TimetableSlot).statement, db.bind)
    return defects_df, corridors_df, timetable_df


@router.get("", response_model=List[schemas.ScheduleBlockOut])
def list_schedule(db: Session = Depends(get_db), _=Depends(get_current_user)):
    return db.query(models.ScheduleBlock).order_by(models.ScheduleBlock.date, models.ScheduleBlock.slot_start).all()


@router.post("/generate")
def generate(db: Session = Depends(get_db),
             user: models.User = Depends(require_roles(models.UserRole.ADMIN))):
    """Only the section controller (admin role) commits a new plan to the DB."""
    defects_df, corridors_df, timetable_df = _dfs(db)
    schedule_fn = generate_schedule_v2 if USE_OPTIMIZER_V2 else generate_schedule
    schedule_df = schedule_fn(defects_df, corridors_df, timetable_df)

    defects_by_id = {d.task_id: d for d in db.query(models.Defect).all()}

    year = dt.datetime.now(dt.timezone.utc).year
    seq = 1
    db.query(models.ScheduleBlock).delete()

    safety_violations = []

    for _, row in schedule_df.iterrows():
        tid = int(row["task_id"])
        is_unscheduled = "UNSCHEDULED" in str(row.get("explanation_text", ""))

        # 1. Determine all task_types in this block for safety gate
        if "task_types" in row and isinstance(row["task_types"], (list, tuple)) and row["task_types"]:
            ttypes = list(row["task_types"])
        else:
            task_ids = [tid]
            if row.get("merged_with"):
                for t in str(row["merged_with"]).split(","):
                    t = t.strip()
                    if t.isdigit():
                        task_ids.append(int(t))
            ttypes = []
            for t in task_ids:
                d = defects_by_id.get(t)
                if d:
                    dept = getattr(d, "department", "") or getattr(d, "source_system", "")
                    dtype = getattr(d, "defect_type", "")
                    ttypes.append(map_discipline_to_task_type(dept, dtype))

        # 2. Safety gate validation before PN issuance (Step 5)
        violations = validate_schedule([{"id": tid, "task_types": ttypes}])

        if violations:
            violation = violations[0]
            safety_violations.append({"task_id": tid, "reason": violation.reason})
            pn = None
            block_status = PossessionStatus.REJECTED.value
            explanation = f"SAFETY REJECTION: {violation.reason} | {row.get('explanation_text', '')}"
            audit_entry = apply_transition(
                current=PossessionStatus.SCHEDULED,
                target=PossessionStatus.REJECTED,
                user_id=user.id,
                entity_id=str(tid),
                reason=violation.reason,
            )
            db.add(models.AuditLog(**audit_entry))
        elif is_unscheduled:
            pn = None
            block_status = PossessionStatus.SCHEDULED.value
            explanation = row.get("explanation_text", "")
        else:
            pn = f"PN-{year}-{seq:04d}"
            seq += 1
            block_status = PossessionStatus.ISSUED.value
            explanation = row.get("explanation_text", "")
            audit_entry = apply_transition(
                current=PossessionStatus.SAFETY_APPROVED,
                target=PossessionStatus.ISSUED,
                user_id=user.id,
                entity_id=str(tid),
                reason=f"Possession number {pn} issued after safety verification",
            )
            db.add(models.AuditLog(**audit_entry))

        block = models.ScheduleBlock(
            task_id=tid,
            corridor_id=row["corridor_id"],
            date=row["date"],
            slot_start=row["slot_start"],
            slot_end=row["slot_end"],
            priority_score=float(row["priority_score"]),
            merged_with=row.get("merged_with"),
            explanation_text=explanation,
            status=block_status,
            possession_number=pn,
        )
        db.add(block)

        # Update defect statuses
        merged_field = row.get("merged_with")
        task_ids = [int(t) for t in str(merged_field).split(",")] if merged_field else [tid]
        for t in task_ids:
            defect = defects_by_id.get(t)
            if defect and defect.status == models.DefectStatus.OPEN and not violations:
                defect.status = models.DefectStatus.SCHEDULED

    db.add(models.AuditLog(
        user_id=user.id,
        action="generate_schedule",
        entity="schedule_blocks",
        details=f"{len(schedule_df)} blocks generated (optimizer v2={USE_OPTIMIZER_V2})"
    ))
    db.commit()

    blocks = db.query(models.ScheduleBlock).all()
    metrics = get_last_optimization_metrics()

    return {
        "count": len(blocks),
        "schedule": [schemas.ScheduleBlockOut.model_validate(b) for b in blocks],
        "greedy_cost": metrics.get("greedy_cost", 0.0),
        "optimized_cost": metrics.get("optimized_cost", 0.0),
        "improvement_pct": metrics.get("improvement_pct", 0.0),
        "note": metrics.get("note", "measured on this run's generated schedule, not a general claim"),
        "safety_violations": safety_violations,
    }


@router.patch("/{sched_id}/complete", response_model=schemas.ScheduleBlockOut)
def complete_block(sched_id: int, payload: schemas.CompleteBlockIn, db: Session = Depends(get_db),
                    user: models.User = Depends(get_current_user)):
    block = db.query(models.ScheduleBlock).filter(models.ScheduleBlock.id == sched_id).first()
    if not block:
        raise HTTPException(status_code=404, detail="Schedule block not found")

    def parse_hours(t):
        h, m = t.split(":")
        return int(h) + int(m) / 60.0

    scheduled_duration = parse_hours(block.slot_end) - parse_hours(block.slot_start)
    if scheduled_duration <= 0:
        scheduled_duration = 2.0

    block.actual_duration = payload.actual_duration
    is_overrun = payload.actual_duration > scheduled_duration

    # 1. Enforce lifecycle transitions through apply_transition (Step 6)
    try:
        # If currently issued or planned, transition to ACTIVE first
        if block.status in (PossessionStatus.ISSUED.value, PossessionStatus.SCHEDULED.value, "planned"):
            start_audit = apply_transition(
                current=PossessionStatus.ISSUED,
                target=PossessionStatus.ACTIVE,
                user_id=user.id,
                entity_id=str(sched_id),
                reason="Possession block initiated",
            )
            db.add(models.AuditLog(**start_audit))
            block.status = PossessionStatus.ACTIVE.value

        target_status = PossessionStatus.OVERRUN if is_overrun else PossessionStatus.COMPLETED
        comp_audit = apply_transition(
            current=PossessionStatus.ACTIVE,
            target=target_status,
            user_id=user.id,
            entity_id=str(sched_id),
            reason=f"Block completed: actual {payload.actual_duration:.1f}h vs planned {scheduled_duration:.1f}h",
        )
        db.add(models.AuditLog(**comp_audit))
        block.status = target_status.value
    except IllegalTransition as exc:
        raise HTTPException(status_code=409, detail=str(exc))

    # 2. Update constituent defects
    merged_field = block.merged_with
    task_ids = [int(t) for t in merged_field.split(",")] if merged_field else ([block.task_id] if block.task_id else [])
    new_defect_status = models.DefectStatus.OVERRUN if is_overrun else models.DefectStatus.COMPLETED
    for tid in task_ids:
        defect = db.query(models.Defect).filter(models.Defect.task_id == tid).first()
        if defect:
            defect.status = new_defect_status

    # 3. Handle Overrun Cascade Rescheduling (Step 6.3)
    if is_overrun:
        actual_end_min = int(parse_hours(block.slot_start) * 60) + int(payload.actual_duration * 60)
        overrun_msg = (f"OVERRUN: took {payload.actual_duration:.1f}h vs {scheduled_duration:.1f}h scheduled "
                       "— downstream corridor slots flagged for reschedule.")

        downstream = db.query(models.ScheduleBlock).filter(
            models.ScheduleBlock.corridor_id == block.corridor_id,
            models.ScheduleBlock.date == block.date,
            models.ScheduleBlock.id != block.id,
            models.ScheduleBlock.status.in_([
                PossessionStatus.ISSUED.value, PossessionStatus.SCHEDULED.value,
                PossessionStatus.ACTIVE.value, "planned"
            ])
        ).all()

        rescheduled_blocks = []
        for cand in downstream:
            cand_start = int(parse_hours(cand.slot_start) * 60)
            if cand_start < actual_end_min:
                cand_dur = int((parse_hours(cand.slot_end) - parse_hours(cand.slot_start)) * 60)
                new_start = actual_end_min + 15  # 15-min safety clearance
                new_end = new_start + cand_dur

                try:
                    resched_audit = apply_transition(
                        current=PossessionStatus.OVERRUN,
                        target=PossessionStatus.RESCHEDULED,
                        user_id=user.id,
                        entity_id=str(cand.id),
                        reason=f"Cascaded reschedule due to overrun on block {block.id}",
                    )
                    db.add(models.AuditLog(**resched_audit))

                    cand.slot_start = _to_hhmm(new_start)
                    cand.slot_end = _to_hhmm(new_end)
                    cand.status = PossessionStatus.ISSUED.value
                    cand.explanation_text = (
                        f"RESCHEDULED: slot shifted to {cand.slot_start}-{cand.slot_end} "
                        f"due to overrun on block {block.id} | {cand.explanation_text}"
                    )
                    rescheduled_blocks.append(f"Block #{cand.id} ({cand.slot_start}-{cand.slot_end})")
                except IllegalTransition:
                    pass

        if rescheduled_blocks:
            overrun_msg += f" Rescheduled {len(rescheduled_blocks)} downstream block(s): {', '.join(rescheduled_blocks)}."

        block.explanation_text = f"{block.explanation_text} | {overrun_msg}" if block.explanation_text else overrun_msg

    db.add(models.AuditLog(
        user_id=user.id,
        action="complete_block",
        entity="schedule_blocks",
        entity_id=str(sched_id),
        details=block.status,
    ))
    db.commit()
    db.refresh(block)
    return block
