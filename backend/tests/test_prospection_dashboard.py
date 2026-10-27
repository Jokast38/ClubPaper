"""Integration tests for Partie D: funnel, activity metrics, rejection
breakdown and hot-clubs aggregation."""
import uuid
import pytest
import pytest_asyncio
from datetime import datetime, timezone, timedelta

from deps import serialize
from models import Lead, User, Club, LeadActivity, Appointment
from routers.prospection import prospection_funnel, prospection_activity, prospection_rejections, prospection_hot_clubs


def _tag():
    return f"TEST_{uuid.uuid4().hex[:8]}"


@pytest_asyncio.fixture
async def admin_user(db):
    user = User(email=f"{_tag()}@test.example", name="Admin Test", is_platform_admin=True)
    await db.users.insert_one(serialize(user))
    yield user.model_dump()
    await db.users.delete_one({"id": user.id})


@pytest_asyncio.fixture
async def employee(db):
    user = User(email=f"{_tag()}@test.example", name="Employee D", is_sales_employee=True)
    await db.users.insert_one(serialize(user))
    yield user.model_dump()
    await db.users.delete_one({"id": user.id})


@pytest_asyncio.fixture
async def leads(db, employee):
    """Three leads spread across the pipeline + one rejected, all assigned
    to `employee` and sourced from 'csv_import' so filters are testable."""
    docs = []
    specs = [
        ("nouveau", None, None),
        ("contacte", None, None),
        ("interesse", "president", None),
        ("refus", None, "trop_cher"),
    ]
    for status, decision_maker_role, rejection_reason in specs:
        l = Lead(
            name=_tag(), city="Lyon", source="csv_import", status=status,
            assigned_to_user_id=employee["id"], decision_maker_role=decision_maker_role or "",
            rejection_reason=rejection_reason or "",
        )
        docs.append(l)
    for l in docs:
        await db.leads.insert_one(serialize(l))
    yield [l.model_dump() for l in docs]
    for l in docs:
        await db.leads.delete_one({"id": l.id})
        await db.lead_activities.delete_many({"lead_id": l.id})
        await db.appointments.delete_many({"lead_id": l.id})


@pytest.mark.asyncio
async def test_funnel_counts_are_cumulative_and_scoped_by_source(db, leads, employee, admin_user):
    result = await prospection_funnel(period_days=365, source="csv_import", employee_id="", user=admin_user)
    # "interesse" reached => nouveau/a_appeler/contacte/interesse all count it too.
    assert result["stage_counts"]["nouveau"] >= 3  # nouveau, contacte, interesse leads all passed through "nouveau"
    assert result["stage_counts"]["interesse"] >= 1
    assert result["exit_counts"]["refus"] >= 1


@pytest.mark.asyncio
async def test_funnel_filtered_by_unrelated_source_is_empty(db, leads, employee, admin_user):
    # Scoped by employee_id too — the fixture leads are "csv_import", and no
    # real-world lead could be assigned to this randomly generated test employee,
    # so filtering by both guarantees an empty result regardless of other data.
    result = await prospection_funnel(period_days=365, source="rna_import", employee_id=employee["id"], user=admin_user)
    assert all(v == 0 for v in result["stage_counts"].values())


@pytest.mark.asyncio
async def test_rejection_breakdown_counts_by_reason(db, leads, admin_user):
    result = await prospection_rejections(period_days=365, source="csv_import", employee_id="", user=admin_user)
    assert result["breakdown"]["trop_cher"] >= 1
    assert result["total"] >= 1


