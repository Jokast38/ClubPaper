"""Platform-owner admin — cross-club stats, subscriptions, notification logs, support tickets.

Everything here is gated by `platform_admin_user` (User.is_platform_admin), which is
distinct from a club's own "admin" (bureau) role — a club admin has no access to this router.
"""
import io
import os
import csv
import logging
import asyncio
import requests
from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, HTTPException, Depends, Query, UploadFile, File

from database import get_db
from deps import platform_admin_user, current_user, sales_user, serialize, delete_club_cascade, frontend_url
from auth_utils import hash_password
from models import SupportTicketCreate, SupportTicket, Lead, LeadCreate, EmployeeCreate, User, LEAD_STATUSES
from email_utils import send_email, support_ticket_html, support_reply_html, lead_campaign_html

router = APIRouter(prefix="/admin", tags=["admin"])
logger = logging.getLogger(__name__)

MONTHLY_PRICE_EUR = 19.99


@router.get("/stats")
async def stats(user: dict = Depends(platform_admin_user)):
    db = get_db()
    total_clubs = await db.clubs.count_documents({})
    total_users = await db.users.count_documents({})
    total_members = await db.members.count_documents({})

    active_clubs = await db.clubs.count_documents({"subscription_status": "active"})
    trial_clubs = await db.clubs.count_documents({"subscription_status": "trial"})
    past_due_clubs = await db.clubs.count_documents({"subscription_status": "past_due"})
    free_clubs = await db.clubs.count_documents({"plan": "free"})
    paid_clubs = await db.clubs.count_documents({"plan": "paid"})
    mrr = active_clubs * MONTHLY_PRICE_EUR

    # Signups + estimated cumulative MRR per month, last 12 months.
    since = datetime.now(timezone.utc) - timedelta(days=365)
    clubs = await db.clubs.find(
        {"created_at": {"$gte": since.isoformat()}},
        {"_id": 0, "created_at": 1, "subscription_status": 1},
    ).to_list(5000)

    months = []
    cursor = datetime(since.year, since.month, 1, tzinfo=timezone.utc)
    now = datetime.now(timezone.utc)
    while cursor <= now:
        months.append(cursor.strftime("%Y-%m"))
        cursor = (cursor.replace(day=28) + timedelta(days=4)).replace(day=1)

    signups_by_month = {m: 0 for m in months}
    active_by_month = {m: 0 for m in months}
    for c in clubs:
        try:
            created = c["created_at"][:7]
        except Exception:
            continue
        if created in signups_by_month:
            signups_by_month[created] += 1
        if c.get("subscription_status") == "active":
            for m in months:
                if m >= created:
                    active_by_month[m] += 1

    chart = [
        {"month": m, "signups": signups_by_month[m], "estimated_mrr": round(active_by_month[m] * MONTHLY_PRICE_EUR, 2)}
        for m in months
    ]

    return {
        "total_clubs": total_clubs,
        "total_users": total_users,
        "total_members": total_members,
        "active_clubs": active_clubs,
        "trial_clubs": trial_clubs,
        "past_due_clubs": past_due_clubs,
        "free_clubs": free_clubs,
        "paid_clubs": paid_clubs,
        "mrr_estimate": mrr,
        "chart": chart,
    }


@router.get("/referrals")
async def referral_overview(user: dict = Depends(platform_admin_user)):
    """Referrer → referred-club(s) table, for spotting the best ambassadors."""
    db = get_db()
    referrers = await db.clubs.find(
        {"$or": [{"referral_credits_months": {"$gt": 0}}, {"referral_pending_credits": {"$gt": 0}}]},
        {"_id": 0, "id": 1},
    ).to_list(1000)
    referrer_ids = {c["id"] for c in referrers}
    all_referred = await db.clubs.find(
        {"referred_by_club_id": {"$ne": None}},
        {"_id": 0, "id": 1, "name": 1, "plan": 1, "created_at": 1, "referred_by_club_id": 1},
    ).to_list(5000)
    referrer_ids.update(c["referred_by_club_id"] for c in all_referred)

    referrer_clubs = await db.clubs.find(
        {"id": {"$in": list(referrer_ids)}}, {"_id": 0, "id": 1, "name": 1, "referral_code": 1, "referral_credits_months": 1, "referral_pending_credits": 1},
    ).to_list(len(referrer_ids) or 1)

    rows = []
    for rc in referrer_clubs:
        referred = [c for c in all_referred if c.get("referred_by_club_id") == rc["id"]]
        if not referred:
            continue
        rows.append({
            "referrer_id": rc["id"],
            "referrer_name": rc["name"],
            "referral_code": rc.get("referral_code", ""),
            "credits_applied": rc.get("referral_credits_months", 0),
            "credits_pending": rc.get("referral_pending_credits", 0),
            "referred": [
                {"id": c["id"], "name": c["name"], "status": "converti" if c.get("plan") == "paid" else "en attente", "created_at": c.get("created_at")}
                for c in referred
            ],
        })
    rows.sort(key=lambda r: len(r["referred"]), reverse=True)
    return rows


