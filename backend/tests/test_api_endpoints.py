import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.database import Base, engine, SessionLocal
from app import models, auth

client = TestClient(app)


@pytest.fixture(scope="module", autouse=True)
def setup_db():
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    # Ensure admin controller exists
    admin = db.query(models.User).filter(models.User.username == "test_admin").first()
    if not admin:
        admin = models.User(
            username="test_admin",
            hashed_password=auth.hash_password("testpass123"),
            full_name="Test Controller",
            department=models.Department.CONTROL,
            role=models.UserRole.ADMIN,
        )
        db.add(admin)

    # Ensure corridor exists
    corridor = db.query(models.Corridor).filter(models.Corridor.corridor_id == "COR-API-01").first()
    if not corridor:
        corridor = models.Corridor(
            corridor_id="COR-API-01",
            name="API Test Corridor",
            division="TestDiv",
            zone="TestZone",
            is_high_density=True,
            avg_daily_trains=40,
        )
        db.add(corridor)

    db.commit()
    db.close()


def get_admin_token():
    res = client.post("/api/auth/login", data={"username": "test_admin", "password": "testpass123"})
    assert res.status_code == 200, res.text
    return res.json()["data"]["access_token"]


def test_login_rate_limiting():
    """Verify that excessive login attempts are blocked with HTTP 429."""
    headers = {"X-Forwarded-For": "198.51.100.42"}
    rate_user = "brute_force_target"

    # Make attempts up to the rate limit
    for _ in range(5):
        res = client.post(
            "/api/auth/login",
            data={"username": rate_user, "password": "wrongpassword"},
            headers=headers,
        )
        # Should be 401 unauthorized
        assert res.status_code == 401

    # 6th attempt should be rate limited with 429
    res_limited = client.post(
        "/api/auth/login",
        data={"username": rate_user, "password": "wrongpassword"},
        headers=headers,
    )
    assert res_limited.status_code == 429
    assert "Too many login attempts" in res_limited.text
    assert "Retry-After" in res_limited.headers
    assert "RateLimit-Limit" in res_limited.headers
    auth.login_rate_limiter.reset_all()


def test_block_request_lifecycle_pn_and_reject():
    """Verify BlockRequest approval generates PN-YYYY-XXXX and rejection populates reason."""
    token = get_admin_token()
    headers = {"Authorization": f"Bearer {token}"}

    # 1. Create a block request
    create_res = client.post(
        "/api/block-requests",
        json={
            "corridor_id": "COR-API-01",
            "department": "BDMS",
            "requested_date": "2026-10-01",
            "requested_start": "02:00",
            "requested_end": "05:00",
            "reason": "Bridge bearing inspection demand",
        },
        headers=headers,
    )
    assert create_res.status_code == 201, create_res.text
    req_data = create_res.json()["data"]
    req_id = req_data["id"]
    assert req_data["status"] == "pending"

    # 2. Get single block request (Department feedback loop)
    get_res = client.get(f"/api/block-requests/{req_id}", headers=headers)
    assert get_res.status_code == 200
    assert get_res.json()["data"]["id"] == req_id

    # 3. Approve and verify PN-XXXX generation
    approve_res = client.patch(f"/api/block-requests/{req_id}/approve", headers=headers)
    assert approve_res.status_code == 200, approve_res.text
    approved_data = approve_res.json()["data"]
    assert approved_data["status"] == "approved"
    assert approved_data["possession_number"] is not None
    assert approved_data["possession_number"].startswith("PN-")

    # 4. Create another request to test rejection
    create_res2 = client.post(
        "/api/block-requests",
        json={
            "corridor_id": "COR-API-01",
            "department": "TMS",
            "requested_date": "2026-10-02",
            "requested_start": "10:00",
            "requested_end": "14:00",
            "reason": "Track renewal during peak",
        },
        headers=headers,
    )
    req2_id = create_res2.json()["data"]["id"]

    # Reject with specific reason
    reject_res = client.patch(
        f"/api/block-requests/{req2_id}/reject",
        json={"reason": "Clashes with scheduled Vande Bharat express window"},
        headers=headers,
    )
    assert reject_res.status_code == 200
    rejected_data = reject_res.json()["data"]
    assert rejected_data["status"] == "rejected"
    assert "Clashes with scheduled Vande Bharat" in rejected_data["reason"]


def test_timetable_import_json_and_csv():
    """Verify live COA timetable ingestion endpoint supporting both JSON and CSV with specific_date."""
    token = get_admin_token()
    headers = {"Authorization": f"Bearer {token}"}

    # JSON import
    json_payload = [
        {
            "corridor_id": "COR-API-01",
            "day_of_week": 2,
            "specific_date": "2026-10-14",
            "start_time": "11:00",
            "end_time": "13:00",
            "train_count": 2,
            "is_peak": False,
        }
    ]
    res_json = client.post("/api/timetable/import", json=json_payload, headers=headers)
    assert res_json.status_code == 200, res_json.text
    assert res_json.json()["data"]["imported_count"] == 1

    # CSV import
    csv_data = "corridor_id,day_of_week,specific_date,start_time,end_time,train_count,is_peak\nCOR-API-01,3,2026-10-15,16:00,18:30,1,False"
    res_csv = client.post(
        "/api/timetable/import",
        content=csv_data,
        headers={**headers, "Content-Type": "text/csv"},
    )
    assert res_csv.status_code == 200, res_csv.text
    assert res_csv.json()["data"]["imported_count"] == 1
