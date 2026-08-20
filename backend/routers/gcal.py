"""Google Calendar integration - OAuth flow + two-way sync of sessions (créneaux)."""
import os
import logging
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Depends, Query
from fastapi.responses import RedirectResponse

from database import get_db
from deps import current_user, get_user_club

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/calendar", tags=["calendar"])

SCOPES = ["https://www.googleapis.com/auth/calendar.events"]


def _client_config():
    client_id = os.environ.get("GOOGLE_CLIENT_ID", "")
    client_secret = os.environ.get("GOOGLE_CLIENT_SECRET", "")
    redirect_uri = os.environ.get("GOOGLE_CALENDAR_REDIRECT_URI") or os.environ.get("GOOGLE_DRIVE_REDIRECT_URI", "").replace("/drive/callback", "/calendar/callback")
    if not (client_id and client_secret and redirect_uri):
        return None, None
    return ({
        "web": {
            "client_id": client_id,
            "client_secret": client_secret,
            "auth_uri": "https://accounts.google.com/o/oauth2/auth",
            "token_uri": "https://oauth2.googleapis.com/token",
            "redirect_uris": [redirect_uri],
        }
    }, redirect_uri)


def _calendar_service_from_creds(creds_doc: dict):
    from google.oauth2.credentials import Credentials
    from google.auth.transport.requests import Request as GoogleRequest
    from googleapiclient.discovery import build

    creds = Credentials(
        token=creds_doc["access_token"],
        refresh_token=creds_doc.get("refresh_token"),
        token_uri=creds_doc.get("token_uri", "https://oauth2.googleapis.com/token"),
        client_id=creds_doc["client_id"],
        client_secret=creds_doc["client_secret"],
        scopes=creds_doc.get("scopes") or SCOPES,
    )
    if creds.expired and creds.refresh_token:
        creds.refresh(GoogleRequest())
    return creds, build("calendar", "v3", credentials=creds, cache_discovery=False)


async def get_service_for_club(club_id: str):
    """Return a Calendar API service for this club, or None if not connected."""
    doc = await get_db().calendar_credentials.find_one({"club_id": club_id})
    if not doc:
        return None
    creds, service = _calendar_service_from_creds(doc)
    if creds.token != doc.get("access_token"):
        await get_db().calendar_credentials.update_one(
            {"club_id": club_id},
            {"$set": {"access_token": creds.token,
                      "expiry": creds.expiry.isoformat() if creds.expiry else None,
                      "updated_at": datetime.now(timezone.utc).isoformat()}},
        )
    return service


def _event_body(club: dict, session: dict) -> dict:
    return {
        "summary": f"{session.get('title','')} ({'Match' if session.get('kind') == 'match' else 'Entraînement'})",
        "location": session.get("place", ""),
        "description": session.get("notes", "") or f"{club.get('name','')} — équipe {session.get('team') or 'toutes'}",
        "start": {"dateTime": session["start_at"]},
        "end": {"dateTime": session["end_at"]},
    }


async def sync_session_upsert(club: dict, session: dict):
    """Create or update the matching Google Calendar event for a session. Best-effort."""
    try:
        service = await get_service_for_club(club["id"])
        if not service:
            return
        body = _event_body(club, session)
        db = get_db()
        if session.get("google_event_id"):
            service.events().update(calendarId="primary", eventId=session["google_event_id"], body=body).execute()
        else:
            event = service.events().insert(calendarId="primary", body=body).execute()
            await db.sessions.update_one({"id": session["id"]}, {"$set": {"google_event_id": event["id"]}})
    except Exception as e:
        logger.warning("calendar sync (upsert) failed: %s", e)


async def sync_session_delete(club: dict, session: dict):
    """Delete the matching Google Calendar event for a session. Best-effort."""
    try:
        if not session.get("google_event_id"):
            return
        service = await get_service_for_club(club["id"])
        if not service:
            return
        service.events().delete(calendarId="primary", eventId=session["google_event_id"]).execute()
    except Exception as e:
        logger.warning("calendar sync (delete) failed: %s", e)


@router.get("/status")
async def status(user: dict = Depends(current_user)):
    club = await get_user_club(user)
    cfg, _ = _client_config()
    doc = await get_db().calendar_credentials.find_one({"club_id": club["id"]}, {"_id": 0})
    return {
        "platform_configured": cfg is not None,
        "club_connected": bool(doc),
        "connected_email": (doc or {}).get("account_email", ""),
        "updated_at": (doc or {}).get("updated_at"),
    }


@router.get("/connect")
async def connect(user: dict = Depends(current_user)):
    from google_auth_oauthlib.flow import Flow

    club = await get_user_club(user)
    cfg, redirect_uri = _client_config()
    if not cfg:
        raise HTTPException(500, "Google Agenda n'est pas configuré sur la plateforme (clés manquantes).")
    # autogenerate_code_verifier disabled: connect() and callback() use separate,
    # unrelated Flow instances (no shared session), so a PKCE code_verifier
    # generated here would never reach the token exchange in callback() below.
    flow = Flow.from_client_config(cfg, scopes=SCOPES, redirect_uri=redirect_uri, autogenerate_code_verifier=False)
    authorization_url, _ = flow.authorization_url(
        access_type="offline", include_granted_scopes="true", prompt="consent", state=club["id"],
    )
    return {"authorization_url": authorization_url}


@router.get("/callback")
async def callback(code: str = Query(...), state: str = Query(...)):
    from google_auth_oauthlib.flow import Flow
    db = get_db()
    club = await db.clubs.find_one({"id": state}, {"_id": 0})
    if not club:
        raise HTTPException(400, "Club introuvable")
    cfg, redirect_uri = _client_config()
    if not cfg:
        raise HTTPException(500, "Google Agenda n'est pas configuré")
    flow = Flow.from_client_config(cfg, scopes=None, redirect_uri=redirect_uri)
    try:
        flow.fetch_token(code=code)
    except Exception as e:
        logger.error("Calendar token exchange failed: %s", e)
        raise HTTPException(400, "Échec OAuth Google Agenda")
    creds = flow.credentials

    account_email = ""
    try:
        _, service = _calendar_service_from_creds({
            "access_token": creds.token, "refresh_token": creds.refresh_token,
            "token_uri": creds.token_uri, "client_id": creds.client_id,
            "client_secret": creds.client_secret, "scopes": creds.scopes,
        })
        cal = service.calendarList().get(calendarId="primary").execute()
        account_email = cal.get("id", "")
    except Exception:
        pass

    await db.calendar_credentials.update_one(
        {"club_id": state},
        {"$set": {
            "club_id": state,
            "account_email": account_email,
            "access_token": creds.token,
            "refresh_token": creds.refresh_token,
            "token_uri": creds.token_uri,
            "client_id": creds.client_id,
            "client_secret": creds.client_secret,
            "scopes": list(creds.scopes) if creds.scopes else SCOPES,
            "expiry": creds.expiry.isoformat() if creds.expiry else None,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }},
        upsert=True,
    )
    front = os.environ.get("FRONTEND_URL", "")
    return RedirectResponse(url=f"{front}/app/parametres?calendar_connected=1")


@router.post("/disconnect")
async def disconnect(user: dict = Depends(current_user)):
    club = await get_user_club(user)
    await get_db().calendar_credentials.delete_one({"club_id": club["id"]})
    return {"ok": True}
