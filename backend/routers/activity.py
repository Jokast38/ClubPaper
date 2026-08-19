"""Sessions (créneaux) + Announcements."""
import asyncio
import logging
from fastapi import APIRouter, HTTPException, Depends

from models import SessionCreate, Session as SessionModel, AnnouncementCreate, Announcement
from database import get_db
from deps import current_user, get_user_club, serialize
from email_utils import send_email, announcement_html, session_change_html
from sms_utils import send_sms, sms_configured, format_phone, announcement_sms, session_change_sms
from sanitizer import sanitize_html
from routers.gcal import sync_session_upsert, sync_session_delete

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
        sms_ok = sms_configured(club)
        when = f"{session.get('start_at','')}"
        for m in members:
            to = m.get("email") or m.get("parent_email")
            if to:
                html = session_change_html(
                    club["name"], f"{session['title']} ({action})",
                    f"{session.get('start_at','')} → {session.get('end_at','')}",
                    session.get("place", ""), session.get("notes", ""),
                )
                await send_email(to, f"{club['name']} — Créneau {action}", html, club_id=club["id"], kind="session_change")
            if sms_ok and m.get("phone"):
                await send_sms(club, format_phone(m["phone"]), session_change_sms(club["name"], session["title"], when), kind="session_change")
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
    payload = data.model_dump()
    payload["body"] = sanitize_html(payload.get("body", ""))
    a = Announcement(
        **payload, club_id=club["id"],
        author_id=user["id"], author_name=user.get("name", "Bureau"),
    )
    await get_db().announcements.insert_one(serialize(a))
    if data.send_email:
        asyncio.create_task(_broadcast_announcement(club, a))
    return a.model_dump()


async def _broadcast_announcement(club: dict, a: Announcement):
    db = get_db()
    query = {"club_id": club["id"]}
    if a.audience.startswith("team:"):
        query["team"] = a.audience[5:]
    members = await db.members.find(query, {"_id": 0}).to_list(5000)
    sms_ok = sms_configured(club)
    for m in members:
        to = m.get("email") or m.get("parent_email")
        if to:
            html = announcement_html(club["name"], a.title, a.body)
            await send_email(to, f"{club['name']} — {a.title}", html, club_id=club["id"], kind="announcement")
        if sms_ok and m.get("phone"):
            await send_sms(club, format_phone(m["phone"]), announcement_sms(club["name"], a.title), kind="announcement")
