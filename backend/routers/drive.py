"""Google Drive integration - OAuth flow + list/download/upload."""
import os
import io
import logging
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Depends, Query, UploadFile, File
from fastapi.responses import RedirectResponse, Response as FastAPIResponse

from database import get_db
from deps import current_user, get_user_club

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/drive", tags=["drive"])

SCOPES = ["https://www.googleapis.com/auth/drive.file"]
# drive.file (restricted, not sensitive) grants access only to files this app creates
# itself or that the user explicitly opens via a Google Picker — not the whole Drive.
# Chosen over the full "drive" scope to avoid Google's mandatory paid security
# assessment for verification. list_files()/import_from_drive() below can only see
# app-created files or Picker-selected ones under this scope; they're not currently
# wired to any frontend UI, so this has no effect on the shipped Drive integration
# (document import via file upload, receipt export to the "ClubPaper - <club>" folder).


def _client_config():
    client_id = os.environ.get("GOOGLE_CLIENT_ID", "")
    client_secret = os.environ.get("GOOGLE_CLIENT_SECRET", "")
    redirect_uri = os.environ.get("GOOGLE_DRIVE_REDIRECT_URI", "")
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


def _drive_service_from_creds(creds_doc: dict):
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
    return creds, build("drive", "v3", credentials=creds, cache_discovery=False)


async def _get_service(club_id: str):
    db = get_db()
    doc = await db.drive_credentials.find_one({"club_id": club_id})
    if not doc:
        raise HTTPException(400, "Google Drive n'est pas connecté pour ce club")
    creds, service = _drive_service_from_creds(doc)
    if creds.token != doc.get("access_token"):
        await db.drive_credentials.update_one(
            {"club_id": club_id},
            {"$set": {"access_token": creds.token,
                      "expiry": creds.expiry.isoformat() if creds.expiry else None,
                      "updated_at": datetime.now(timezone.utc).isoformat()}},
        )
    return service


@router.get("/status")
async def status(user: dict = Depends(current_user)):
    """Return whether Drive is configured (platform keys) and connected (this club)."""
    club = await get_user_club(user)
    cfg, _ = _client_config()
    doc = await get_db().drive_credentials.find_one({"club_id": club["id"]}, {"_id": 0})
    return {
        "platform_configured": cfg is not None,
        "club_connected": bool(doc),
        "connected_email": (doc or {}).get("account_email", ""),
        "updated_at": (doc or {}).get("updated_at"),
    }


@router.get("/connect")
async def connect(user: dict = Depends(current_user)):
    """Start OAuth: return an authorization URL for the frontend to redirect to."""
    from google_auth_oauthlib.flow import Flow

    club = await get_user_club(user)
    cfg, redirect_uri = _client_config()
    if not cfg:
        raise HTTPException(500, "Google Drive n'est pas configuré sur la plateforme (clés manquantes).")
    # autogenerate_code_verifier disabled: the connect() and callback() requests use
    # separate, unrelated Flow instances (no shared session), so a PKCE code_verifier
    # generated here would never reach the token exchange in callback() below.
    flow = Flow.from_client_config(cfg, scopes=SCOPES, redirect_uri=redirect_uri, autogenerate_code_verifier=False)
    authorization_url, _ = flow.authorization_url(
        access_type="offline",
        include_granted_scopes="true",
        prompt="consent",
        state=club["id"],
    )
    return {"authorization_url": authorization_url}


