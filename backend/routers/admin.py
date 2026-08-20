"""Platform-owner admin — cross-club stats, subscriptions, notification logs, support tickets.

Everything here is gated by `platform_admin_user` (User.is_platform_admin), which is
distinct from a club's own "admin" (bureau) role — a club admin has no access to this router.
"""
import asyncio
from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, HTTPException, Depends, Query

from database import get_db
from deps import platform_admin_user, current_user, serialize, delete_club_cascade
from models import SupportTicketCreate, SupportTicket
from email_utils import send_email, support_ticket_html, support_reply_html

router = APIRouter(prefix="/admin", tags=["admin"])

MONTHLY_PRICE_EUR = 19.0


@router.get("/stats")
async def stats(user: dict = Depends(platform_admin_user)):
    db = get_db()
    total_clubs = await db.clubs.count_documents({})
    total_users = await db.users.count_documents({})
    total_members = await db.members.count_documents({})

    active_clubs = await db.clubs.count_documents({"subscription_status": "active"})
    trial_clubs = await db.clubs.count_documents({"subscription_status": "trial"})
    past_due_clubs = await db.clubs.count_documents({"subscription_status": "past_due"})
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
        "mrr_estimate": mrr,
        "chart": chart,
    }


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
