"""Public (unauthenticated) endpoints."""
import asyncio
import random
from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import Response as FastAPIResponse
from pymongo.errors import DuplicateKeyError

from models import ProspectCreate, Prospect, Appointment, LeadActivity, ClaimRequestCreate, ClaimRequest, Club, User
from database import get_db
from deps import serialize, slugify, unique_club_slug, frontend_url
from storage import get_object
from email_utils import (
    send_email, new_prospect_html, appointment_confirmation_html, APPOINTMENT_TYPE_LABEL,
    claim_verification_html, claim_submitted_admin_html,
)
from telegram_utils import notify_admins_telegram
from ics_utils import build_ics
from auth_utils import hash_password
from appointment_scheduling import compute_free_slots, has_conflict, DEFAULT_DURATION_MINUTES, ACTIVE_APPOINTMENT_STATUSES

router = APIRouter(prefix="/public", tags=["public"])

LEAD_RDV_ELIGIBLE_STATUSES = {"nouveau", "a_appeler", "contacte", "interesse"}
CLAIM_CODE_VALIDITY_MINUTES = 30


@router.get("/clubs/{slug}")
async def public_club(slug: str):
    db = get_db()
    club = await db.clubs.find_one({"slug": slug}, {
        "_id": 0, "owner_id": 0, "stripe_customer_id": 0,
        "referred_by_club_id": 0, "referral_reward_applied": 0,
        "referral_credits_months": 0, "referral_pending_credits": 0,
        "commitment_started_at": 0, "commitment_ends_at": 0, "billing_mode": 0,
        "upgrade_prompt_count": 0,
    })
    if not club:
        raise HTTPException(404, "Club introuvable")
    club["members_count"] = await db.members.count_documents({"club_id": club["id"]})
    return club


@router.post("/clubs/{slug}/prospects")
async def submit_prospect(slug: str, data: ProspectCreate):
    db = get_db()
    club = await db.clubs.find_one({"slug": slug}, {"_id": 0})
    if not club:
        raise HTTPException(404, "Club introuvable")
    prospect = Prospect(**data.model_dump(), club_id=club["id"])
    await db.prospects.insert_one(serialize(prospect))
    asyncio.create_task(_notify_new_prospect(db, club, prospect))
    return {"ok": True, "message": "Votre demande a bien été reçue. Le club vous contactera prochainement."}


async def _notify_new_prospect(db, club: dict, prospect: Prospect):
    to = club.get("email") or ""
    if not to:
        owner = await db.users.find_one({"id": club.get("owner_id")}, {"_id": 0, "email": 1})
        to = (owner or {}).get("email", "")
    if not to:
        return
    await send_email(
        to, f"Nouvelle demande — {prospect.first_name} {prospect.last_name}",
        new_prospect_html(club.get("name", ""), prospect.model_dump()),
        club_id=club["id"], kind="new_prospect",
    )


@router.get("/clubs/{slug}/blog")
async def public_blog_list(slug: str):
    db = get_db()
    club = await db.clubs.find_one({"slug": slug}, {"_id": 0})
    if not club:
        raise HTTPException(404, "Club introuvable")
    return await db.blog_posts.find(
        {"club_id": club["id"], "published": True},
        {"_id": 0, "body": 0},
    ).sort("created_at", -1).to_list(50)


@router.get("/clubs/{slug}/blog/{post_slug}")
async def public_blog_detail(slug: str, post_slug: str):
    db = get_db()
    club = await db.clubs.find_one({"slug": slug}, {"_id": 0})
    if not club:
        raise HTTPException(404, "Club introuvable")
    post = await db.blog_posts.find_one({"club_id": club["id"], "slug": post_slug, "published": True}, {"_id": 0})
    if not post:
        raise HTTPException(404, "Article introuvable")
    return {"post": post, "club": {"name": club["name"], "slug": club["slug"], "theme": club.get("theme", {}), "logo_data_url": club.get("logo_data_url", "")}}


