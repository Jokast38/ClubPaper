"""Integration tests for Partie B: notes, call logging, callback queue."""
import uuid
import pytest
import pytest_asyncio
from fastapi import HTTPException

from deps import serialize
from models import Lead, User
from routers.admin import (
    create_lead_activity, update_lead_activity, delete_lead_activity,
    list_lead_activities, list_callbacks,
)
from models import LeadActivityCreate


def _tag():
    return f"TEST_{uuid.uuid4().hex[:8]}"


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
async def test_create_note_assigns_lead_and_appears_in_feed(db, lead, employee_a):
    activity = await create_lead_activity(
        lead["id"], LeadActivityCreate(type="note", note_type="appel", text="premier contact"), user=employee_a,
    )
    assert activity["type"] == "note"
    updated_lead = await db.leads.find_one({"id": lead["id"]}, {"_id": 0})
    assert updated_lead["assigned_to_user_id"] == employee_a["id"]
    feed = await list_lead_activities(lead["id"], user=employee_a)
    assert any(a["id"] == activity["id"] for a in feed)


@pytest.mark.asyncio
async def test_call_outcome_callback_sets_callback_at(db, lead, employee_a):
    from datetime import datetime, timezone, timedelta
    when = datetime.now(timezone.utc) + timedelta(days=1)
    activity = await create_lead_activity(
        lead["id"], LeadActivityCreate(type="call", call_outcome="callback", callback_at=when), user=employee_a,
    )
    assert activity["call_outcome"] == "callback"
    updated_lead = await db.leads.find_one({"id": lead["id"]}, {"_id": 0})
    assert updated_lead["callback_at"] is not None


@pytest.mark.asyncio
async def test_call_outcome_callback_requires_callback_at(db, lead, employee_a):
    with pytest.raises(HTTPException) as exc:
        await create_lead_activity(lead["id"], LeadActivityCreate(type="call", call_outcome="callback"), user=employee_a)
    assert exc.value.status_code == 400


@pytest.mark.asyncio
async def test_call_outcome_non_callback_clears_callback_at(db, lead, employee_a):
    from datetime import datetime, timezone, timedelta
    when = datetime.now(timezone.utc) + timedelta(days=1)
    await create_lead_activity(lead["id"], LeadActivityCreate(type="call", call_outcome="callback", callback_at=when), user=employee_a)
    await create_lead_activity(lead["id"], LeadActivityCreate(type="call", call_outcome="reached"), user=employee_a)
    updated_lead = await db.leads.find_one({"id": lead["id"]}, {"_id": 0})
    assert updated_lead["callback_at"] is None


@pytest.mark.asyncio
async def test_invalid_call_outcome_rejected(db, lead, employee_a):
    with pytest.raises(HTTPException) as exc:
        await create_lead_activity(lead["id"], LeadActivityCreate(type="call", call_outcome="n'importe quoi"), user=employee_a)
    assert exc.value.status_code == 400


@pytest.mark.asyncio
async def test_note_editable_only_by_author_or_admin(db, lead, employee_a, employee_b):
    activity = await create_lead_activity(lead["id"], LeadActivityCreate(type="note", text="note A"), user=employee_a)
    with pytest.raises(HTTPException) as exc:
        await update_lead_activity(lead["id"], activity["id"], {"text": "hack"}, user=employee_b)
    assert exc.value.status_code == 403
    result = await update_lead_activity(lead["id"], activity["id"], {"text": "corrigée"}, user=employee_a)
    assert result["text"] == "corrigée"


@pytest.mark.asyncio
async def test_note_deletable_only_by_author_or_admin(db, lead, employee_a, employee_b):
    activity = await create_lead_activity(lead["id"], LeadActivityCreate(type="note", text="note A"), user=employee_a)
    with pytest.raises(HTTPException) as exc:
        await delete_lead_activity(lead["id"], activity["id"], user=employee_b)
    assert exc.value.status_code == 403
    result = await delete_lead_activity(lead["id"], activity["id"], user=employee_a)
    assert result["ok"] is True


@pytest.mark.asyncio
async def test_status_change_activity_cannot_be_edited(db, lead, employee_a):
    # update_lead (from Partie A) logs a status_change activity — not editable like a note.
    from routers.admin import update_lead
    await update_lead(lead["id"], {"status": "a_appeler"}, user=employee_a)
    activity = await db.lead_activities.find_one({"lead_id": lead["id"], "type": "status_change"}, {"_id": 0})
    with pytest.raises(HTTPException) as exc:
        await update_lead_activity(lead["id"], activity["id"], {"text": "x"}, user=employee_a)
    assert exc.value.status_code == 400


@pytest.mark.asyncio
async def test_callback_queue_splits_overdue_and_today(db, lead, employee_a):
    from datetime import datetime, timezone, timedelta
    past = datetime.now(timezone.utc) - timedelta(hours=2)
    await create_lead_activity(lead["id"], LeadActivityCreate(type="call", call_outcome="callback", callback_at=past), user=employee_a)
    result = await list_callbacks(user=employee_a)
    assert any(l["id"] == lead["id"] for l in result["overdue"])
    assert not any(l["id"] == lead["id"] for l in result["today"])


@pytest.mark.asyncio
async def test_do_not_call_lead_excluded_from_callback_queue(db, lead, employee_a):
    from datetime import datetime, timezone, timedelta
    past = datetime.now(timezone.utc) - timedelta(hours=2)
    await create_lead_activity(lead["id"], LeadActivityCreate(type="call", call_outcome="callback", callback_at=past), user=employee_a)
    await db.leads.update_one({"id": lead["id"]}, {"$set": {"do_not_call": True}})
    result = await list_callbacks(user=employee_a)
    assert not any(l["id"] == lead["id"] for l in result["overdue"] + result["today"])