@router.get("/clubs")
async def list_clubs(
    q: str = "",
    page: int = 1,
    page_size: int = 20,
    user: dict = Depends(platform_admin_user),
):
    db = get_db()
    query = {}
    if q:
        query["name"] = {"$regex": q.strip(), "$options": "i"}
    page = max(1, page)
    page_size = min(max(1, page_size), 100)
    total = await db.clubs.count_documents(query)
    clubs = await db.clubs.find(query, {"_id": 0}).sort("created_at", -1).skip((page - 1) * page_size).limit(page_size).to_list(page_size)
    owner_ids = [c.get("owner_id") for c in clubs if c.get("owner_id")]
    owners = await db.users.find({"id": {"$in": owner_ids}}, {"_id": 0, "id": 1, "email": 1, "name": 1}).to_list(len(owner_ids) or 1)
    owners_by_id = {o["id"]: o for o in owners}
    for c in clubs:
        owner = owners_by_id.get(c.get("owner_id"), {})
        c["owner_email"] = owner.get("email", "")
        c["owner_name"] = owner.get("name", "")
        c["members_count"] = await db.members.count_documents({"club_id": c["id"]})
    return {"items": clubs, "total": total, "page": page, "page_size": page_size}


@router.delete("/clubs/{club_id}")
async def delete_club(club_id: str, user: dict = Depends(platform_admin_user)):
    db = get_db()
    club = await db.clubs.find_one({"id": club_id}, {"_id": 0})
    if not club:
        raise HTTPException(404, "Club introuvable")
    await delete_club_cascade(club_id)
    return {"ok": True}


@router.put("/clubs/{club_id}/subscription")
async def update_subscription(club_id: str, payload: dict, user: dict = Depends(platform_admin_user)):
    status = payload.get("status")
    if status not in {"trial", "active", "past_due"}:
        raise HTTPException(400, "Statut invalide")
    db = get_db()
    result = await db.clubs.update_one({"id": club_id}, {"$set": {"subscription_status": status}})
    if result.matched_count == 0:
        raise HTTPException(404, "Club introuvable")
    return {"ok": True, "status": status}


@router.put("/clubs/{club_id}/plan")
async def override_plan(club_id: str, payload: dict, user: dict = Depends(platform_admin_user)):
    """Manual plan override (support / edge cases) — bypasses the normal trial/checkout flow."""
    plan = payload.get("plan")
    if plan not in {"free", "trial", "paid"}:
        raise HTTPException(400, "Plan invalide")
    db = get_db()
    update = {"plan": plan}
    if plan == "paid":
        update["subscription_status"] = "active"
    result = await db.clubs.update_one({"id": club_id}, {"$set": update})
    if result.matched_count == 0:
        raise HTTPException(404, "Club introuvable")
    return {"ok": True, "plan": plan}


@router.get("/users")
async def list_users(q: str = "", page: int = 1, page_size: int = 20, user: dict = Depends(platform_admin_user)):
    db = get_db()
    query = {}
    if q:
        query["email"] = {"$regex": q.strip(), "$options": "i"}
    page = max(1, page)
    page_size = min(max(1, page_size), 100)
    total = await db.users.count_documents(query)
    users = await db.users.find(query, {"_id": 0, "password_hash": 0}).sort("created_at", -1).skip((page - 1) * page_size).limit(page_size).to_list(page_size)
    return {"items": users, "total": total, "page": page, "page_size": page_size}


