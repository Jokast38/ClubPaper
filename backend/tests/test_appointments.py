"""Integration tests for Partie C: appointment CRUD, double-booking guard,
permissions, and the public (no-login) booking flow."""
import uuid
import pytest
import pytest_asyncio
from datetime import datetime, timezone, timedelta
from fastapi import HTTPException

from deps import serialize
from models import Lead, User, AppointmentCreate, BookingLink
from routers.appointments import create_appointment, update_appointment, cancel_appointment, get_appointment
from routers.public import get_booking_options, book_appointment


def _tag():
    return f"TEST_{uuid.uuid4().hex[:8]}"


def _next_monday_9am():
    now = datetime.now(timezone.utc)
    days_ahead = (7 - now.weekday()) % 7 or 7
    monday = (now + timedelta(days=days_ahead)).replace(hour=9, minute=0, second=0, microsecond=0)
    return monday


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
    await db.employee_availability.insert_one({
        "id": str(uuid.uuid4()), "user_id": user.id,
        "slots": [{"type": "appel_decouverte", "weekday": 0, "start_time": "09:00", "end_time": "12:00"}],
        "updated_at": datetime.now(timezone.utc).isoformat(),
    })
    yield user.model_dump()
    await db.users.delete_one({"id": user.id})
    await db.employee_availability.delete_one({"user_id": user.id})


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
    await db.appointments.delete_many({"lead_id": l.id})


@pytest.mark.asyncio
async def test_create_appointment_transitions_lead_and_logs_activity(db, lead, employee_a):
    when = _next_monday_9am()
    appt = await create_appointment(
        AppointmentCreate(lead_id=lead["id"], type="appel_decouverte", start_at=when, assigned_to_user_id=employee_a["id"]),
        user=employee_a,
    )
    assert appt["assigned_to_user_id"] == employee_a["id"]
    updated_lead = await db.leads.find_one({"id": lead["id"]}, {"_id": 0})
    assert updated_lead["status"] == "rdv_planifie"
    activity = await db.lead_activities.find_one({"lead_id": lead["id"], "type": "appointment"}, {"_id": 0})
    assert activity is not None


@pytest.mark.asyncio
async def test_double_booking_rejected(db, lead, employee_a):
    when = _next_monday_9am()
    await create_appointment(
        AppointmentCreate(lead_id=lead["id"], type="appel_decouverte", start_at=when, assigned_to_user_id=employee_a["id"]),
        user=employee_a,
    )
    with pytest.raises(HTTPException) as exc:
        await create_appointment(
            AppointmentCreate(lead_id=lead["id"], type="appel_decouverte", start_at=when, assigned_to_user_id=employee_a["id"]),
            user=employee_a,
        )
    assert exc.value.status_code == 409


@pytest.mark.asyncio
async def test_overlapping_different_start_times_rejected(db, lead, employee_a):
    when = _next_monday_9am()
    await create_appointment(
        AppointmentCreate(lead_id=lead["id"], type="appel_decouverte", start_at=when, duration_minutes=30, assigned_to_user_id=employee_a["id"]),
        user=employee_a,
    )
    with pytest.raises(HTTPException) as exc:
        await create_appointment(
            AppointmentCreate(lead_id=lead["id"], type="appel_decouverte", start_at=when + timedelta(minutes=15), duration_minutes=30, assigned_to_user_id=employee_a["id"]),
            user=employee_a,
        )
    assert exc.value.status_code == 409


@pytest.mark.asyncio
async def test_employee_cannot_book_appointment_for_another_employee(db, lead, employee_a, employee_b):
    when = _next_monday_9am()
    with pytest.raises(HTTPException) as exc:
        await create_appointment(
            AppointmentCreate(lead_id=lead["id"], type="appel_decouverte", start_at=when, assigned_to_user_id=employee_b["id"]),
            user=employee_a,
        )
    assert exc.value.status_code == 403


@pytest.mark.asyncio
async def test_employee_cannot_view_another_employees_appointment(db, lead, employee_a, employee_b):
    when = _next_monday_9am()
    appt = await create_appointment(
        AppointmentCreate(lead_id=lead["id"], type="appel_decouverte", start_at=when, assigned_to_user_id=employee_a["id"]),
        user=employee_a,
    )
    with pytest.raises(HTTPException) as exc:
        await get_appointment(appt["id"], user=employee_b)
    assert exc.value.status_code == 403


@pytest.mark.asyncio
async def test_admin_can_view_any_appointment(db, lead, employee_a, admin_user):
    when = _next_monday_9am()
    appt = await create_appointment(
        AppointmentCreate(lead_id=lead["id"], type="appel_decouverte", start_at=when, assigned_to_user_id=employee_a["id"]),
        user=employee_a,
    )
    result = await get_appointment(appt["id"], user=admin_user)
    assert result["id"] == appt["id"]