@router.get("/callback")
async def callback(code: str = Query(...), state: str = Query(...)):
    """Google OAuth callback → exchange code, store credentials, redirect to app."""
    from google_auth_oauthlib.flow import Flow
    db = get_db()
    club = await db.clubs.find_one({"id": state}, {"_id": 0})
    if not club:
        raise HTTPException(400, "Club introuvable")
    cfg, redirect_uri = _client_config()
    if not cfg:
        raise HTTPException(500, "Google Drive n'est pas configuré")
    flow = Flow.from_client_config(cfg, scopes=None, redirect_uri=redirect_uri)
    try:
        flow.fetch_token(code=code)
    except Exception as e:
        logger.error("Drive token exchange failed: %s", e)
        raise HTTPException(400, "Échec OAuth Google Drive")
    creds = flow.credentials

    # Fetch account email for display
    account_email = ""
    try:
        _, service = _drive_service_from_creds({
            "access_token": creds.token, "refresh_token": creds.refresh_token,
            "token_uri": creds.token_uri, "client_id": creds.client_id,
            "client_secret": creds.client_secret, "scopes": creds.scopes,
        })
        about = service.about().get(fields="user").execute()
        account_email = (about.get("user") or {}).get("emailAddress", "")
    except Exception:
        pass

    await db.drive_credentials.update_one(
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
    return RedirectResponse(url=f"{front}/app/parametres?drive_connected=1")


@router.post("/disconnect")
async def disconnect(user: dict = Depends(current_user)):
    club = await get_user_club(user)
    await get_db().drive_credentials.delete_one({"club_id": club["id"]})
    return {"ok": True}


@router.get("/files")
async def list_files(
    q: str = Query("", description="Search query"),
    folder_id: str = Query("", description="Parent folder ID"),
    page_size: int = Query(50, ge=1, le=100),
    user: dict = Depends(current_user),
):
    club = await get_user_club(user)
    service = await _get_service(club["id"])
    query_parts = ["trashed = false"]
    if folder_id:
        query_parts.append(f"'{folder_id}' in parents")
    if q:
        safe = q.replace("'", "\\'")
        query_parts.append(f"name contains '{safe}'")
    full_query = " and ".join(query_parts)
    try:
        result = service.files().list(
            q=full_query, pageSize=page_size,
            fields="files(id, name, mimeType, size, modifiedTime, iconLink, webViewLink)",
            orderBy="modifiedTime desc",
        ).execute()
    except Exception as e:
        logger.error("drive list failed: %s", e)
        raise HTTPException(500, "Impossible de lister Google Drive")
    return {"files": result.get("files", [])}


@router.post("/import")
async def import_from_drive(payload: dict, user: dict = Depends(current_user)):
    """Import a Drive file as a member document."""
    from googleapiclient.http import MediaIoBaseDownload
    from storage import put_object, build_path
    from models import Document
    from deps import serialize

    file_id = payload.get("file_id")
    member_id = payload.get("member_id")
    kind = payload.get("kind", "other")
    if not file_id or not member_id:
        raise HTTPException(400, "file_id et member_id requis")

    db = get_db()
    club = await get_user_club(user)
    member = await db.members.find_one({"id": member_id, "club_id": club["id"]}, {"_id": 0})
    if not member:
        raise HTTPException(404, "Adhérent introuvable")

    service = await _get_service(club["id"])
    try:
        meta = service.files().get(fileId=file_id, fields="name, mimeType, size").execute()
        buf = io.BytesIO()
        request = service.files().get_media(fileId=file_id)
        downloader = MediaIoBaseDownload(buf, request)
        done = False
        while not done:
            _, done = downloader.next_chunk()
        data = buf.getvalue()
    except Exception as e:
        logger.error("drive import failed: %s", e)
        raise HTTPException(500, "Téléchargement Drive impossible")

    path = build_path(club["id"], f"members/{member_id}", meta.get("name", "file"))
    result = put_object(path, data, meta.get("mimeType", "application/octet-stream"))
    doc = Document(
        club_id=club["id"], member_id=member_id, kind=kind,
        original_filename=meta.get("name", "document"),
        storage_path=result["path"],
        content_type=meta.get("mimeType", "application/octet-stream"),
        size=int(meta.get("size", 0) or 0) or result.get("size", len(data)),
    )
    await db.documents.insert_one(serialize(doc))
    if kind == "medical_cert":
        await db.members.update_one({"id": member_id}, {"$set": {"medical_cert_status": "ok"}})
    return doc.model_dump()


@router.post("/export/receipt/{fee_id}")
async def export_receipt(fee_id: str, user: dict = Depends(current_user)):
    """Export a fee receipt PDF into the club's Drive."""
    from googleapiclient.http import MediaIoBaseUpload
    from pdf_utils import receipt_pdf

    db = get_db()
    club = await get_user_club(user)
    fee = await db.fees.find_one({"id": fee_id, "club_id": club["id"]}, {"_id": 0})
    if not fee:
        raise HTTPException(404, "Cotisation introuvable")
    member = await db.members.find_one({"id": fee["member_id"]}, {"_id": 0}) or {}
    data = receipt_pdf(club, member, fee)

    service = await _get_service(club["id"])
    folder_id = await _ensure_club_folder(service, club, subfolder="Recus")
    fname = f"recu-{member.get('last_name','')}-{fee.get('season','')}.pdf"
    try:
        media = MediaIoBaseUpload(io.BytesIO(data), mimetype="application/pdf", resumable=False)
        file = service.files().create(
            body={"name": fname, "parents": [folder_id]}, media_body=media,
            fields="id, webViewLink",
        ).execute()
    except Exception as e:
        logger.error("drive export failed: %s", e)
        raise HTTPException(500, "Envoi vers Drive impossible")
    return {"drive_file_id": file["id"], "url": file.get("webViewLink")}


async def _ensure_club_folder(service, club: dict, subfolder: str = "") -> str:
    """Return (creating if needed) the ID of the club's root folder, or a subfolder."""
    root_name = f"ClubPaper - {club['name']}"
    root = _find_folder(service, root_name, parent=None) or _create_folder(service, root_name, parent=None)
    if not subfolder:
        return root
    sub = _find_folder(service, subfolder, parent=root) or _create_folder(service, subfolder, parent=root)
    return sub


def _find_folder(service, name: str, parent):
    safe = name.replace("'", "\\'")
    q = f"mimeType = 'application/vnd.google-apps.folder' and name = '{safe}' and trashed = false"
    if parent:
        q += f" and '{parent}' in parents"
    r = service.files().list(q=q, fields="files(id)").execute()
    files = r.get("files", [])
    return files[0]["id"] if files else None


def _create_folder(service, name: str, parent):
    body = {"name": name, "mimeType": "application/vnd.google-apps.folder"}
    if parent:
        body["parents"] = [parent]
    r = service.files().create(body=body, fields="id").execute()
    return r["id"]
