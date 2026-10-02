"""Personal admin mailbox — compose/send with attachments & CC, inbox via IMAP,
templates, and a personal signature. Gated to the platform admin (personal tool,
not a club feature).
"""
import asyncio
import logging
from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException, Depends, UploadFile, File, Form
from fastapi.responses import Response as FastAPIResponse
from typing import List

from database import get_db
from deps import platform_admin_user, serialize
from models import EmailTemplateCreate, EmailTemplate, SentEmail
from email_utils import send_personal_email
from storage import put_object, get_object
import imap_utils

router = APIRouter(prefix="/admin/mailbox", tags=["mailbox"])
logger = logging.getLogger(__name__)

MAX_ATTACHMENT_MB = 15


def _split_addresses(raw: str) -> list:
    return [a.strip() for a in (raw or "").split(",") if a.strip()]


# ---- Signature ----
@router.get("/signature")
async def get_signature(user: dict = Depends(platform_admin_user)):
    return {"signature": user.get("email_signature", "")}


@router.put("/signature")
async def update_signature(payload: dict, user: dict = Depends(platform_admin_user)):
    db = get_db()
    await db.users.update_one({"id": user["id"]}, {"$set": {"email_signature": payload.get("signature", "")}})
    return {"ok": True}


# ---- Templates ----
@router.get("/templates")
async def list_templates(user: dict = Depends(platform_admin_user)):
    db = get_db()
    return await db.email_templates.find({"user_id": user["id"]}, {"_id": 0}).sort("name", 1).to_list(200)


@router.post("/templates")
async def create_template(data: EmailTemplateCreate, user: dict = Depends(platform_admin_user)):
    db = get_db()
    tpl = EmailTemplate(**data.model_dump(), user_id=user["id"])
    await db.email_templates.insert_one(serialize(tpl))
    return tpl.model_dump()


@router.put("/templates/{template_id}")
async def update_template(template_id: str, data: EmailTemplateCreate, user: dict = Depends(platform_admin_user)):
    db = get_db()
    update = data.model_dump()
    update["updated_at"] = datetime.now(timezone.utc).isoformat()
    result = await db.email_templates.update_one({"id": template_id, "user_id": user["id"]}, {"$set": update})
    if result.matched_count == 0:
        raise HTTPException(404, "Modèle introuvable")
    return await db.email_templates.find_one({"id": template_id}, {"_id": 0})


@router.delete("/templates/{template_id}")
async def delete_template(template_id: str, user: dict = Depends(platform_admin_user)):
    db = get_db()
    await db.email_templates.delete_one({"id": template_id, "user_id": user["id"]})
    return {"ok": True}


# ---- Send + Sent folder ----
@router.post("/send")
async def send_mail(
    to: str = Form(...),
    cc: str = Form(""),
    subject: str = Form(...),
    body_html: str = Form(...),
    files: List[UploadFile] = File(default=[]),
    user: dict = Depends(platform_admin_user),
):
    db = get_db()
    to_list = _split_addresses(to)
    cc_list = _split_addresses(cc)
    if not to_list:
        raise HTTPException(400, "Au moins un destinataire est requis")

    attachments_raw = []
    attachments_meta = []
    for f in files:
        content = await f.read()
        if len(content) > MAX_ATTACHMENT_MB * 1024 * 1024:
            raise HTTPException(400, f"« {f.filename} » dépasse {MAX_ATTACHMENT_MB} Mo")
        content_type = f.content_type or "application/octet-stream"
        attachments_raw.append((f.filename or "fichier", content_type, content))
        path = f"clubmanager/mailbox/{user['id']}/{datetime.now(timezone.utc).timestamp()}-{f.filename}"
        try:
            result = await asyncio.to_thread(put_object, path, content, content_type)
            attachments_meta.append({"filename": f.filename, "content_type": content_type, "size": len(content), "storage_path": result.get("path", path)})
        except Exception as e:
            logger.warning("attachment storage failed (sending anyway): %s", e)
            attachments_meta.append({"filename": f.filename, "content_type": content_type, "size": len(content), "storage_path": ""})

    record = SentEmail(user_id=user["id"], to=to_list, cc=cc_list, subject=subject, body_html=body_html, attachments=attachments_meta)
    try:
        await send_personal_email(to_list, cc_list, subject, body_html, attachments_raw, sender_name=user.get("name", ""))
    except Exception as e:
        logger.error("personal email send failed: %s", e)
        record.status = "error"
        record.error = str(e)
        await db.sent_emails.insert_one(serialize(record))
        raise HTTPException(502, f"Échec de l'envoi : {e}")

    await db.sent_emails.insert_one(serialize(record))
    return record.model_dump()


@router.get("/sent")
async def list_sent(user: dict = Depends(platform_admin_user)):
    db = get_db()
    return await db.sent_emails.find({"user_id": user["id"]}, {"_id": 0}).sort("created_at", -1).to_list(200)


@router.get("/sent/{email_id}/attachments/{index}")
async def download_sent_attachment(email_id: str, index: int, user: dict = Depends(platform_admin_user)):
    db = get_db()
    record = await db.sent_emails.find_one({"id": email_id, "user_id": user["id"]}, {"_id": 0})
    if not record or index >= len(record.get("attachments", [])):
        raise HTTPException(404, "Pièce jointe introuvable")
    meta = record["attachments"][index]
    if not meta.get("storage_path"):
        raise HTTPException(404, "Pièce jointe non disponible")
    data, content_type = await asyncio.to_thread(get_object, meta["storage_path"])
    return FastAPIResponse(
        content=data, media_type=meta.get("content_type", content_type),
        headers={"Content-Disposition": f'attachment; filename="{meta["filename"]}"'},
    )


# ---- Inbox (IMAP, read-only) ----
@router.get("/inbox")
async def inbox(limit: int = 30, offset: int = 0, user: dict = Depends(platform_admin_user)):
    try:
        return await _run_imap(imap_utils.list_inbox, limit, offset)
    except Exception as e:
        raise HTTPException(502, f"Impossible de lire la boîte de réception : {e}")


@router.get("/inbox/{uid}")
async def inbox_message(uid: str, user: dict = Depends(platform_admin_user)):
    try:
        return await _run_imap(imap_utils.get_message, uid)
    except Exception as e:
        raise HTTPException(502, f"Impossible de lire ce message : {e}")


@router.get("/inbox/{uid}/attachments/{index}")
async def inbox_attachment(uid: str, index: int, user: dict = Depends(platform_admin_user)):
    try:
        filename, content_type, data = await _run_imap(imap_utils.get_attachment, uid, index)
    except Exception as e:
        raise HTTPException(502, f"Impossible de récupérer la pièce jointe : {e}")
    return FastAPIResponse(
        content=data, media_type=content_type,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


async def _run_imap(fn, *args):
    return await asyncio.to_thread(fn, *args)