@router.get("/notifications")
async def platform_notifications(
    limit: int = Query(100, ge=1, le=500),
    channel: str = Query("", pattern="^(email|sms|)$"),
    status: str = Query("", pattern="^(sent|simulated|skipped|error|)$"),
    user: dict = Depends(platform_admin_user),
):
    db = get_db()
    query = {}
    if channel:
        query["channel"] = channel
    if status:
        query["status"] = status
    logs = await db.notification_logs.find(query, {"_id": 0}).sort("created_at", -1).to_list(limit)
    club_ids = list({l.get("club_id") for l in logs if l.get("club_id")})
    clubs = await db.clubs.find({"id": {"$in": club_ids}}, {"_id": 0, "id": 1, "name": 1}).to_list(len(club_ids) or 1)
    names_by_id = {c["id"]: c["name"] for c in clubs}
    for l in logs:
        l["club_name"] = names_by_id.get(l.get("club_id"), "")
    return logs


@router.get("/notifications/stats")
async def platform_notifications_stats(days: int = Query(30, ge=1, le=365), user: dict = Depends(platform_admin_user)):
    db = get_db()
    since = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()
    pipeline = [
        {"$match": {"created_at": {"$gte": since}}},
        {"$group": {"_id": {"channel": "$channel", "status": "$status"}, "count": {"$sum": 1}}},
    ]
    rows = await db.notification_logs.aggregate(pipeline).to_list(50)
    out = {
        "email": {"sent": 0, "simulated": 0, "skipped": 0, "error": 0, "total": 0},
        "sms":   {"sent": 0, "simulated": 0, "skipped": 0, "error": 0, "total": 0},
        "days": days,
    }
    for r in rows:
        ch, st = r["_id"]["channel"], r["_id"]["status"]
        if ch in out and st in out[ch]:
            out[ch][st] = r["count"]
            out[ch]["total"] += r["count"]
    return out


# ---- Support tickets ----
@router.post("/support")
async def submit_support_ticket(data: SupportTicketCreate, user: dict = Depends(current_user)):
    """Any logged-in user (a club admin) can report a problem from Aide."""
    db = get_db()
    club_name = ""
    if user.get("club_id"):
        club = await db.clubs.find_one({"id": user["club_id"]}, {"_id": 0, "name": 1})
        club_name = (club or {}).get("name", "")
    ticket = SupportTicket(
        subject=data.subject, message=data.message,
        club_id=user.get("club_id"), club_name=club_name,
        user_id=user["id"], user_name=user.get("name", ""), user_email=user.get("email", ""),
    )
    await db.support_tickets.insert_one(serialize(ticket))
    admins = await db.users.find({"is_platform_admin": True}, {"_id": 0, "email": 1}).to_list(20)
    for admin in admins:
        if admin.get("email"):
            asyncio.create_task(send_email(
                admin["email"], f"[Support] {data.subject}", support_ticket_html(ticket.model_dump()),
                kind="support_ticket",
            ))
    return {"ok": True}


@router.get("/support")
async def list_support_tickets(status: str = "", user: dict = Depends(platform_admin_user)):
    db = get_db()
    query = {}
    if status:
        query["status"] = status
    return await db.support_tickets.find(query, {"_id": 0}).sort("created_at", -1).to_list(500)


@router.put("/support/{ticket_id}")
async def update_support_ticket(ticket_id: str, payload: dict, user: dict = Depends(platform_admin_user)):
    status = payload.get("status")
    if status not in {"new", "replied", "resolved"}:
        raise HTTPException(400, "Statut invalide")
    db = get_db()
    result = await db.support_tickets.update_one({"id": ticket_id}, {"$set": {"status": status}})
    if result.matched_count == 0:
        raise HTTPException(404, "Ticket introuvable")
    return {"ok": True}


@router.post("/support/{ticket_id}/reply")
async def reply_support_ticket(ticket_id: str, payload: dict, user: dict = Depends(platform_admin_user)):
    message = (payload.get("message") or "").strip()
    if not message:
        raise HTTPException(400, "Message requis")
    db = get_db()
    ticket = await db.support_tickets.find_one({"id": ticket_id}, {"_id": 0})
    if not ticket:
        raise HTTPException(404, "Ticket introuvable")
    reply = {"from": "admin", "author": user.get("name", "Équipe ClubPaper"), "message": message, "created_at": datetime.now(timezone.utc).isoformat()}
    await db.support_tickets.update_one(
        {"id": ticket_id},
        {"$push": {"replies": reply}, "$set": {"status": "replied"}},
    )
    if ticket.get("user_email"):
        asyncio.create_task(send_email(
            ticket["user_email"], f"Re: {ticket.get('subject','')}", support_reply_html(ticket, message),
            club_id=ticket.get("club_id") or "", kind="support_reply",
        ))
    return {"ok": True, "reply": reply}


