import datetime as dt
from sqlalchemy.orm import Session
from . import models
from .auth import hash_password


CORRIDORS = [
    ("COR-01", "Mumbai-Pune Ghat Section", "Pune", "CR", True, 210),
    ("COR-02", "Delhi-Agra Corridor", "Delhi", "NR", True, 180),
    ("COR-03", "Chennai-Bengaluru Section", "Chennai", "SR", False, 95),
    ("COR-04", "Howrah-Kharagpur Section", "Kharagpur", "SER", True, 140),
    ("COR-05", "Guwahati-Lumding Hill Section", "Lumding", "NFR", False, 40),
]

USERS = [
    ("tms_engineer", "Rahul Verma", models.Department.TMS, models.UserRole.ENGINEER),
    ("smms_engineer", "Anita Rao", models.Department.SMMS, models.UserRole.ENGINEER),
    ("tdms_engineer", "Suresh Iyer", models.Department.TDMS, models.UserRole.ENGINEER),
    ("coa_planner", "Meera Nair", models.Department.COA, models.UserRole.VIEWER),
    ("bdms_officer", "Vikram Singh", models.Department.BDMS, models.UserRole.ENGINEER),
    ("controller", "Section Controller", models.Department.CONTROL, models.UserRole.ADMIN),
]

DEFAULT_PASSWORD = "railsync123"


def seed(db: Session):
    for cid, name, division, zone, hd, trains in CORRIDORS:
        existing_corridor = db.query(models.Corridor).filter(models.Corridor.corridor_id == cid).first()
        if not existing_corridor:
            db.add(models.Corridor(
                corridor_id=cid, name=name, division=division, zone=zone,
                is_high_density=hd, avg_daily_trains=trains,
            ))
    db.commit()

    for username, full_name, dept, role in USERS:
        user = db.query(models.User).filter(models.User.username == username).first()
        if not user:
            db.add(models.User(
                username=username, hashed_password=hash_password(DEFAULT_PASSWORD),
                full_name=full_name, department=dept, role=role,
            ))
        else:
            user.hashed_password = hash_password(DEFAULT_PASSWORD)
            user.role = role
            user.department = dept
    db.commit()

    if db.query(models.TimetableSlot).count() == 0:
        for cid in ["COR-01", "COR-02"]:
            for dow in range(7):
                db.add(models.TimetableSlot(corridor_id=cid, day_of_week=dow,
                                             start_time="06:00", end_time="11:00",
                                             train_count=18, is_peak=True))
                db.add(models.TimetableSlot(corridor_id=cid, day_of_week=dow,
                                             start_time="17:00", end_time="22:00",
                                             train_count=20, is_peak=True))
        for cid in ["COR-03", "COR-04"]:
            for dow in range(7):
                db.add(models.TimetableSlot(corridor_id=cid, day_of_week=dow,
                                             start_time="07:00", end_time="10:00",
                                             train_count=10, is_peak=True))
        db.commit()

    if db.query(models.Defect).count() == 0:
        today = dt.date.today()
        demo_defects = [
            (models.Department.TMS, "TRK-4471", "COR-01", "Rail fracture", 5, 6, 8, 3, 3),
            (models.Department.SMMS, "SIG-2210", "COR-01", "Signal relay fault", 4, 3, 5, 2, 4),
            (models.Department.TDMS, "OHE-1187", "COR-02", "OHE wire sag", 3, 1, 10, 0, 2),
            (models.Department.TMS, "TRK-5502", "COR-02", "Ballast degradation", 2, 0, 15, 1, 5),
            (models.Department.SMMS, "SIG-3391", "COR-03", "Point machine wear", 4, 8, 4, 1, 2),
            (models.Department.TDMS, "OHE-2244", "COR-04", "Insulator crack", 5, 2, 3, 0, 3),
            (models.Department.TMS, "TRK-6620", "COR-04", "Rail corrugation", 3, 0, 20, 2, 4),
            (models.Department.SMMS, "SIG-4410", "COR-05", "Cable fault", 2, 4, 12, 0, 1.5),
            (models.Department.TDMS, "OHE-3301", "COR-01", "Dropper damage", 4, 5, 6, 1, 2.5),
            (models.Department.TMS, "TRK-7788", "COR-03", "Weld defect", 3, 2, 9, 0, 3),
        ]
        for dept, asset, corridor, dtype, severity, days_ago, due_in, recurrence, dur in demo_defects:
            reported = today - dt.timedelta(days=days_ago)
            due = today + dt.timedelta(days=due_in) if due_in >= 0 else today - dt.timedelta(days=abs(due_in))
            db.add(models.Defect(
                source_system=dept, asset_id=asset, corridor_id=corridor, defect_type=dtype,
                severity=severity, date_reported=reported.isoformat(), due_date=due.isoformat(),
                estimated_block_duration=dur, department=dept.value,
                recurrence_count=recurrence,
            ))
        db.commit()
