"""Sessions (créneaux) + Announcements."""
import asyncio
import logging
from fastapi import APIRouter, HTTPException, Depends

from models import SessionCreate, Session as SessionModel, AnnouncementCreate, Announcement
from database import get_db
from deps import current_user, get_user_club, serialize
from email_utils import send_email, announcement_html, session_change_html
from sms_utils import send_sms, sms_configured, format_phone, announcement_sms, session_change_sms
from telegram_utils import send_club_telegram, telegram_configured
from sanitizer import sanitize_html
from routers.gcal import sync_session_upsert, sync_session_delete
from plan_limits import check_announcement_limit
import notify_channels as nc

router = APIRouter(tags=["activity"])
logger = logging.getLogger(__name__)


# ---- Sessions ----
@router.get("/sessions")
async def list_sessions(user: dict = Depends(current_user)):
    club = await get_user_club(user)
    return await get_db().sessions.find({"club_id": club["id"]}, {"_id": 0}).sort("start_at", 1).to_list(2000)


@router.post("/sessions")
async def create_session(data: SessionCreate, user: dict = Depends(current_user)):
    club = await get_user_club(user)
    s = SessionModel(**data.model_dump(), club_id=club["id"], created_by=user["id"])
    doc = serialize(s)
    await get_db().sessions.insert_one(doc)
    asyncio.create_task(sync_session_upsert(club, doc))
    return s.model_dump()


@router.put("/sessions/{session_id}")
async def update_session(session_id: str, data: SessionCreate, user: dict = Depends(current_user)):
    db = get_db()
    club = await get_user_club(user)
    upd = data.model_dump(exclude_unset=True)
    result = await db.sessions.update_one({"id": session_id, "club_id": club["id"]}, {"$set": upd})
    if result.matched_count == 0:
        raise HTTPException(404, "Créneau introuvable")
    updated = await db.sessions.find_one({"id": session_id}, {"_id": 0})
    asyncio.create_task(_notify_session_change(club, updated, "modifié"))
    asyncio.create_task(sync_session_upsert(club, updated))
    return updated


@router.delete("/sessions/{session_id}")
async def delete_session(session_id: str, user: dict = Depends(current_user)):
    db = get_db()
    club = await get_user_club(user)
    s = await db.sessions.find_one({"id": session_id, "club_id": club["id"]}, {"_id": 0})
    if not s:
        raise HTTPException(404, "Créneau introuvable")
    await db.sessions.delete_one({"id": session_id})
    asyncio.create_task(_notify_session_change(club, s, "annulé"))
    asyncio.create_task(sync_session_delete(club, s))
    return {"ok": True}


async def _notify_session_change(club: dict, session: dict, action: str):
    try:
        db = get_db()
        query = {"club_id": club["id"]}
        if session.get("team"):
            query["team"] = session["team"]
        members = await db.members.find(query, {"_id": 0}).to_list(5000)
        channels = nc.resolve(club, "session_change")
        when = f"{session.get('start_at','')}"
        html = session_change_html(
            club["name"], f"{session['title']} ({action})",
            f"{session.get('start_at','')} → {session.get('end_at','')}",
            session.get("place", ""), session.get("notes", ""),
        )
        for m in members:
            await nc.notify_member(club, m, channels, subject=f"{club['name']} — Créneau {action}", email_html=html,
                                   sms_text=session_change_sms(club["name"], session["title"], when), kind="session_change")
        await nc.post_telegram(club, channels, f"📅 <b>{club['name']}</b> — créneau {action} : {session['title']}\n"
                               f"{session.get('start_at','')} → {session.get('end_at','')}"
                               + (f"\n📍 {session.get('place')}" if session.get("place") else ""), "session_change")
        if telegram_configured(club):
            await send_club_telegram(club, f"📅 Créneau {action}: {session['title']}\n{session.get('start_at','')} → {session.get('end_at','')}", kind="session_change")
    except Exception as e:
        logger.warning("session notify failed: %s", e)


# ---- Announcements ----
@router.get("/announcements")
async def list_announcements(user: dict = Depends(current_user)):
    club = await get_user_club(user)
    return await get_db().announcements.find({"club_id": club["id"]}, {"_id": 0}).sort("created_at", -1).to_list(500)


@router.post("/announcements")
async def create_announcement(data: AnnouncementCreate, user: dict = Depends(current_user)):
    club = await get_user_club(user)
    await check_announcement_limit(club)
    payload = data.model_dump()
    payload["body"] = sanitize_html(payload.get("body", ""))
    a = Announcement(
        **payload, club_id=club["id"],
        author_id=user["id"], author_name=user.get("name", "Bureau"),
    )
    # Canaux : ceux cochés dans le formulaire, sinon (ancien client) les défauts du club si send_email
    requested = data.channels if data.channels is not None else (None if data.send_email else [])
    channels = nc.resolve(club, "announcement", requested)
    a.channels = channels
    await get_db().announcements.insert_one(serialize(a))
    if channels:
        asyncio.create_task(_broadcast_announcement(club, a, channels))
    return a.model_dump()


@router.get("/notification-channels")
async def get_notification_channels(user: dict = Depends(current_user)):
    return nc.channels_view(await get_user_club(user))


@router.put("/notification-channels")
async def set_notification_channels(data: dict, user: dict = Depends(current_user)):
    """Canaux par défaut par type de message : {"announcement": ["email", "sms"], ...}."""
    club = await get_user_club(user)
    clean = {}
    for kind, chans in (data or {}).items():
        if kind in nc.KINDS and isinstance(chans, list):
            clean[kind] = [c for c in nc.CHANNELS if c in chans and c in nc.KINDS[kind]["allowed"]]
    current = club.get("notification_channels") or {}
    current.update(clean)
    await get_db().clubs.update_one({"id": club["id"]}, {"$set": {"notification_channels": current}})
    club["notification_channels"] = current
    return nc.channels_view(club)


async def _broadcast_announcement(club: dict, a: Announcement, channels: list):
    db = get_db()
    query = {"club_id": club["id"]}
    if a.audience.startswith("team:"):
        query["team"] = a.audience[5:]
    members = await db.members.find(query, {"_id": 0}).to_list(5000)
    html = announcement_html(club["name"], a.title, a.body)
    counts = {"email": 0, "sms": 0}
    for m in members:
        res = await nc.notify_member(club, m, channels, subject=f"{club['name']} — {a.title}", email_html=html,
                                     sms_text=announcement_sms(club["name"], a.title), kind="announcement")
        for ch, status in res.items():
            if status in ("sent", "queued", "simulated"):
                counts[ch] += 1
    delivery = {k: v for k, v in counts.items() if k in channels}
    team = f" ({a.audience[5:]})" if a.audience.startswith("team:") else ""
    tg = await nc.post_telegram(club, channels, f"📣 <b>{club['name']}{team}</b>\n<b>{a.title}</b>\n\n"
                                + nc.html_to_text(a.body).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;"),
                                "announcement")
    if tg:
        delivery["telegram"] = tg
    await db.announcements.update_one({"id": a.id}, {"$set": {"delivery": delivery}})
    if telegram_configured(club) and "telegram" not in channels:
        await send_club_telegram(club, f"📣 Nouvelle annonce: {a.title}", kind="announcement")
