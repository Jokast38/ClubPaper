"""Integration tests for Partie E: public directory listing/detail, the
claim flow (submit -> verify email -> admin approve -> activate), and the
CRM-side publish toggle."""
import uuid
import pytest
import pytest_asyncio
from fastapi import HTTPException

from deps import serialize
from models import Lead, User
from routers.public import list_annuaire, annuaire_detail, submit_claim, verify_claim, activate_claim
from routers.claims import list_claims, approve_claim, reject_claim
from routers.admin import set_lead_annuaire_visibility


def _tag():
    return f"TEST_{uuid.uuid4().hex[:8]}"


@pytest_asyncio.fixture
async def admin_user(db):
    user = User(email=f"{_tag()}@test.example", name="Admin Test", is_platform_admin=True)
    await db.users.insert_one(serialize(user))
    yield user.model_dump()
    await db.users.delete_one({"id": user.id})


@pytest_asyncio.fixture
async def visible_lead(db):
    lead = Lead(name=_tag(), city="Lyon", sport="Football", source="rna_import")
    await db.leads.insert_one(serialize(lead))
    await set_lead_annuaire_visibility(lead.id, {"visible": True}, user={"is_platform_admin": True})
    doc = await db.leads.find_one({"id": lead.id}, {"_id": 0})
    yield doc
    await db.claim_requests.delete_many({"lead_id": lead.id})
    await db.clubs.delete_many({"name": lead.name})
    await db.users.delete_many({"email": {"$regex": "^claim_"}})
    await db.leads.delete_one({"id": lead.id})


@pytest.mark.asyncio
async def test_publish_toggle_allocates_a_stable_slug(db, visible_lead):
    assert visible_lead["annuaire_visible"] is True
    assert visible_lead["annuaire_slug"]


@pytest.mark.asyncio
async def test_unpublished_lead_is_not_listed_or_reachable(db):
    lead = Lead(name=_tag(), city="Nantes", sport="Tennis", source="csv_import")
    await db.leads.insert_one(serialize(lead))
    try:
        result = await list_annuaire(sport="", city="", q=lead.name, page=1, limit=24)
        assert result["total"] == 0
        with pytest.raises(HTTPException) as exc:
            await annuaire_detail("does-not-exist")
        assert exc.value.status_code == 404
    finally:
        await db.leads.delete_one({"id": lead.id})


@pytest.mark.asyncio
async def test_visible_lead_appears_in_list_and_detail_without_contact_fields(db, visible_lead):
    result = await list_annuaire(sport="", city="", q=visible_lead["name"], page=1, limit=24)
    assert result["total"] == 1
    assert "phone" not in result["items"][0]
    assert "email" not in result["items"][0]

    detail = await annuaire_detail(visible_lead["annuaire_slug"])
    assert detail["name"] == visible_lead["name"]
    assert "phone" not in detail


@pytest.mark.asyncio
async def test_full_claim_flow_creates_account_and_club(db, visible_lead):
    email = f"claim_{uuid.uuid4().hex[:8]}@test.example"
    submitted = await submit_claim(visible_lead["annuaire_slug"], _ClaimPayload(
        lead_id=visible_lead["id"], name="Jean Dupont", role="president", email=email, phone="0600000000",
    ))
    claim = await db.claim_requests.find_one({"id": submitted["claim_id"]}, {"_id": 0})
    assert claim["status"] == "pending_verification"

    # Wrong code is rejected, right code moves the claim to admin review.
    with pytest.raises(HTTPException):
        await verify_claim(claim["id"], {"code": "000000"})
    verified = await verify_claim(claim["id"], {"code": claim["verification_code"]})
    assert verified["status"] == "a_verifier"
    lead_after_verify = await db.leads.find_one({"id": visible_lead["id"]}, {"_id": 0})
    assert lead_after_verify["claim_status"] == "a_verifier"

    # Not yet approved -> activation must be refused.
    with pytest.raises(HTTPException):
        await activate_claim(claim["id"], {"password": "s3cret!"})

    approved = await approve_claim(claim["id"], user={"id": "admin-1", "is_platform_admin": True})
    assert approved["status"] == "verified"

    activated = await activate_claim(claim["id"], {"password": "s3cret!"})
    assert activated["ok"] is True
    assert activated["token"]

    final_lead = await db.leads.find_one({"id": visible_lead["id"]}, {"_id": 0})
    assert final_lead["claim_status"] == "revendique"
    assert final_lead["status"] == "essai_demarre"
    club = await db.clubs.find_one({"id": final_lead["claimed_club_id"]}, {"_id": 0})
    assert club["owner_id"] == final_lead["claimed_by_user_id"]
    user = await db.users.find_one({"id": final_lead["claimed_by_user_id"]}, {"_id": 0})
    assert user["email"] == email
    assert user["club_id"] == club["id"]


@pytest.mark.asyncio
async def test_rejected_claim_resets_lead_and_blocks_activation(db, visible_lead):
    email = f"claim_{uuid.uuid4().hex[:8]}@test.example"
    submitted = await submit_claim(visible_lead["annuaire_slug"], _ClaimPayload(
        lead_id=visible_lead["id"], name="Marie Curie", role="tresorier", email=email, phone="",
    ))
    claim = await db.claim_requests.find_one({"id": submitted["claim_id"]}, {"_id": 0})
    await verify_claim(claim["id"], {"code": claim["verification_code"]})

    rejected = await reject_claim(claim["id"], {"note": "identité non confirmée"}, user={"id": "admin-1", "is_platform_admin": True})
    assert rejected["status"] == "rejected"
    lead_after = await db.leads.find_one({"id": visible_lead["id"]}, {"_id": 0})
    assert lead_after["claim_status"] == "none"

    with pytest.raises(HTTPException):
        await activate_claim(claim["id"], {"password": "s3cret!"})


@pytest.mark.asyncio
async def test_admin_can_list_claims_by_status(db, visible_lead, admin_user):
    email = f"claim_{uuid.uuid4().hex[:8]}@test.example"
    submitted = await submit_claim(visible_lead["annuaire_slug"], _ClaimPayload(
        lead_id=visible_lead["id"], name="Paul Martin", role="secretaire", email=email, phone="",
    ))
    claim = await db.claim_requests.find_one({"id": submitted["claim_id"]}, {"_id": 0})
    await verify_claim(claim["id"], {"code": claim["verification_code"]})

    pending = await list_claims(status="a_verifier", user=admin_user)
    assert any(c["id"] == claim["id"] for c in pending)
    assert all(c["lead"] is not None for c in pending if c["id"] == claim["id"])


def _ClaimPayload(**kwargs):
    from models import ClaimRequestCreate
    return ClaimRequestCreate(**kwargs)
