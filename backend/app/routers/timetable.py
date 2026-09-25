import io
import datetime as dt
from typing import List, Optional
import pandas as pd
from pydantic import BaseModel
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from .. import models
from ..database import get_db
from ..auth import get_current_user

router = APIRouter(prefix="/api/timetable", tags=["timetable"])


class TimetableSlotOut(BaseModel):
    id: Optional[int] = None
    corridor_id: str
    day_of_week: int
    specific_date: Optional[str] = None
    start_time: str
    end_time: str
    train_count: int
    is_peak: bool

    class Config:
        from_attributes = True


@router.get("", response_model=List[TimetableSlotOut])
def list_timetable(db: Session = Depends(get_db), _=Depends(get_current_user)):
    return db.query(models.TimetableSlot).all()


@router.post("/import")
async def import_timetable(
    request: Request,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    """Simulate ingesting a live COA train movement feed via CSV or JSON.

    Supports date-specific movements ('specific_date') which dynamically override
    the recurring weekly timetable template for dynamic block scheduling.
    """
    content_type = request.headers.get("content-type", "").lower()
    items = []

    try:
        if "multipart/form-data" in content_type:
            form = await request.form()
            file = form.get("file")
            if file and hasattr(file, "read"):
                raw_bytes = await file.read()
                raw_text = raw_bytes.decode("utf-8")
                df = pd.read_csv(io.StringIO(raw_text))
                items = df.where(pd.notnull(df), None).to_dict(orient="records")
            else:
                raise HTTPException(status_code=400, detail="No file attached to form data")
        elif "application/json" in content_type:
            payload = await request.json()
            if isinstance(payload, list):
                items = payload
            elif isinstance(payload, dict) and "slots" in payload:
                items = payload["slots"]
            else:
                items = [payload]
        else:
            # Fallback text or raw CSV
            body_bytes = await request.body()
            body_text = body_bytes.decode("utf-8").strip()
            if body_text.startswith("{") or body_text.startswith("["):
                import json
                parsed = json.loads(body_text)
                items = parsed if isinstance(parsed, list) else parsed.get("slots", [parsed])
            else:
                df = pd.read_csv(io.StringIO(body_text))
                items = df.where(pd.notnull(df), None).to_dict(orient="records")
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Failed to parse timetable feed: {exc}")

    if not items:
        raise HTTPException(status_code=400, detail="Empty timetable feed received")

    created = []
    for item in items:
        corridor_id = str(item.get("corridor_id", "")).strip()
        corridor = db.query(models.Corridor).filter(models.Corridor.corridor_id == corridor_id).first()
        if not corridor:
            raise HTTPException(status_code=404, detail=f"Corridor '{corridor_id}' does not exist")

        specific_date = item.get("specific_date")
        if specific_date is not None:
            specific_date = str(specific_date).strip()[:10]
            if not specific_date or specific_date.lower() in ("nan", "none", "null"):
                specific_date = None

        day_of_week = item.get("day_of_week")
        if (day_of_week is None or pd.isna(day_of_week)) and specific_date:
            try:
                day_of_week = dt.datetime.strptime(specific_date, "%Y-%m-%d").weekday()
            except ValueError:
                day_of_week = 0
        else:
            day_of_week = int(day_of_week) if day_of_week is not None else 0

        slot = models.TimetableSlot(
            corridor_id=corridor_id,
            day_of_week=day_of_week,
            specific_date=specific_date,
            start_time=str(item.get("start_time", "08:00")).strip(),
            end_time=str(item.get("end_time", "10:00")).strip(),
            train_count=int(item.get("train_count") or 1),
            is_peak=bool(item.get("is_peak", False)),
        )
        db.add(slot)
        created.append(slot)

    db.add(models.AuditLog(
        user_id=user.id,
        action="import_timetable",
        entity="timetable_slots",
        details=f"Imported {len(created)} COA train movement slots",
    ))
    db.commit()
    for s in created:
        db.refresh(s)

    return {
        "imported_count": len(created),
        "slots": [TimetableSlotOut.model_validate(s) for s in created],
    }