# ---- Sales employees ----
@router.post("/employees")
async def create_employee(data: EmployeeCreate, user: dict = Depends(platform_admin_user)):
    db = get_db()
    email = data.email.lower()
    if await db.users.find_one({"email": email}):
        raise HTTPException(400, "Un compte existe déjà avec cet email")
    employee = User(email=email, name=data.name, role="sales", is_sales_employee=True)
    doc = serialize(employee)
    doc["password_hash"] = hash_password(data.password)
    await db.users.insert_one(doc)
    return employee.model_dump()


@router.get("/employees")
async def list_employees(user: dict = Depends(platform_admin_user)):
    db = get_db()
    return await db.users.find({"is_sales_employee": True}, {"_id": 0, "password_hash": 0}).sort("created_at", -1).to_list(200)


@router.delete("/employees/{employee_id}")
async def delete_employee(employee_id: str, user: dict = Depends(platform_admin_user)):
    db = get_db()
    result = await db.users.delete_one({"id": employee_id, "is_sales_employee": True})
    if result.deleted_count == 0:
        raise HTTPException(404, "Employé introuvable")
    await db.leads.update_many({"assigned_to_user_id": employee_id}, {"$set": {"assigned_to_user_id": None, "assigned_to_name": ""}})
    return {"ok": True}


# ---- Leads (prospecting CSV import + call tracking) ----
def _lead_field(row: dict, *candidates: str) -> str:
    for c in candidates:
        if c in row and row[c]:
            return row[c].strip()
    return ""


@router.post("/leads/import")
async def import_leads(file: UploadFile = File(...), user: dict = Depends(platform_admin_user)):
    """CSV import — matches the columns produced by leads/extract_clubs_sportifs_rna.py
    (nom;objet;adresse;code_postal;commune;site_web;date_creation;id_rna;...), semicolon-
    separated. Also tolerates generic English/French header variants and optional
    phone/email columns if the admin adds them by hand before importing.
    """
    db = get_db()
    raw = await file.read()
    text = raw.decode("utf-8-sig", errors="ignore")
    # Auto-detect the delimiter (the RNA export uses ';', a generic CSV may use ',').
    sample = text[:2000]
    delimiter = ";" if sample.count(";") >= sample.count(",") else ","
    reader = csv.DictReader(io.StringIO(text), delimiter=delimiter)
    rows = list(reader)

    # One round trip to know which external_ids already exist, instead of a
    # find_one per row — matters once the CSV has thousands of rows (a full
    # department-wide RNA export easily does).
    candidate_ids = {
        _lead_field({(k or "").strip().lower(): (v or "").strip() for k, v in row.items()}, "id_rna", "external_id", "id")
        for row in rows
    }
    candidate_ids.discard("")
    existing_ids = set()
    if candidate_ids:
        existing_ids = {
            d["external_id"] async for d in db.leads.find({"external_id": {"$in": list(candidate_ids)}}, {"_id": 0, "external_id": 1})
        }

    to_insert = []
    seen_in_batch = set()
    skipped_duplicates = 0
    errors = 0
    for row in rows:
        try:
            row_norm = {(k or "").strip().lower(): (v or "").strip() for k, v in row.items()}
            name = _lead_field(row_norm, "nom", "name", "titre", "title")
            if not name:
                errors += 1
                continue
            external_id = _lead_field(row_norm, "id_rna", "external_id", "id")
            if external_id and (external_id in existing_ids or external_id in seen_in_batch):
                skipped_duplicates += 1
                continue
            if external_id:
                seen_in_batch.add(external_id)
            lead = Lead(
                name=name,
                email=_lead_field(row_norm, "email", "mail"),
                phone=_lead_field(row_norm, "telephone", "téléphone", "phone", "tel"),
                address=_lead_field(row_norm, "adresse", "address"),
                postal_code=_lead_field(row_norm, "code_postal", "postal_code", "cp"),
                city=_lead_field(row_norm, "commune", "ville", "city"),
                website=_lead_field(row_norm, "site_web", "website", "web"),
                description=_lead_field(row_norm, "objet", "description"),
                source="rna_import" if external_id else "csv_import",
                external_id=external_id,
            )
            to_insert.append(serialize(lead))
        except Exception as e:
            logger.warning("lead import row failed: %s", e)
            errors += 1

    if to_insert:
        await db.leads.insert_many(to_insert)

    return {"imported": len(to_insert), "skipped_duplicates": skipped_duplicates, "errors": errors}