@router.get("/fees/{fee_id}")
async def public_fee(fee_id: str):
    db = get_db()
    fee = await db.fees.find_one({"id": fee_id}, {"_id": 0})
    if not fee:
        raise HTTPException(404, "Cotisation introuvable")
    club = await db.clubs.find_one({"id": fee["club_id"]}, {"_id": 0})
    member = await db.members.find_one({"id": fee["member_id"]}, {"_id": 0})
    return {
        "fee": fee,
        "club": {"name": club["name"], "slug": club["slug"], "theme": club.get("theme", {}), "logo_data_url": club.get("logo_data_url", "")},
        "member": {"first_name": member["first_name"], "last_name": member["last_name"]},
    }


@router.get("/leads/{lead_id}/desinscription")
async def unsubscribe_lead(lead_id: str):
    """One-click unsubscribe link from a prospecting email (Partie F) — sets
    do_not_call so this lead is dropped from every future call queue and
    campaign. No auth: the lead_id itself (a UUID4) is the token, same
    pattern as the public fee-payment links."""
    db = get_db()
    from datetime import datetime, timezone
    result = await db.leads.update_one(
        {"id": lead_id},
        {"$set": {"do_not_call": True, "do_not_call_at": datetime.now(timezone.utc).isoformat(), "do_not_call_source": "unsubscribe_link"}},
    )
    if result.matched_count == 0:
        raise HTTPException(404, "Lien invalide")
    return FastAPIResponse(
        content="<html><body style=\"font-family:sans-serif;text-align:center;padding:60px;\">"
                "<h2>Vous ne serez plus recontacté(e)</h2><p>Votre demande a bien été prise en compte.</p>"
                "</body></html>",
        media_type="text/html",
    )


@router.get("/media")
async def public_media(path: str = Query(...)):
    if not path.startswith("clubmanager/clubs/") or "/media/" not in path:
        raise HTTPException(404, "Introuvable")
    try:
        data, ct = get_object(path)
    except Exception:
        raise HTTPException(404, "Introuvable")
    return FastAPIResponse(content=data, media_type=ct, headers={"Cache-Control": "public, max-age=86400"})


async def _booking_link_or_404(db, token: str) -> dict:
    link = await db.booking_links.find_one({"id": token}, {"_id": 0})
    if not link:
        raise HTTPException(404, "Lien invalide")
    now = datetime.now(timezone.utc).isoformat()
    if link.get("used_at"):
        raise HTTPException(410, "Ce lien a déjà été utilisé")
    if link["expires_at"] < now:
        raise HTTPException(410, "Ce lien a expiré")
    return link


@router.get("/booking/{token}")
async def get_booking_options(token: str):
    """No-auth: the prospect opens this from an email/SMS to pick a slot."""
    db = get_db()
    link = await _booking_link_or_404(db, token)
    lead = await db.leads.find_one({"id": link["lead_id"]}, {"_id": 0, "name": 1, "city": 1})
    if not lead:
        raise HTTPException(404, "Lien invalide")

    if link.get("employee_id"):
        candidate_ids = [link["employee_id"]]
    else:
        employees = await db.users.find({"is_sales_employee": True}, {"_id": 0, "id": 1}).to_list(50)
        candidate_ids = [e["id"] for e in employees]

    duration = DEFAULT_DURATION_MINUTES.get(link["appointment_type"], 30)
    now = datetime.now(timezone.utc)
    window_end = now + timedelta(days=14)
    offers = []
    for employee_id in candidate_ids:
        employee = await db.users.find_one({"id": employee_id}, {"_id": 0, "id": 1, "name": 1})
        if not employee:
            continue
        avail = await db.employee_availability.find_one({"user_id": employee_id}, {"_id": 0})
        slots = (avail or {}).get("slots", [])
        existing = await db.appointments.find(
            {"assigned_to_user_id": employee_id, "status": {"$in": list(ACTIVE_APPOINTMENT_STATUSES)}},
            {"_id": 0, "id": 1, "assigned_to_user_id": 1, "start_at": 1, "duration_minutes": 1, "status": 1},
        ).to_list(1000)
        free = compute_free_slots(slots, link["appointment_type"], existing, duration, now, window_end, employee_id=employee_id)
        for s in free:
            offers.append({"employee_id": employee_id, "employee_name": employee.get("name", ""), "start_at": s.isoformat()})
    offers.sort(key=lambda o: o["start_at"])

    return {
        "lead_name": lead.get("name", ""),
        "lead_city": lead.get("city", ""),
        "appointment_type": link["appointment_type"],
        "appointment_type_label": APPOINTMENT_TYPE_LABEL.get(link["appointment_type"], link["appointment_type"]),
        "duration_minutes": duration,
        "is_on_site": link["appointment_type"] == "installation_sur_place",
        "offers": offers[:200],
    }


