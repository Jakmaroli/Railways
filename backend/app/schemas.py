from pydantic import BaseModel, Field
from typing import Optional, List
from .models import Department, UserRole, DefectStatus, BlockStatus


# ---- Auth ----
class UserCreate(BaseModel):
    username: str
    password: str
    full_name: str
    department: Department
    role: UserRole = UserRole.ENGINEER


class UserOut(BaseModel):
    id: int
    username: str
    full_name: str
    department: Department
    role: UserRole

    class Config:
        from_attributes = True


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


# ---- Corridors ----
class CorridorOut(BaseModel):
    corridor_id: str
    name: str
    division: str
    zone: str
    is_high_density: bool
    avg_daily_trains: int

    class Config:
        from_attributes = True


# ---- Defects ----
class DefectCreate(BaseModel):
    source_system: Department
    asset_id: str
    corridor_id: str
    defect_type: str
    severity: int = Field(ge=1, le=5)
    date_reported: str
    due_date: str
    estimated_block_duration: float
    department: str
    location_marker: Optional[str] = ""
    recurrence_count: int = 0


class DefectOut(BaseModel):
    task_id: int
    source_system: Department
    asset_id: str
    corridor_id: str
    defect_type: str
    severity: int
    date_reported: str
    due_date: str
    estimated_block_duration: float
    department: str
    location_marker: str
    recurrence_count: int
    status: DefectStatus
    priority_score: Optional[float] = None
    health_score: Optional[float] = None

    class Config:
        from_attributes = True


# ---- Block requests ----
class BlockRequestCreate(BaseModel):
    defect_id: Optional[int] = None
    corridor_id: str
    department: Department
    requested_date: str
    requested_start: str
    requested_end: str
    reason: Optional[str] = ""


class BlockRequestReject(BaseModel):
    reason: str


class BlockRequestOut(BaseModel):
    id: int
    defect_id: Optional[int]
    corridor_id: str
    department: Department
    requested_date: str
    requested_start: str
    requested_end: str
    reason: str
    status: BlockStatus
    possession_number: Optional[str] = None

    class Config:
        from_attributes = True


# ---- Schedule ----
class ScheduleBlockOut(BaseModel):
    id: int
    task_id: Optional[int]
    corridor_id: str
    date: str
    slot_start: str
    slot_end: str
    priority_score: float
    merged_with: Optional[str]
    explanation_text: str
    status: str
    actual_duration: Optional[float]
    possession_number: Optional[str] = None

    class Config:
        from_attributes = True


class CompleteBlockIn(BaseModel):
    actual_duration: float


class WhatIfIn(BaseModel):
    override_defect: Optional[dict] = None
    defects: Optional[List[dict]] = None
    corridors: Optional[List[dict]] = None


# ---- Dashboard ----
class KpiSummary(BaseModel):
    open_defects: int
    overdue_defects: int
    scheduled_blocks: int
    avg_priority_score: float
    high_density_corridors_at_risk: int
    punctuality_protection_pct: float
