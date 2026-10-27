"""Integration tests against the real DB (direct router-function calls,
bypassing HTTP, same pattern used throughout this project) — every test
cleans up what it creates."""
import uuid
import pytest
import pytest_asyncio
from fastapi import HTTPException

from deps import serialize
from models import Lead, User
from routers.admin import update_lead, send_lead_campaign, _assert_can_touch_lead


def _tag():
    return f"TEST_{uuid.uuid4().hex[:8]}"


@pytest_asyncio.fixture
async def admin_user(db):
    user = User(email=f"{_tag()}@test.example", name="Admin Test", is_platform_admin=True)
    await db.users.insert_one(serialize(user))
    yield user.model_dump()
    await db.users.delete_one({"id": user.id})


@pytest_asyncio.fixture
async def employee_a(db):
    user = User(email=f"{_tag()}@test.example", name="Employee A", is_sales_employee=True)
    await db.users.insert_one(serialize(user))
    yield user.model_dump()
    await db.users.delete_one({"id": user.id})


@pytest_asyncio.fixture
async def employee_b(db):
    user = User(email=f"{_tag()}@test.example", name="Employee B", is_sales_employee=True)
    await db.users.insert_one(serialize(user))
    yield user.model_dump()
    await db.users.delete_one({"id": user.id})


@pytest_asyncio.fixture
async def lead(db):
    l = Lead(name=_tag(), city="Lyon", email=f"{_tag()}@test.example")
    await db.leads.insert_one(serialize(l))
    yield l.model_dump()
    await db.leads.delete_one({"id": l.id})
    await db.lead_activities.delete_many({"lead_id": l.id})


@pytest.mark.asyncio
async def test_status_change_to_refus_requires_reason(db, lead, employee_a):
    with pytest.raises(HTTPException) as exc:
        await update_lead(lead["id"], {"status": "refus"}, user=employee_a)
    assert exc.value.status_code == 400


@pytest.mark.asyncio
async def test_status_change_to_refus_with_valid_reason_succeeds(db, lead, employee_a):
    result = await update_lead(lead["id"], {"status": "refus", "rejection_reason": "pas_interesse"}, user=employee_a)
    assert result["status"] == "refus"
    activity = await db.lead_activities.find_one({"lead_id": lead["id"], "type": "status_change"})
    assert activity["to_status"] == "refus"
    assert activity["author_id"] == employee_a["id"]


@pytest.mark.asyncio
async def test_status_change_to_refus_rejects_invalid_reason(db, lead, employee_a):
    with pytest.raises(HTTPException) as exc:
        await update_lead(lead["id"], {"status": "refus", "rejection_reason": "n'importe quoi"}, user=employee_a)
    assert exc.value.status_code == 400


@pytest.mark.asyncio
async def test_touching_a_lead_assigns_it_to_the_employee(db, lead, employee_a):
    result = await update_lead(lead["id"], {"notes": "premier contact"}, user=employee_a)
    assert result["assigned_to_user_id"] == employee_a["id"]


@pytest.mark.asyncio
async def test_employee_cannot_touch_a_lead_assigned_to_someone_else(db, lead, employee_a, employee_b):
    await update_lead(lead["id"], {"notes": "pris par A"}, user=employee_a)
    with pytest.raises(HTTPException) as exc:
        await update_lead(lead["id"], {"notes": "B essaie"}, user=employee_b)
    assert exc.value.status_code == 403


@pytest.mark.asyncio
async def test_platform_admin_can_touch_any_lead(db, lead, employee_a, admin_user):
    await update_lead(lead["id"], {"notes": "pris par A"}, user=employee_a)
    result = await update_lead(lead["id"], {"notes": "admin corrige"}, user=admin_user)
    assert result["notes"] == "admin corrige"


@pytest.mark.asyncio
async def test_qualification_fields_recompute_priority_score(db, lead, employee_a):
    result = await update_lead(
        lead["id"],
        {"interest_level": "chaud", "buying_horizon": "maintenant", "decision_maker_role": "president"},
        user=employee_a,
    )
    assert result["priority_score"] == 25 + 20 + 15


@pytest.mark.asyncio
async def test_do_not_call_lead_is_skipped_by_campaign_send(db, lead, admin_user):
    await db.leads.update_one({"id": lead["id"]}, {"$set": {"do_not_call": True}})
    result = await send_lead_campaign({"lead_ids": [lead["id"]]}, user=admin_user)
    assert result["skipped_do_not_call"] == 1
    assert result["sent"] == 0
    updated = await db.leads.find_one({"id": lead["id"]}, {"_id": 0})
    assert updated.get("campaign_sent_at") is None
