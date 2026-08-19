"""Clubs, integrations, season settings, prospects (admin), reminders/SMS test."""
from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, HTTPException, Depends
from models import ClubCreate, Club, ClubUpdate, ClubTheme, Prospect, ClubIntegrations, Member
from database import get_db
from deps import current_user, get_user_club, serialize, slugify, unique_club_slug
from sms_utils import send_sms, format_phone
from scheduler_jobs import run_fee_reminders, run_season_reminders

router = APIRouter(tags=["clubs"])


@router.post("/clubs")
async def create_club(data: ClubCreate, user: dict = Depends(current_user)):
    db = get_db()
    if user.get("club_id"):
        raise HTTPException(400, "Vous avez déjà un club")
    slug = await unique_club_slug(slugify(data.name))
    club = Club(
        slug=slug, name=data.name, sport=data.sport,
        description=data.description or "", address=data.address or "",
        city=data.city or "", email=data.email or "", phone=data.phone or "",
        trial_ends_at=datetime.now(timezone.utc) + timedelta(days=30),
        owner_id=user["id"],
    )
    doc = serialize(club)
    doc["theme"] = club.theme.model_dump()
    await db.clubs.insert_one(doc)
    await db.users.update_one({"id": user["id"]}, {"$set": {"club_id": club.id}})
    return club.model_dump()


@router.put("/clubs/me")
async def update_club(data: ClubUpdate, user: dict = Depends(current_user)):
    db = get_db()
    club = await get_user_club(user)
    update = {k: v for k, v in data.model_dump(exclude_unset=True).items() if v is not None}
    if "theme" in update and isinstance(update["theme"], dict):
        update["theme"] = ClubTheme(**update["theme"]).model_dump()
    if update:
        await db.clubs.update_one({"id": club["id"]}, {"$set": update})
    return await db.clubs.find_one({"id": club["id"]}, {"_id": 0})


@router.get("/clubs/me")
async def get_my_club(user: dict = Depends(current_user)):
    return await get_user_club(user)


# ---- Prospects (admin side) ----
@router.get("/prospects")
async def list_prospects(user: dict = Depends(current_user)):
    db = get_db()
    club = await get_user_club(user)
    return await db.prospects.find({"club_id": club["id"]}, {"_id": 0}).sort("created_at", -1).to_list(500)


@router.post("/prospects/{prospect_id}/convert")
async def convert_prospect(prospect_id: str, user: dict = Depends(current_user)):
    db = get_db()
    club = await get_user_club(user)
    p = await db.prospects.find_one({"id": prospect_id, "club_id": club["id"]}, {"_id": 0})
    if not p:
        raise HTTPException(404, "Prospect introuvable")
    m = Member(
        first_name=p["first_name"], last_name=p["last_name"],
        email=p.get("email", ""), phone=p.get("phone", ""),
        team=p.get("team_interest", ""), club_id=club["id"],
        license_status="pending", medical_cert_status="missing",
    )
    await db.members.insert_one(serialize(m))
    await db.prospects.update_one({"id": prospect_id}, {"$set": {"status": "converted"}})
    return m.model_dump()


# ---- Season settings ----
@router.get("/season-settings")
async def get_season_settings(user: dict = Depends(current_user)):
    club = await get_user_club(user)
    return club.get("season_settings") or {}


@router.put("/season-settings")
async def update_season_settings(data: dict, user: dict = Depends(current_user)):
    db = get_db()
    club = await get_user_club(user)
    allowed = {k: v for k, v in data.items() if k in {"end_date", "renewal_open_date", "sent_end_reminder", "sent_renewal_reminder"}}
    await db.clubs.update_one({"id": club["id"]}, {"$set": {"season_settings": allowed}})
    return allowed


# ---- Integrations ----
def _integrations_public(raw: dict) -> dict:
    raw = raw or {}
    return {
        "resend_configured": bool(raw.get("resend_api_key")),
        "resend_sender": raw.get("resend_sender", ""),
        "resend_enabled": bool(raw.get("resend_enabled")),
        "stripe_configured": bool(raw.get("stripe_secret_key")),
        "stripe_enabled": bool(raw.get("stripe_enabled")),
        "twilio_configured": bool(raw.get("twilio_account_sid") and raw.get("twilio_auth_token")),
        "twilio_phone_from": raw.get("twilio_phone_from", ""),
        "twilio_enabled": bool(raw.get("twilio_enabled")),
    }


@router.get("/integrations")
async def get_integrations(user: dict = Depends(current_user)):
    club = await get_user_club(user)
    return _integrations_public(club.get("integrations") or {})


@router.put("/integrations")
async def update_integrations(data: ClubIntegrations, user: dict = Depends(current_user)):
    db = get_db()
    club = await get_user_club(user)
    payload = data.model_dump(exclude_none=True)
    existing = club.get("integrations") or {}
    for k, v in payload.items():
        if v == "" and k in {"resend_api_key", "stripe_secret_key", "stripe_publishable_key", "twilio_account_sid", "twilio_auth_token"}:
            continue
        existing[k] = v
    await db.clubs.update_one({"id": club["id"]}, {"$set": {"integrations": existing}})
    return _integrations_public(existing)


# ---- Manual reminders + SMS test ----
@router.post("/reminders/run-fees")
async def run_fee_reminders_now(user: dict = Depends(current_user)):
    sent = await run_fee_reminders(get_db())
    return {"sent": sent}


@router.post("/reminders/run-season")
async def run_season_reminders_now(user: dict = Depends(current_user)):
    sent = await run_season_reminders(get_db())
    return {"sent": sent}


@router.post("/sms/test")
async def sms_test(payload: dict, user: dict = Depends(current_user)):
    club = await get_user_club(user)
    to = payload.get("to") or ""
    body = payload.get("body") or f"Test SMS depuis {club['name']} via ClubPaper."
    if not to:
        raise HTTPException(400, "Numéro requis")
    return await send_sms(club, format_phone(to), body, kind="test")
