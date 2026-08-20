"""Shared FastAPI dependencies + helpers."""
import os
import re
from datetime import datetime
from typing import Optional
from fastapi import HTTPException, Request

from auth_utils import get_current_user
from database import get_db


def frontend_url() -> str:
    """Return a single, clean frontend origin from FRONTEND_URL.

    Defensive against misconfiguration (e.g. a comma-separated list like
    CORS_ORIGINS accidentally pasted here) — always returns exactly one
    trimmed, slash-free origin so OAuth redirect URLs never come out mangled.
    """
    raw = (os.environ.get("FRONTEND_URL") or "").split(",")[0].strip().rstrip("/")
    return raw


def slugify(text: str) -> str:
    text = (text or "").lower().strip()
    text = re.sub(r"[àâä]", "a", text)
    text = re.sub(r"[éèêë]", "e", text)
    text = re.sub(r"[îï]", "i", text)
    text = re.sub(r"[ôö]", "o", text)
    text = re.sub(r"[ûüù]", "u", text)
    text = re.sub(r"ç", "c", text)
    text = re.sub(r"[^a-z0-9]+", "-", text)
    return text.strip("-")[:60] or "club"


def clean_doc(d: Optional[dict]) -> Optional[dict]:
    if not d:
        return d
    d.pop("_id", None)
    return d


def serialize(model) -> dict:
    """Serialize a Pydantic instance for MongoDB (datetime -> ISO str)."""
    d = model.model_dump()
    for k, v in list(d.items()):
        if isinstance(v, datetime):
            d[k] = v.isoformat()
    return d


async def current_user(request: Request):
    return await get_current_user(request, get_db())


async def platform_admin_user(request: Request):
    user = await get_current_user(request, get_db())
    if not user.get("is_platform_admin"):
        raise HTTPException(403, "Réservé à l'administrateur de la plateforme")
    return user


async def get_user_club(user: dict) -> dict:
    if not user.get("club_id"):
        raise HTTPException(400, "Aucun club associé à cet utilisateur")
    club = await get_db().clubs.find_one({"id": user["club_id"]}, {"_id": 0})
    if not club:
        raise HTTPException(404, "Club introuvable")
    return club


async def unique_club_slug(base: str) -> str:
    s = base
    n = 1
    while await get_db().clubs.find_one({"slug": s}):
        n += 1
        s = f"{base}-{n}"
    return s


async def delete_club_cascade(club_id: str):
    """Permanently delete a club and everything tied to it: members, fees,
    sessions, announcements, blog posts, documents, prospects, payment
    transactions, Drive/Calendar credentials, and every user account linked
    to the club. Used both by the platform-admin panel and self-service
    account deletion.
    """
    db = get_db()
    await db.members.delete_many({"club_id": club_id})
    await db.fees.delete_many({"club_id": club_id})
    await db.sessions.delete_many({"club_id": club_id})
    await db.announcements.delete_many({"club_id": club_id})
    await db.blog_posts.delete_many({"club_id": club_id})
    await db.documents.delete_many({"club_id": club_id})
    await db.prospects.delete_many({"club_id": club_id})
    await db.payment_transactions.delete_many({"club_id": club_id})
    await db.drive_credentials.delete_many({"club_id": club_id})
    await db.calendar_credentials.delete_many({"club_id": club_id})
    await db.users.delete_many({"club_id": club_id})
    await db.clubs.delete_one({"id": club_id})


def cookie_kwargs():
    return dict(httponly=True, secure=True, samesite="none", path="/")
