"""Shared FastAPI dependencies + helpers."""
import re
from datetime import datetime
from typing import Optional
from fastapi import HTTPException, Request

from auth_utils import get_current_user
from database import get_db


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


def cookie_kwargs():
    return dict(httponly=True, secure=True, samesite="none", path="/")
