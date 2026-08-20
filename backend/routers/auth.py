"""Auth routes."""
import os
from fastapi import APIRouter, HTTPException, Response, Depends
from models import UserCreate, UserLogin, User
from auth_utils import hash_password, verify_password, create_access_token
from database import get_db
from deps import current_user, serialize, cookie_kwargs, clean_doc

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register")
async def register(data: UserCreate, response: Response):
    db = get_db()
    email = data.email.lower()
    if await db.users.find_one({"email": email}):
        raise HTTPException(400, "Un compte existe déjà avec cet email")
    user = User(email=email, name=data.name, role="admin")
    doc = serialize(user)
    doc["password_hash"] = hash_password(data.password)
    await db.users.insert_one(doc)
    token = create_access_token(user.id, email)
    response.set_cookie("access_token", token, max_age=604800, **cookie_kwargs())
    return {"user": user.model_dump(), "token": token}


@router.post("/login")
async def login(data: UserLogin, response: Response):
    db = get_db()
    email = data.email.lower()
    user = await db.users.find_one({"email": email})
    if not user or not verify_password(data.password, user.get("password_hash", "")):
        raise HTTPException(401, "Email ou mot de passe incorrect")
    token = create_access_token(user["id"], email)
    response.set_cookie("access_token", token, max_age=604800, **cookie_kwargs())
    clean_doc(user)
    user.pop("password_hash", None)
    return {"user": user, "token": token}


@router.post("/google")
async def google_login(payload: dict, response: Response):
    """Login/register via Google Identity Services ID token."""
    from google.oauth2 import id_token as google_id_token
    from google.auth.transport import requests as google_requests

    credential = payload.get("credential")
    if not credential:
        raise HTTPException(400, "Jeton Google manquant")

    client_id = os.environ.get("GOOGLE_CLIENT_ID", "")
    if not client_id:
        raise HTTPException(500, "Connexion Google non configurée sur la plateforme")

    try:
        idinfo = google_id_token.verify_oauth2_token(
            credential, google_requests.Request(), client_id
        )
    except ValueError:
        raise HTTPException(401, "Jeton Google invalide")

    email = (idinfo.get("email") or "").lower()
    if not email:
        raise HTTPException(400, "Email Google introuvable")
    if not idinfo.get("email_verified", False):
        raise HTTPException(401, "Email Google non vérifié")

    db = get_db()
    user = await db.users.find_one({"email": email})
    if not user:
        new_user = User(email=email, name=idinfo.get("name") or email.split("@")[0], role="admin")
        doc = serialize(new_user)
        doc["password_hash"] = ""
        await db.users.insert_one(doc)
        user = doc

    token = create_access_token(user["id"], email)
    response.set_cookie("access_token", token, max_age=604800, **cookie_kwargs())
    clean_doc(user)
    user.pop("password_hash", None)
    return {"user": user, "token": token}


@router.post("/logout")
async def logout(response: Response):
    response.delete_cookie("access_token", path="/")
    return {"ok": True}


@router.get("/me")
async def me(user: dict = Depends(current_user)):
    db = get_db()
    club = None
    if user.get("club_id"):
        club = await db.clubs.find_one({"id": user["club_id"]}, {"_id": 0})
    return {"user": user, "club": club}


@router.post("/tour-seen")
async def mark_tour_seen(user: dict = Depends(current_user)):
    await get_db().users.update_one({"id": user["id"]}, {"$set": {"tour_seen": True}})
    return {"ok": True}


@router.post("/tour-reset")
async def reset_tour(user: dict = Depends(current_user)):
    await get_db().users.update_one({"id": user["id"]}, {"$set": {"tour_seen": False}})
    return {"ok": True}