@router.post("/booking/{token}")
async def book_appointment(token: str, payload: dict):
    """No-auth: the prospect confirms a slot — single-use, re-validated
    server-side against the current availability (never trust the slot list
    the client was shown, concurrent bookings may have taken it)."""
    db = get_db()
    link = await _booking_link_or_404(db, token)
    lead = await db.leads.find_one({"id": link["lead_id"]}, {"_id": 0})
    if not lead:
        raise HTTPException(404, "Lien invalide")

    employee_id = payload.get("employee_id") or link.get("employee_id")
    start_at_raw = payload.get("start_at")
    if not employee_id or not start_at_raw:
        raise HTTPException(400, "Créneau ou employé manquant")
    employee = await db.users.find_one({"id": employee_id}, {"_id": 0})
    if not employee:
        raise HTTPException(400, "Employé invalide")
    try:
        start_at = datetime.fromisoformat(start_at_raw.replace("Z", "+00:00"))
    except Exception:
        raise HTTPException(400, "Date invalide")

    duration = DEFAULT_DURATION_MINUTES.get(link["appointment_type"], 30)
    existing = await db.appointments.find(
        {"assigned_to_user_id": employee_id, "status": {"$in": list(ACTIVE_APPOINTMENT_STATUSES)}},
        {"_id": 0, "id": 1, "assigned_to_user_id": 1, "start_at": 1, "duration_minutes": 1, "status": 1},
    ).to_list(1000)
    if has_conflict(employee_id, start_at, duration, existing):
        raise HTTPException(409, "Ce créneau n'est plus disponible, merci de recharger la page")

    appointment = Appointment(
        lead_id=link["lead_id"], type=link["appointment_type"], start_at=start_at, duration_minutes=duration,
        assigned_to_user_id=employee_id, assigned_to_name=employee.get("name", ""),
        prospect_note=(payload.get("prospect_note") or "").strip(), claim_token=token,
    )
    try:
        await db.appointments.insert_one(serialize(appointment))
    except DuplicateKeyError:
        raise HTTPException(409, "Ce créneau n'est plus disponible, merci de recharger la page")

    await db.booking_links.update_one({"id": token}, {"$set": {"used_at": datetime.now(timezone.utc).isoformat(), "appointment_id": appointment.id}})

    update = {"updated_at": datetime.now(timezone.utc).isoformat()}
    if lead.get("status") in LEAD_RDV_ELIGIBLE_STATUSES:
        update["status"] = "rdv_planifie"
    await db.leads.update_one({"id": link["lead_id"]}, {"$set": update})
    await db.lead_activities.insert_one(serialize(LeadActivity(
        lead_id=link["lead_id"], type="appointment", author_id="prospect", author_name=lead.get("name", ""),
        text=f"Rendez-vous {link['appointment_type']} pris en ligne pour le {start_at.strftime('%d/%m/%Y %H:%M')}",
    )))

    ics = build_ics(appointment.model_dump(), f"ClubPaper — {link['appointment_type']}", lead.get("name", ""))
    if lead.get("email"):
        asyncio.create_task(send_email(
            lead["email"], "Confirmation de votre rendez-vous ClubPaper",
            appointment_confirmation_html(appointment.model_dump(), lead.get("name", "")),
            kind="appointment_confirmation", attachments=[("rendez-vous.ics", "text/calendar", ics)],
        ))
    if employee.get("email"):
        asyncio.create_task(send_email(
            employee["email"], f"Nouveau rendez-vous — {lead.get('name','')}",
            appointment_confirmation_html(appointment.model_dump(), employee.get("name", "")),
            kind="appointment_confirmation", attachments=[("rendez-vous.ics", "text/calendar", ics)],
        ))
    asyncio.create_task(notify_admins_telegram(
        f"📅 Nouveau rendez-vous pris par un prospect\n{lead.get('name','')} ({lead.get('city','')})\n"
        f"Type: {link['appointment_type']}\nAvec: {employee.get('name','')}\nLe: {start_at.strftime('%d/%m/%Y %H:%M')}"
    ))
    return appointment.model_dump()


