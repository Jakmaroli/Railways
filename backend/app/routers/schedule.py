import datetime as dt
from typing import List
import pandas as pd
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from .. import models, schemas
from ..database import get_db
from ..auth import get_current_user, require_roles
from ..scheduler import generate_schedule

router = APIRouter(prefix="/api/schedule", tags=["schedule"])


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
    schedule_df = generate_schedule(defects_df, corridors_df, timetable_df)

    year = dt.datetime.utcnow().year
    seq = 1
    db.query(models.ScheduleBlock).delete()
    for _, row in schedule_df.iterrows():
        is_unscheduled = "UNSCHEDULED" in str(row.get("explanation_text", ""))
        pn = f"PN-{year}-{seq:04d}" if not is_unscheduled else None
        if pn:
            seq += 1
        db.add(models.ScheduleBlock(
            task_id=int(row["task_id"]), corridor_id=row["corridor_id"], date=row["date"],
            slot_start=row["slot_start"], slot_end=row["slot_end"],
            priority_score=float(row["priority_score"]),
            merged_with=row.get("merged_with"), explanation_text=row["explanation_text"],
            possession_number=pn,
        ))
        # A merged block's `merged_with` covers every task_id folded into it — update all
        # of them, not just the block's primary task_id, or merged-in defects stay "open".
        merged_field = row.get("merged_with")
        task_ids = [int(t) for t in str(merged_field).split(",")] if merged_field else [int(row["task_id"])]
        for tid in task_ids:
            defect = db.query(models.Defect).filter(models.Defect.task_id == tid).first()
            if defect and defect.status == models.DefectStatus.OPEN:
                defect.status = models.DefectStatus.SCHEDULED
    db.add(models.AuditLog(user_id=user.id, action="generate_schedule", entity="schedule_blocks",
                            details=f"{len(schedule_df)} blocks generated"))
    db.commit()

    blocks = db.query(models.ScheduleBlock).all()
    # No manual envelope here — EnvelopeMiddleware wraps this into
    # {"status": "success", "data": {"count": ..., "schedule": [...]}} uniformly
    # with every other endpoint.
    return {"count": len(blocks), "schedule": [schemas.ScheduleBlockOut.model_validate(b) for b in blocks]}


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
    if payload.actual_duration > scheduled_duration:
        overrun_msg = (f"OVERRUN: took {payload.actual_duration:.1f}h vs {scheduled_duration:.1f}h scheduled "
                        "— downstream corridor slots flagged for reschedule.")
        block.explanation_text = f"{block.explanation_text} | {overrun_msg}" if block.explanation_text else overrun_msg
        block.status = "overrun"
    else:
        block.status = "completed"

    merged_field = block.merged_with
    task_ids = [int(t) for t in merged_field.split(",")] if merged_field else ([block.task_id] if block.task_id else [])
    new_status = models.DefectStatus.OVERRUN if block.status == "overrun" else models.DefectStatus.COMPLETED
    for tid in task_ids:
        defect = db.query(models.Defect).filter(models.Defect.task_id == tid).first()
        if defect:
            defect.status = new_status

    db.add(models.AuditLog(user_id=user.id, action="complete_block", entity="schedule_blocks",
                            entity_id=str(sched_id), details=block.status))
    db.commit()
    db.refresh(block)
    return block