@router.get("/leads")
async def list_leads(
    q: str = "",
    status: str = "",
    has_phone: bool = False,
    assigned_to_me: bool = False,
    page: int = 1,
    page_size: int = 30,
    user: dict = Depends(sales_user),
):
    db = get_db()
    query = {}
    if status:
        query["status"] = status
    if has_phone:
        query["phone"] = {"$nin": ["", None]}
    if assigned_to_me:
        query["assigned_to_user_id"] = user["id"]
    if q:
        safe = q.strip()
        query["$or"] = [
            {"name": {"$regex": safe, "$options": "i"}},
            {"city": {"$regex": safe, "$options": "i"}},
            {"email": {"$regex": safe, "$options": "i"}},
        ]
    page = max(1, page)
    page_size = min(max(1, page_size), 100)
    total = await db.leads.count_documents(query)
    items = await db.leads.find(query, {"_id": 0}).sort("created_at", -1).skip((page - 1) * page_size).limit(page_size).to_list(page_size)
    counts_by_status = {s: await db.leads.count_documents({**query, "status": s}) for s in LEAD_STATUSES}
    return {"items": items, "total": total, "page": page, "page_size": page_size, "counts_by_status": counts_by_status}


@router.put("/leads/{lead_id}")
async def update_lead(lead_id: str, payload: dict, user: dict = Depends(sales_user)):
    """Update status/notes/contact info — touching a lead claims it for the current employee."""
    allowed = {"status", "notes", "email", "phone", "name", "address", "postal_code", "city", "website"}
    update = {k: v for k, v in payload.items() if k in allowed}
    if "status" in update and update["status"] not in LEAD_STATUSES:
        raise HTTPException(400, "Statut invalide")
    update["assigned_to_user_id"] = user["id"]
    update["assigned_to_name"] = user.get("name", "")
    update["updated_at"] = datetime.now(timezone.utc).isoformat()
    if "status" in update or "notes" in update:
        update["last_contacted_at"] = datetime.now(timezone.utc).isoformat()
    db = get_db()
    result = await db.leads.update_one({"id": lead_id}, {"$set": update})
    if result.matched_count == 0:
        raise HTTPException(404, "Lead introuvable")
    return await db.leads.find_one({"id": lead_id}, {"_id": 0})


@router.delete("/leads/{lead_id}")
async def delete_lead(lead_id: str, user: dict = Depends(platform_admin_user)):
    db = get_db()
    await db.leads.delete_one({"id": lead_id})
    return {"ok": True}


def _places_lookup(name: str, city: str, api_key: str) -> dict:
    """Find a club on Google Places by name+city and return its phone/website,
    if any. Best-effort, synchronous (run via asyncio.to_thread by the caller)."""
    query = f"{name} {city}".strip()
    find_resp = requests.get(
        "https://maps.googleapis.com/maps/api/place/findplacefromtext/json",
        params={"input": query, "inputtype": "textquery", "fields": "place_id", "key": api_key},
        timeout=10,
    ).json()
    candidates = find_resp.get("candidates") or []
    if find_resp.get("status") != "OK" or not candidates:
        return {}
    place_id = candidates[0]["place_id"]
    details_resp = requests.get(
        "https://maps.googleapis.com/maps/api/place/details/json",
        params={"place_id": place_id, "fields": "formatted_phone_number,international_phone_number,website", "key": api_key},
        timeout=10,
    ).json()
    if details_resp.get("status") != "OK":
        return {}
    result = details_resp.get("result") or {}
    return {
        "phone": result.get("formatted_phone_number") or result.get("international_phone_number") or "",
        "website": result.get("website") or "",
    }