# ---------- Public club directory + claim flow (Partie E) ----------
# Directory entries are `Lead` documents the sales team has flagged
# `annuaire_visible=True`. Only generic club-identity fields are ever
# returned here — never phone/email/address, which are prospecting data,
# not meant to be scraped off the public directory.
ANNUAIRE_PUBLIC_FIELDS = {"_id": 0, "name": 1, "city": 1, "sport": 1, "description": 1, "annuaire_slug": 1, "claim_status": 1}


@router.get("/annuaire")
async def list_annuaire(
    sport: str = Query(""), city: str = Query(""), q: str = Query(""),
    page: int = Query(1, ge=1), limit: int = Query(24, ge=1, le=100),
):
    db = get_db()
    query = {"annuaire_visible": True}
    if sport:
        query["sport"] = sport
    if city:
        query["city"] = {"$regex": city, "$options": "i"}
    if q:
        query["name"] = {"$regex": q, "$options": "i"}
    total = await db.leads.count_documents(query)
    items = await db.leads.find(query, ANNUAIRE_PUBLIC_FIELDS).sort("name", 1).skip((page - 1) * limit).limit(limit).to_list(limit)
    sports = await db.leads.distinct("sport", {"annuaire_visible": True, "sport": {"$nin": [None, ""]}})
    return {"items": items, "total": total, "page": page, "limit": limit, "sports": sorted(sports)}


async def _annuaire_lead_or_404(db, slug: str) -> dict:
    lead = await db.leads.find_one({"annuaire_slug": slug, "annuaire_visible": True}, {"_id": 0})
    if not lead:
        raise HTTPException(404, "Fiche introuvable")
    return lead


@router.get("/annuaire/{slug}")
async def annuaire_detail(slug: str):
    db = get_db()
    lead = await _annuaire_lead_or_404(db, slug)
    public_lead = {k: v for k, v in lead.items() if k in {"name", "city", "sport", "description", "annuaire_slug", "claim_status"}}
    public_lead["claimed_club_slug"] = ""
    if lead.get("claimed_club_id"):
        club = await db.clubs.find_one({"id": lead["claimed_club_id"]}, {"_id": 0, "slug": 1})
        public_lead["claimed_club_slug"] = (club or {}).get("slug", "")
    return public_lead


@router.post("/annuaire/{slug}/claim")
async def submit_claim(slug: str, data: ClaimRequestCreate):
    db = get_db()
    lead = await _annuaire_lead_or_404(db, slug)
    if lead.get("claim_status") == "revendique":
        raise HTTPException(400, "Cette fiche a déjà été revendiquée")
    code = f"{random.randint(0, 999999):06d}"
    claim = ClaimRequest(
        lead_id=lead["id"], name=data.name, role=data.role, email=data.email, phone=data.phone or "",
        verification_method="email_code", verification_code=code,
        verification_code_sent_at=datetime.now(timezone.utc),
    )
    await db.claim_requests.insert_one(serialize(claim))
    asyncio.create_task(send_email(
        claim.email, "Confirmez votre revendication ClubPaper",
        claim_verification_html(lead.get("name", ""), code), kind="claim_verification",
    ))
    return {"ok": True, "claim_id": claim.id}


