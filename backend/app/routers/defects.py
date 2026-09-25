from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from .. import models, schemas
from ..database import get_db
from ..auth import get_current_user
from ..scoring import priority_score, health_score

router = APIRouter(prefix="/api/defects", tags=["defects"])


def _to_out(d: models.Defect, corridor: Optional[models.Corridor]) -> schemas.DefectOut:
    corridor_dict = {"is_high_density": corridor.is_high_density} if corridor else None
    d_dict = {
        "severity": d.severity, "due_date": d.due_date,
        "recurrence_count": d.recurrence_count,
        "estimated_block_duration": d.estimated_block_duration,
    }
    out = schemas.DefectOut.model_validate(d)
    out.priority_score = priority_score(d_dict, corridor_dict)
    out.health_score = health_score(d_dict)
    return out


@router.get("", response_model=List[schemas.DefectOut])
def list_defects(status: Optional[str] = None, corridor_id: Optional[str] = None,
                  db: Session = Depends(get_db), _=Depends(get_current_user)):
    q = db.query(models.Defect)
    if status:
        q = q.filter(models.Defect.status == status)
    if corridor_id:
        q = q.filter(models.Defect.corridor_id == corridor_id)
    defects = q.order_by(models.Defect.date_reported.desc()).all()
    corridor_map = {c.corridor_id: c for c in db.query(models.Corridor).all()}
    return [_to_out(d, corridor_map.get(d.corridor_id)) for d in defects]


@router.post("", response_model=schemas.DefectOut, status_code=201)
def create_defect(payload: schemas.DefectCreate, db: Session = Depends(get_db),
                   user: models.User = Depends(get_current_user)):
    corridor = db.query(models.Corridor).filter(models.Corridor.corridor_id == payload.corridor_id).first()
    if not corridor:
        raise HTTPException(status_code=404, detail=f"Unknown corridor_id: {payload.corridor_id}")

    defect = models.Defect(**payload.model_dump(), reported_by=user.id)
    db.add(defect)
    db.commit()
    db.refresh(defect)
    return _to_out(defect, corridor)


@router.get("/{task_id}", response_model=schemas.DefectOut)
def get_defect(task_id: int, db: Session = Depends(get_db), _=Depends(get_current_user)):
    defect = db.query(models.Defect).filter(models.Defect.task_id == task_id).first()
    if not defect:
        raise HTTPException(status_code=404, detail="Defect not found")
    corridor = db.query(models.Corridor).filter(models.Corridor.corridor_id == defect.corridor_id).first()
    return _to_out(defect, corridor)