@router.post("/leads/enrich")
async def enrich_leads(payload: dict, user: dict = Depends(platform_admin_user)):
    """Fill in missing phone/website for a batch of leads via Google Places
    (the RNA source has neither — see leads/extract_clubs_sportifs_rna.py).
    Best-effort: a lead left empty just means Google has no matching listing.
    """
    api_key = os.environ.get("GOOGLE_PLACES_API_KEY", "")
    if not api_key:
        raise HTTPException(500, "GOOGLE_PLACES_API_KEY n'est pas configurée côté serveur.")

    lead_ids = payload.get("lead_ids") or []
    if not lead_ids:
        raise HTTPException(400, "Aucun lead sélectionné")
    if len(lead_ids) > 200:
        raise HTTPException(400, "Limite de 200 leads par enrichissement (l'API Google est facturée à l'appel).")

    db = get_db()
    leads = await db.leads.find({"id": {"$in": lead_ids}}, {"_id": 0}).to_list(len(lead_ids))
    enriched, unchanged, errors = 0, 0, 0
    for lead in leads:
        try:
            found = await asyncio.to_thread(_places_lookup, lead["name"], lead.get("city", ""), api_key)
            update = {}
            if found.get("phone") and not lead.get("phone"):
                update["phone"] = found["phone"]
            if found.get("website") and not lead.get("website"):
                update["website"] = found["website"]
            if update:
                update["updated_at"] = datetime.now(timezone.utc).isoformat()
                await db.leads.update_one({"id": lead["id"]}, {"$set": update})
                enriched += 1
            else:
                unchanged += 1
        except Exception as e:
            logger.warning("lead enrichment failed for %s: %s", lead.get("id"), e)
            errors += 1
        await asyncio.sleep(0.05)  # stay comfortably under Google's QPS limits

    return {"enriched": enriched, "unchanged": unchanged, "errors": errors}


@router.post("/leads/campaign")
async def send_lead_campaign(payload: dict, user: dict = Depends(platform_admin_user)):
    """Send the prospecting email to a batch of leads that have an email address."""
    lead_ids = payload.get("lead_ids") or []
    if not lead_ids:
        raise HTTPException(400, "Aucun lead sélectionné")
    db = get_db()
    leads = await db.leads.find({"id": {"$in": lead_ids}}, {"_id": 0}).to_list(len(lead_ids))
    landing_url = frontend_url() or "https://clubpaper.fr"
    sent, skipped = 0, 0
    now = datetime.now(timezone.utc).isoformat()
    for lead in leads:
        if not lead.get("email"):
            skipped += 1
            continue
        await send_email(
            lead["email"], "Simplifiez la gestion de votre club — essai gratuit ClubPaper",
            lead_campaign_html(lead["name"], landing_url, user.get("name", "")),
            kind="lead_campaign",
        )
        await db.leads.update_one({"id": lead["id"]}, {"$set": {"campaign_sent_at": now}})
        sent += 1
    return {"sent": sent, "skipped_no_email": skipped}


@router.get("/leads/campaign-stats")
async def campaign_stats(user: dict = Depends(platform_admin_user)):
    """Campaign performance: real send outcomes from the notification log,
    plus the lead-qualification funnel for everyone who was emailed.

    Honest limitation: there is no inbound-email tracking set up, so this
    cannot show opens/replies in the email-client sense — "qualifiés après
    la campagne" means their status changed after being emailed (a real
    signal from call follow-ups), not a tracked email reply.
    """
    db = get_db()

    send_pipeline = [
        {"$match": {"kind": "lead_campaign"}},
        {"$group": {"_id": "$status", "count": {"$sum": 1}}},
    ]
    send_rows = await db.notification_logs.aggregate(send_pipeline).to_list(20)
    sends_by_status = {r["_id"]: r["count"] for r in send_rows}

    campaigned = await db.leads.find({"campaign_sent_at": {"$ne": None}}, {"_id": 0}).to_list(100000)
    funnel = {s: 0 for s in LEAD_STATUSES}
    for lead in campaigned:
        funnel[lead.get("status", "new")] = funnel.get(lead.get("status", "new"), 0) + 1

    converted = sorted(
        [l for l in campaigned if l.get("status") == "converted"],
        key=lambda l: l.get("updated_at", ""), reverse=True,
    )

    return {
        "total_emails_sent": sends_by_status.get("sent", 0),
        "total_emails_error": sends_by_status.get("error", 0),
        "total_emails_simulated": sends_by_status.get("simulated", 0),
        "total_leads_campaigned": len(campaigned),
        "funnel": funnel,
        "converted_clients": [
            {"id": l["id"], "name": l["name"], "city": l.get("city", ""), "email": l.get("email", ""),
             "campaign_sent_at": l.get("campaign_sent_at"), "converted_at": l.get("updated_at")}
            for l in converted
        ],
    }