@router.post("/annuaire/claim/{claim_id}/verify")
async def verify_claim(claim_id: str, payload: dict):
    db = get_db()
    claim = await db.claim_requests.find_one({"id": claim_id}, {"_id": 0})
    if not claim:
        raise HTTPException(404, "Demande introuvable")
    if claim["status"] != "pending_verification":
        raise HTTPException(400, "Cette demande a déjà été traitée")
    sent_at = claim.get("verification_code_sent_at") or ""
    if not sent_at or datetime.now(timezone.utc) - datetime.fromisoformat(sent_at) > timedelta(minutes=CLAIM_CODE_VALIDITY_MINUTES):
        raise HTTPException(400, "Code expiré, merci de refaire une demande")
    if (payload.get("code") or "").strip() != claim["verification_code"]:
        raise HTTPException(400, "Code incorrect")

    lead = await db.leads.find_one({"id": claim["lead_id"]}, {"_id": 0})
    await db.claim_requests.update_one({"id": claim_id}, {"$set": {"status": "a_verifier", "verification_code": ""}})
    await db.leads.update_one({"id": claim["lead_id"]}, {"$set": {"claim_status": "a_verifier"}})
    asyncio.create_task(notify_admins_telegram(
        f"🏳️ Revendication à vérifier — {(lead or {}).get('name','')}\n{claim['name']} ({claim['role']}, {claim['email']})"
    ))
    asyncio.create_task(send_email(
        claim["email"], "Email confirmé — revendication en cours de vérification",
        claim_submitted_admin_html((lead or {}).get("name", ""), claim["name"], claim["role"], claim["email"]),
        kind="claim_submitted",
    ))
    return {"ok": True, "status": "a_verifier"}


@router.post("/annuaire/claim/{claim_id}/activate")
async def activate_claim(claim_id: str, payload: dict):
    """Final step, reached only after a platform admin approved the manual
    review (Partie E2/F) — the claimant sets a password here, which creates
    their account and a Club pre-filled from the lead, same as self-service
    onboarding (routers/clubs.py:create_club)."""
    db = get_db()
    claim = await db.claim_requests.find_one({"id": claim_id}, {"_id": 0})
    if not claim:
        raise HTTPException(404, "Demande introuvable")
    if claim["status"] != "verified" or claim.get("club_id"):
        raise HTTPException(400, "Cette demande n'est pas prête à être activée")
    password = payload.get("password") or ""
    if len(password) < 6:
        raise HTTPException(400, "Mot de passe trop court (6 caractères minimum)")

    lead = await db.leads.find_one({"id": claim["lead_id"]}, {"_id": 0})
    if not lead:
        raise HTTPException(404, "Fiche introuvable")

    email = claim["email"].lower()
    existing_user = await db.users.find_one({"email": email}, {"_id": 0})
    if existing_user and existing_user.get("club_id"):
        raise HTTPException(400, "Un compte existe déjà avec cet email")

    now = datetime.now(timezone.utc)
    if existing_user:
        user_id = existing_user["id"]
        await db.users.update_one({"id": user_id}, {"$set": {"password_hash": hash_password(password)}})
    else:
        user = User(email=email, name=claim["name"], role="admin")
        doc = serialize(user)
        doc["password_hash"] = hash_password(password)
        await db.users.insert_one(doc)
        user_id = user.id

    slug = await unique_club_slug(slugify(lead.get("name", "")))
    club = Club(
        slug=slug, name=lead.get("name", ""), sport=lead.get("sport") or "Football",
        description=lead.get("description", ""), city=lead.get("city", ""),
        email=email, phone=claim.get("phone", ""),
        trial_started_at=now, trial_ends_at=now + timedelta(days=30), owner_id=user_id,
    )
    cdoc = serialize(club)
    cdoc["theme"] = club.theme.model_dump()
    await db.clubs.insert_one(cdoc)
    await db.users.update_one({"id": user_id}, {"$set": {"club_id": club.id}})
    await db.claim_requests.update_one({"id": claim_id}, {"$set": {"club_id": club.id}})
    await db.leads.update_one(
        {"id": lead["id"]},
        {"$set": {
            "claim_status": "revendique", "claimed_by_user_id": user_id, "claimed_club_id": club.id,
            "status": "essai_demarre", "updated_at": now.isoformat(),
        }},
    )
    await db.lead_activities.insert_one(serialize(LeadActivity(
        lead_id=lead["id"], type="status_change", author_id="system", author_name="Revendication annuaire",
        text=f"Fiche revendiquée et compte activé par {claim['name']} ({email})", to_status="essai_demarre",
    )))
    asyncio.create_task(notify_admins_telegram(f"🎉 Fiche annuaire revendiquée et activée: {club.name}"))

    from auth_utils import create_access_token
    token = create_access_token(user_id, email)
    return {"ok": True, "token": token, "club_slug": club.slug}