@pytest.mark.asyncio
async def test_reschedule_rejects_new_conflicting_slot(db, lead, employee_a):
    when = _next_monday_9am()
    appt1 = await create_appointment(
        AppointmentCreate(lead_id=lead["id"], type="appel_decouverte", start_at=when, duration_minutes=30, assigned_to_user_id=employee_a["id"]),
        user=employee_a,
    )
    appt2 = await create_appointment(
        AppointmentCreate(lead_id=lead["id"], type="appel_decouverte", start_at=when + timedelta(hours=1), duration_minutes=30, assigned_to_user_id=employee_a["id"]),
        user=employee_a,
    )
    with pytest.raises(HTTPException) as exc:
        await update_appointment(appt2["id"], {"start_at": when.isoformat()}, user=employee_a)
    assert exc.value.status_code == 409
    # Moving appt2 to a free slot within the same window works.
    moved = await update_appointment(appt2["id"], {"start_at": (when + timedelta(minutes=30)).isoformat()}, user=employee_a)
    assert moved["start_at"]


@pytest.mark.asyncio
async def test_cancel_sets_status_annule(db, lead, employee_a):
    when = _next_monday_9am()
    appt = await create_appointment(
        AppointmentCreate(lead_id=lead["id"], type="appel_decouverte", start_at=when, assigned_to_user_id=employee_a["id"]),
        user=employee_a,
    )
    result = await cancel_appointment(appt["id"], user=employee_a)
    assert result["status"] == "annule"


@pytest.mark.asyncio
async def test_cancelled_appointment_frees_the_slot(db, lead, employee_a):
    when = _next_monday_9am()
    appt = await create_appointment(
        AppointmentCreate(lead_id=lead["id"], type="appel_decouverte", start_at=when, assigned_to_user_id=employee_a["id"]),
        user=employee_a,
    )
    await cancel_appointment(appt["id"], user=employee_a)
    # Same slot should now be bookable again.
    appt2 = await create_appointment(
        AppointmentCreate(lead_id=lead["id"], type="appel_decouverte", start_at=when, assigned_to_user_id=employee_a["id"]),
        user=employee_a,
    )
    assert appt2["id"] != appt["id"]


@pytest_asyncio.fixture
async def booking_link(db, lead):
    link = BookingLink(lead_id=lead["id"], appointment_type="appel_decouverte", expires_at=datetime.now(timezone.utc) + timedelta(days=7))
    await db.booking_links.insert_one(serialize(link))
    yield link.model_dump()
    await db.booking_links.delete_one({"id": link.id})


@pytest.mark.asyncio
async def test_public_booking_flow_offers_and_books_a_slot(db, lead, employee_a, booking_link):
    options = await get_booking_options(booking_link["id"])
    assert options["offers"], "expected at least one offered slot from employee_a's availability"
    chosen = options["offers"][0]
    appt = await book_appointment(booking_link["id"], {"employee_id": chosen["employee_id"], "start_at": chosen["start_at"]})
    assert appt["lead_id"] == lead["id"]
    link_after = await db.booking_links.find_one({"id": booking_link["id"]}, {"_id": 0})
    assert link_after["used_at"] is not None
    updated_lead = await db.leads.find_one({"id": lead["id"]}, {"_id": 0})
    assert updated_lead["status"] == "rdv_planifie"
    await db.appointments.delete_one({"id": appt["id"]})


@pytest.mark.asyncio
async def test_public_booking_link_is_single_use(db, lead, employee_a, booking_link):
    options = await get_booking_options(booking_link["id"])
    chosen = options["offers"][0]
    appt = await book_appointment(booking_link["id"], {"employee_id": chosen["employee_id"], "start_at": chosen["start_at"]})
    with pytest.raises(HTTPException) as exc:
        await get_booking_options(booking_link["id"])
    assert exc.value.status_code == 410
    await db.appointments.delete_one({"id": appt["id"]})


@pytest.mark.asyncio
async def test_public_booking_rejects_a_slot_taken_in_the_meantime(db, lead, employee_a, booking_link):
    options = await get_booking_options(booking_link["id"])
    chosen = options["offers"][0]
    # Someone else (e.g. the CRM) books the same slot first.
    await create_appointment(
        AppointmentCreate(lead_id=lead["id"], type="appel_decouverte", start_at=datetime.fromisoformat(chosen["start_at"]), assigned_to_user_id=employee_a["id"]),
        user=employee_a,
    )
    with pytest.raises(HTTPException) as exc:
        await book_appointment(booking_link["id"], {"employee_id": chosen["employee_id"], "start_at": chosen["start_at"]})
    assert exc.value.status_code == 409
