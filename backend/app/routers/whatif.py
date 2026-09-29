import os
import pandas as pd
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from .. import models, schemas
from ..database import get_db
from ..auth import get_current_user
from ..scheduler import generate_schedule, generate_schedule_v2

router = APIRouter(prefix="/api/whatif", tags=["whatif"])
USE_OPTIMIZER_V2 = os.getenv("SCHEDULER_ENGINE", "v2") == "v2"


@router.post("")
def whatif(payload: schemas.WhatIfIn, db: Session = Depends(get_db), _=Depends(get_current_user)):
    """Re-runs the scheduler in memory with overrides — never touches committed schedule_blocks."""
    defects_df = pd.read_sql(db.query(models.Defect).statement, db.bind)
    corridors_df = pd.read_sql(db.query(models.Corridor).statement, db.bind)
    timetable_df = pd.read_sql(db.query(models.TimetableSlot).statement, db.bind)

    if payload.override_defect:
        task_id = payload.override_defect.get("task_id")
        if task_id is not None and not defects_df.empty:
            for field, val in payload.override_defect.items():
                if field in defects_df.columns:
                    defects_df.loc[defects_df["task_id"] == task_id, field] = val

    if payload.defects:
        defects_df = pd.DataFrame(payload.defects)
    if payload.corridors:
        corridors_df = pd.DataFrame(payload.corridors)

    schedule_fn = generate_schedule_v2 if USE_OPTIMIZER_V2 else generate_schedule
    schedule_df = schedule_fn(defects_df, corridors_df, timetable_df)
    schedule_df = schedule_df.astype(object).where(pd.notna(schedule_df), None)

    # EnvelopeMiddleware adds the {"status": "success", "data": ...} wrapper.
    return {"is_whatif": True, "schedule": schedule_df.to_dict(orient="records")}