@pytest.mark.asyncio
async def test_activity_counts_calls_appointments_and_conversions(db, leads, employee, admin_user):
    lead = leads[0]
    now = datetime.now(timezone.utc)
    call = LeadActivity(lead_id=lead["id"], type="call", author_id=employee["id"], call_outcome="reached")
    await db.lead_activities.insert_one(serialize(call))
    status_change = LeadActivity(lead_id=lead["id"], type="status_change", author_id=employee["id"], to_status="client_payant")
    await db.lead_activities.insert_one(serialize(status_change))
    appt = Appointment(lead_id=lead["id"], type="appel_decouverte", start_at=now + timedelta(days=1), assigned_to_user_id=employee["id"])
    await db.appointments.insert_one(serialize(appt))

    result = await prospection_activity(period_days=30, source="", employee_id=employee["id"], user=admin_user)
    assert result["calls_made"] >= 1
    assert result["appointments_booked"] >= 1
    assert result["conversions"] >= 1

    await db.lead_activities.delete_many({"lead_id": lead["id"]})
    await db.appointments.delete_one({"id": appt.id})


@pytest.mark.asyncio
async def test_decision_makers_reached_requires_both_reached_call_and_role(db, leads, employee, admin_user):
    with_dm = leads[2]  # has decision_maker_role="president"
    without_dm = leads[0]
    await db.lead_activities.insert_one(serialize(LeadActivity(lead_id=with_dm["id"], type="call", author_id=employee["id"], call_outcome="reached")))
    await db.lead_activities.insert_one(serialize(LeadActivity(lead_id=without_dm["id"], type="call", author_id=employee["id"], call_outcome="reached")))

    result = await prospection_activity(period_days=30, source="", employee_id=employee["id"], user=admin_user)
    assert result["decision_makers_reached"] == 1

    await db.lead_activities.delete_many({"lead_id": with_dm["id"]})
    await db.lead_activities.delete_many({"lead_id": without_dm["id"]})


@pytest_asyncio.fixture
async def hot_club(db):
    owner = User(email=f"{_tag()}@test.example", name="Club Owner")
    await db.users.insert_one(serialize(owner))
    club = Club(
        slug=_tag().lower(), name=_tag(), owner_id=owner.id, plan="free", upgrade_prompt_count=3,
    )
    await db.clubs.insert_one(serialize(club))
    yield club.model_dump()
    await db.clubs.delete_one({"id": club.id})
    await db.users.delete_one({"id": owner.id})


@pytest.mark.asyncio
async def test_hot_clubs_includes_clubs_that_hit_a_limit(db, hot_club, admin_user):
    result = await prospection_hot_clubs(user=admin_user)
    assert any(c["id"] == hot_club["id"] for c in result)


@pytest_asyncio.fixture
async def trial_ending_soon_club(db):
    owner = User(email=f"{_tag()}@test.example", name="Trial Owner")
    await db.users.insert_one(serialize(owner))
    club = Club(
        slug=_tag().lower(), name=_tag(), owner_id=owner.id, plan="trial",
        trial_ends_at=datetime.now(timezone.utc) + timedelta(days=3),
    )
    await db.clubs.insert_one(serialize(club))
    yield club.model_dump()
    await db.clubs.delete_one({"id": club.id})
    await db.users.delete_one({"id": owner.id})


@pytest.mark.asyncio
async def test_hot_clubs_includes_trials_ending_soon(db, trial_ending_soon_club, admin_user):
    result = await prospection_hot_clubs(user=admin_user)
    assert any(c["id"] == trial_ending_soon_club["id"] for c in result)


@pytest.mark.asyncio
async def test_hot_clubs_excludes_paid_clubs(db, admin_user):
    owner = User(email=f"{_tag()}@test.example", name="Paid Owner")
    db2 = db
    await db2.users.insert_one(serialize(owner))
    club = Club(slug=_tag().lower(), name=_tag(), owner_id=owner.id, plan="paid", upgrade_prompt_count=5)
    await db2.clubs.insert_one(serialize(club))
    try:
        result = await prospection_hot_clubs(user=admin_user)
        assert not any(c["id"] == club.id for c in result)
    finally:
        await db2.clubs.delete_one({"id": club.id})
        await db2.users.delete_one({"id": owner.id})
