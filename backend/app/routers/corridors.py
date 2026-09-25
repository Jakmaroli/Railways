from typing import List
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from .. import models, schemas
from ..database import get_db
from ..auth import get_current_user

router = APIRouter(prefix="/api/corridors", tags=["corridors"])


@router.get("", response_model=List[schemas.CorridorOut])
def list_corridors(db: Session = Depends(get_db), _=Depends(get_current_user)):
    return db.query(models.Corridor).all()
