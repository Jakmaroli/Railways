import datetime as dt
import pandas as pd
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from .. import models, schemas
from ..database import get_db
from ..auth import get_current_user
from ..scoring import priority_score_batch, get_model_status

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])


@router.get("/summary", response_model=schemas.KpiSummary)
def summary(db: Session = Depends(get_db), _=Depends(get_current_user)):
    today = dt.date.today().isoformat()
    defects = db.query(models.Defect).all()
    corridor_map = {c.corridor_id: c for c in db.query(models.Corridor).all()}

    open_defects = [d for d in defects if d.status == models.DefectStatus.OPEN]
    overdue = [d for d in open_defects if d.due_date < today]

    scores = []
    at_risk_corridors = set()
    if defects:
        defects_df = pd.DataFrame([
            {
                "corridor_id": d.corridor_id,
                "severity": d.severity,
                "due_date": d.due_date,
                "recurrence_count": d.recurrence_count,
                "estimated_block_duration": d.estimated_block_duration,
                "status": d.status,
            }
            for d in defects
        ])
        scores_series = priority_score_batch(defects_df, corridor_map)
        scores = scores_series.tolist()
        for idx, s in enumerate(scores):
            d = defects[idx]
            corridor = corridor_map.get(d.corridor_id)
            if corridor and corridor.is_high_density and s >= 6.5 and d.status != models.DefectStatus.COMPLETED:
                at_risk_corridors.add(corridor.corridor_id)

    scheduled = db.query(models.ScheduleBlock).count()
    completed_on_time = db.query(models.ScheduleBlock).filter(models.ScheduleBlock.status == "completed").count()
    overrun = db.query(models.ScheduleBlock).filter(models.ScheduleBlock.status == "overrun").count()
    finished = completed_on_time + overrun
    punctuality_pct = round((completed_on_time / finished) * 100, 1) if finished else 100.0

    return schemas.KpiSummary(
        open_defects=len(open_defects),
        overdue_defects=len(overdue),
        scheduled_blocks=scheduled,
        avg_priority_score=round(sum(scores) / len(scores), 2) if scores else 0.0,
        high_density_corridors_at_risk=len(at_risk_corridors),
        punctuality_protection_pct=punctuality_pct,
    )


@router.get("/ml-insights")
def ml_insights(db: Session = Depends(get_db), _=Depends(get_current_user)):
    """Everything the Analytics & ML Insights screen needs in one call: whether the
    trained priority model is actually live right now (vs. serving off the
    rule-based fallback), what it learned per feature, how it validated, and the
    real outcome totals for blocks the planner has produced."""
    engine_status = get_model_status()

    total_blocks = db.query(models.ScheduleBlock).count()
    completed = db.query(models.ScheduleBlock).filter(models.ScheduleBlock.status == "completed").count()
    overrun = db.query(models.ScheduleBlock).filter(models.ScheduleBlock.status == "overrun").count()
    planned = db.query(models.ScheduleBlock).filter(
        models.ScheduleBlock.status.in_(["planned", "issued", "scheduled", "safety_approved"])
    ).count()
    merged_blocks = db.query(models.ScheduleBlock).filter(models.ScheduleBlock.merged_with.isnot(None)).count()

    from ..scheduler import get_last_optimization_metrics
    optimizer_metrics = get_last_optimization_metrics()

    return {
        "engine": engine_status,
        "totals": {
            "blocks_scheduled": total_blocks,
            "completed": completed,
            "overrun": overrun,
            "planned": planned,
            "merged_blocks": merged_blocks,
        },
        "optimizer": optimizer_metrics,
    }
