import datetime as dt
from typing import List
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from .. import models, schemas
from ..database import get_db
from ..auth import get_current_user, require_roles

router = APIRouter(prefix="/api/block-requests", tags=["block-requests"])


@router.get("", response_model=List[schemas.BlockRequestOut])
def list_requests(db: Session = Depends(get_db), _=Depends(get_current_user)):
    return db.query(models.BlockRequest).order_by(models.BlockRequest.created_at.desc()).all()


@router.get("/{req_id}", response_model=schemas.BlockRequestOut)
def get_request(req_id: int, db: Session = Depends(get_db), _=Depends(get_current_user)):
    """Fetch a single block request so requesting departments can track approval status and rejection reasons."""
    req = db.query(models.BlockRequest).filter(models.BlockRequest.id == req_id).first()
    if not req:
        raise HTTPException(status_code=404, detail="Block request not found")
    return req


@router.post("", response_model=schemas.BlockRequestOut, status_code=201)
def create_request(payload: schemas.BlockRequestCreate, db: Session = Depends(get_db),
                    _=Depends(get_current_user)):
    corridor = db.query(models.Corridor).filter(models.Corridor.corridor_id == payload.corridor_id).first()
    if not corridor:
        raise HTTPException(status_code=404, detail=f"Unknown corridor_id: {payload.corridor_id}")
    req = models.BlockRequest(**payload.model_dump())
    db.add(req)
    db.commit()
    db.refresh(req)
    return req


@router.patch("/{req_id}/approve", response_model=schemas.BlockRequestOut)
def approve_request(req_id: int, db: Session = Depends(get_db),
                     user: models.User = Depends(require_roles(models.UserRole.ADMIN))):
    """Approve a block demand and issue an official, tamper-evident possession number (PN-YYYY-XXXX)."""
    req = db.query(models.BlockRequest).filter(models.BlockRequest.id == req_id).first()
    if not req:
        raise HTTPException(status_code=404, detail="Block request not found")

    year = dt.datetime.utcnow().year
    existing_pns = db.query(models.BlockRequest.possession_number).filter(
        models.BlockRequest.possession_number.like(f"PN-{year}-%")
    ).all()
    max_seq = 0
    for (pn_val,) in existing_pns:
        if pn_val:
            try:
                seq = int(pn_val.split("-")[-1])
                if seq > max_seq:
                    max_seq = seq
            except (ValueError, IndexError):
                pass
    possession_number = f"PN-{year}-{max_seq + 1:04d}"

    req.status = models.BlockStatus.APPROVED
    req.possession_number = possession_number
    db.add(models.AuditLog(
        user_id=user.id,
        action="approve_block_request",
        entity="block_requests",
        entity_id=str(req_id),
        details=f"Approved with possession number {possession_number}",
    ))
    db.commit()
    db.refresh(req)
    return req


@router.patch("/{req_id}/reject", response_model=schemas.BlockRequestOut)
def reject_request(req_id: int, payload: schemas.BlockRequestReject, db: Session = Depends(get_db),
                    user: models.User = Depends(require_roles(models.UserRole.ADMIN))):
    """Reject a block request and record a mandatory explanation reason for the requesting department."""
    req = db.query(models.BlockRequest).filter(models.BlockRequest.id == req_id).first()
    if not req:
        raise HTTPException(status_code=404, detail="Block request not found")

    req.status = models.BlockStatus.REJECTED
    req.reason = payload.reason
    db.add(models.AuditLog(
        user_id=user.id,
        action="reject_block_request",
        entity="block_requests",
        entity_id=str(req_id),
        details=f"Rejected with reason: {payload.reason}",
    ))
    db.commit()
    db.refresh(req)
    return req

