"""Clubs, integrations, season settings, prospects (admin), reminders/SMS test."""
import asyncio
from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, HTTPException, Depends
from models import ClubCreate, Club, ClubUpdate, ClubTheme, Prospect, ClubIntegrations, Member
from database import get_db
from deps import current_user, get_user_club, serialize, slugify, unique_club_slug, frontend_url
from sms_utils import send_sms, format_phone
from scheduler_jobs import run_fee_reminders, run_season_reminders
from email_utils import send_email, club_ready_html, referral_signup_html

router = APIRouter(tags=["clubs"])


@router.post("/clubs")
async def create_club(data: ClubCreate, user: dict = Depends(current_user)):
    db = get_db()
    if user.get("club_id"):
        raise HTTPException(400, "Vous avez déjà un club")
    slug = await unique_club_slug(slugify(data.name))
    now = datetime.now(timezone.utc)

    referrer = None
    ref_code = (user.get("pending_referral_code") or "").strip().upper()
    if ref_code:
        referrer = await db.clubs.find_one({"referral_code": ref_code}, {"_id": 0})

    club = Club(
        slug=slug, name=data.name, sport=data.sport,
        description=data.description or "", address=data.address or "",
        city=data.city or "", email=data.email or "", phone=data.phone or "",
        trial_started_at=now, trial_ends_at=now + timedelta(days=30),
        owner_id=user["id"],
        referred_by_club_id=referrer["id"] if referrer else None,
    )
    doc = serialize(club)
    doc["theme"] = club.theme.model_dump()
    await db.clubs.insert_one(doc)
    await db.users.update_one({"id": user["id"]}, {"$set": {"club_id": club.id}, "$unset": {"pending_referral_code": ""}})

    to = club.email or user.get("email", "")
    public_url = f"{frontend_url()}/c/{club.slug}"
    asyncio.create_task(send_email(to, f"Bravo, {club.name} est prêt ! 🎉", club_ready_html(doc, public_url), club_id=club.id, kind="club_ready"))

    if referrer:
        referrer_owner = await db.users.find_one({"id": referrer.get("owner_id")}, {"_id": 0, "email": 1})
        referrer_to = referrer.get("email") or (referrer_owner or {}).get("email", "")
        if referrer_to:
            asyncio.create_task(send_email(
                referrer_to, f"{club.name} vient de s'inscrire grâce à vous ! 🎉",
                referral_signup_html(referrer.get("name", ""), club.name),
                club_id=referrer["id"], kind="referral_signup",
            ))

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


@router.post("/clubs/me/cancel-subscription")
async def cancel_subscription(user: dict = Depends(current_user)):
    """Downgrade back to the free plan — blocked while the season commitment is running."""
    db = get_db()
    club = await get_user_club(user)
    if club.get("plan") != "paid":
        raise HTTPException(400, "Aucun abonnement actif à résilier")
    ends_at = club.get("commitment_ends_at")
    if ends_at and datetime.fromisoformat(ends_at) > datetime.now(timezone.utc):
        raise HTTPException(
            403,
            f"Votre engagement saison court jusqu'au {ends_at[:10]} — la résiliation sera possible à partir de cette date.",
        )
    await db.clubs.update_one({"id": club["id"]}, {"$set": {
        "plan": "free", "subscription_status": "trial",
        "commitment_started_at": None, "commitment_ends_at": None, "billing_mode": None,
    }})
    return {"ok": True}


@router.get("/clubs/me/referrals")
async def my_referrals(user: dict = Depends(current_user)):
    """The club's own referral code + the clubs it has referred, for the Settings page."""
    db = get_db()
    club = await get_user_club(user)
    referred = await db.clubs.find(
        {"referred_by_club_id": club["id"]}, {"_id": 0, "id": 1, "name": 1, "plan": 1, "created_at": 1},
    ).sort("created_at", -1).to_list(200)
    return {
        "referral_code": club.get("referral_code", ""),
        "referral_credits_months": club.get("referral_credits_months", 0),
        "referral_pending_credits": club.get("referral_pending_credits", 0),
        "referred_clubs": referred,
    }


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
