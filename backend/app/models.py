import enum
import datetime as dt
from sqlalchemy import (
    Column, Integer, String, Float, Boolean, ForeignKey, DateTime, Text, Enum, Index
)
from sqlalchemy.orm import relationship
from .database import Base


class Department(str, enum.Enum):
    TMS = "TMS"        # Track Management System
    SMMS = "SMMS"      # Signal & Maintenance Mgmt System
    TDMS = "TDMS"      # Traction Distribution Mgmt System
    COA = "COA"        # Control Office Application (timetable authority)
    BDMS = "BDMS"      # Block Demand Mgmt System
    CONTROL = "CONTROL"  # Section controller / admin


class UserRole(str, enum.Enum):
    ADMIN = "admin"          # Section controller — sees everything, approves final plan
    ENGINEER = "engineer"    # Department engineer — raises defects/block demands
    VIEWER = "viewer"        # Read-only (e.g. COA timetable planner)


class DefectStatus(str, enum.Enum):
    OPEN = "open"
    SCHEDULED = "scheduled"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    OVERRUN = "overrun"


class BlockStatus(str, enum.Enum):
    PENDING = "pending"
    APPROVED = "approved"
    MERGED = "merged"
    REJECTED = "rejected"


class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True)
    username = Column(String, unique=True, index=True, nullable=False)
    hashed_password = Column(String, nullable=False)
    full_name = Column(String, nullable=False)
    department = Column(Enum(Department), nullable=False)
    role = Column(Enum(UserRole), nullable=False, default=UserRole.ENGINEER)
    created_at = Column(DateTime, default=dt.datetime.utcnow)


class Corridor(Base):
    __tablename__ = "corridors"
    corridor_id = Column(String, primary_key=True)
    name = Column(String, nullable=False)
    division = Column(String, nullable=False)
    zone = Column(String, nullable=False)
    is_high_density = Column(Boolean, default=False)
    avg_daily_trains = Column(Integer, default=0)

    defects = relationship("Defect", back_populates="corridor")
    timetable_slots = relationship("TimetableSlot", back_populates="corridor")


class TimetableSlot(Base):
    """A COA-sourced train movement window on a corridor — the scheduler must avoid these."""
    __tablename__ = "timetable_slots"
    __table_args__ = (
        # The scheduler's hot lookup is "free windows for this corridor on this weekday" —
        # a composite index lets that resolve without a table scan as timetable data grows.
        Index("ix_timetable_corridor_day", "corridor_id", "day_of_week"),
        Index("ix_timetable_corridor_date", "corridor_id", "specific_date"),
    )
    id = Column(Integer, primary_key=True)
    corridor_id = Column(String, ForeignKey("corridors.corridor_id"), nullable=False, index=True)
    day_of_week = Column(Integer, nullable=False)  # 0=Mon ... 6=Sun
    specific_date = Column(String, nullable=True, index=True)  # "YYYY-MM-DD" overrides weekly pattern
    start_time = Column(String, nullable=False)    # "HH:MM"
    end_time = Column(String, nullable=False)
    train_count = Column(Integer, default=1)
    is_peak = Column(Boolean, default=False)

    corridor = relationship("Corridor", back_populates="timetable_slots")


class Defect(Base):
    """Unified record — originates from TMS, SMMS, or TDMS but stored in one shared table."""
    __tablename__ = "defects"
    task_id = Column(Integer, primary_key=True)
    source_system = Column(Enum(Department), nullable=False)
    asset_id = Column(String, nullable=False)
    corridor_id = Column(String, ForeignKey("corridors.corridor_id"), nullable=False, index=True)
    defect_type = Column(String, nullable=False)
    severity = Column(Integer, nullable=False)  # 1-5
    date_reported = Column(String, nullable=False)
    due_date = Column(String, nullable=False, index=True)
    estimated_block_duration = Column(Float, nullable=False)  # hours
    department = Column(String, nullable=False)
    location_marker = Column(String, default="")
    recurrence_count = Column(Integer, default=0)
    # Filtered on nearly every list/schedule query (open vs scheduled vs completed) —
    # by far the hottest column in this table, so it gets its own index.
    status = Column(Enum(DefectStatus), default=DefectStatus.OPEN, index=True)
    reported_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime, default=dt.datetime.utcnow)

    corridor = relationship("Corridor", back_populates="defects")


class BlockRequest(Base):
    """A BDMS block demand — may or may not be tied to a specific defect."""
    __tablename__ = "block_requests"
    id = Column(Integer, primary_key=True)
    defect_id = Column(Integer, ForeignKey("defects.task_id"), nullable=True)
    corridor_id = Column(String, ForeignKey("corridors.corridor_id"), nullable=False, index=True)
    department = Column(Enum(Department), nullable=False)
    requested_date = Column(String, nullable=False)
    requested_start = Column(String, nullable=False)
    requested_end = Column(String, nullable=False)
    reason = Column(Text, default="")
    status = Column(Enum(BlockStatus), default=BlockStatus.PENDING, index=True)
    possession_number = Column(String, nullable=True, index=True)  # PN-{year}-{sequence} issued upon approval
    created_at = Column(DateTime, default=dt.datetime.utcnow)


class ScheduleBlock(Base):
    """AI-generated / approved output — the single unified plan replacing per-dept silos."""
    __tablename__ = "schedule_blocks"
    id = Column(Integer, primary_key=True)
    task_id = Column(Integer, ForeignKey("defects.task_id"), nullable=True)
    corridor_id = Column(String, ForeignKey("corridors.corridor_id"), nullable=False, index=True)
    # list_schedule() orders by (date, slot_start) and the possession chart filters by date —
    # this is the single most frequently hit read pattern in the app.
    date = Column(String, nullable=False, index=True)
    slot_start = Column(String, nullable=False)
    slot_end = Column(String, nullable=False)
    priority_score = Column(Float, default=5.0)
    merged_with = Column(String, nullable=True)  # comma-separated task_ids merged into this slot
    explanation_text = Column(Text, default="")
    status = Column(String, default="planned", index=True)  # dashboard counts by status
    actual_duration = Column(Float, nullable=True)
    possession_number = Column(String, nullable=True, index=True)  # PN-{year}-{sequence} safety tracking number



class AuditLog(Base):
    __tablename__ = "audit_log"
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    action = Column(String, nullable=False)
    entity = Column(String, nullable=False)
    entity_id = Column(String, nullable=True)
    details = Column(Text, default="")
    timestamp = Column(DateTime, default=dt.datetime.utcnow)
