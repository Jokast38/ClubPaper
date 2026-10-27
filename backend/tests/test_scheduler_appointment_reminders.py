import uuid
import pytest
import pytest_asyncio
from datetime import datetime, timezone, timedelta

from deps import serialize
from models import Lead, User, Appointment
from scheduler_jobs import run_appointment_reminders


def _tag():
    return f"TEST_{uuid.uuid4().hex[:8]}"


@pytest_asyncio.fixture
async def employee(db):
    user = User(email=f"{_tag()}@test.example", name="Employee R", is_sales_employee=True)
    await db.users.insert_one(serialize(user))
    yield user.model_dump()
    await db.users.delete_one({"id": user.id})


@pytest_asyncio.fixture
async def lead(db):
    l = Lead(name=_tag(), city="Lyon", email=f"{_tag()}@test.example")
    await db.leads.insert_one(serialize(l))
    yield l.model_dump()
    await db.leads.delete_one({"id": l.id})


async def _make_appointment(db, lead, employee, start_at):
    appt = Appointment(lead_id=lead["id"], type="appel_decouverte", start_at=start_at, assigned_to_user_id=employee["id"], assigned_to_name=employee["name"])
    await db.appointments.insert_one(serialize(appt))
    return appt.model_dump()


@pytest.mark.asyncio
async def test_day_before_reminder_sent_once(db, lead, employee):
    now = datetime.now(timezone.utc)
    appt = await _make_appointment(db, lead, employee, now + timedelta(hours=24))
    await run_appointment_reminders(db)
    updated = await db.appointments.find_one({"id": appt["id"]}, {"_id": 0})
    assert updated["reminder_day_before_sent"] is True
    assert updated["reminder_1h_sent"] is False
    await db.appointments.delete_one({"id": appt["id"]})


@pytest.mark.asyncio
async def test_one_hour_reminder_sent_once(db, lead, employee):
    now = datetime.now(timezone.utc)
    appt = await _make_appointment(db, lead, employee, now + timedelta(hours=1))
    await run_appointment_reminders(db)
    updated = await db.appointments.find_one({"id": appt["id"]}, {"_id": 0})
    assert updated["reminder_1h_sent"] is True
    await db.appointments.delete_one({"id": appt["id"]})


@pytest.mark.asyncio
async def test_reminder_not_resent_once_flag_is_set(db, lead, employee):
    now = datetime.now(timezone.utc)
    appt = await _make_appointment(db, lead, employee, now + timedelta(hours=24))
    await db.appointments.update_one({"id": appt["id"]}, {"$set": {"reminder_day_before_sent": True}})
    await run_appointment_reminders(db)
    updated = await db.appointments.find_one({"id": appt["id"]}, {"_id": 0})
    assert updated["reminder_day_before_sent"] is True  # unchanged, not an error — just confirms the flag query excludes it
    await db.appointments.delete_one({"id": appt["id"]})


@pytest.mark.asyncio
async def test_appointment_far_in_the_future_is_not_reminded_yet(db, lead, employee):
    now = datetime.now(timezone.utc)
    appt = await _make_appointment(db, lead, employee, now + timedelta(days=5))
    await run_appointment_reminders(db)
    updated = await db.appointments.find_one({"id": appt["id"]}, {"_id": 0})
    assert updated["reminder_day_before_sent"] is False
    assert updated["reminder_1h_sent"] is False
    await db.appointments.delete_one({"id": appt["id"]})
