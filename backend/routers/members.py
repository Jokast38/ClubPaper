"""Members CRUD + import CSV/XLSX + documents + PDFs."""
import io
import csv
import asyncio
import logging
from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException, Depends, UploadFile, File, Form
from fastapi.responses import Response as FastAPIResponse

from models import MemberCreate, Member, Document
from database import get_db
from deps import current_user, get_user_club, serialize
from storage import put_object, get_object, build_path, MIME_TYPES
from xlsx_import import parse_xlsx
from pdf_utils import receipt_pdf, member_sheet_pdf, license_pdf
from routers.drive import export_member_document

router = APIRouter(tags=["members"])
logger = logging.getLogger(__name__)


# ---- Members ----
@router.get("/members")
async def list_members(
    q: str = "",
    team: str = "",
    page: int = 1,
    page_size: int = 20,
    user: dict = Depends(current_user),
):
    db = get_db()
    club = await get_user_club(user)
    query = {"club_id": club["id"]}
    if team and team != "all":
        query["team"] = team
    if q:
        safe = q.strip()
        query["$or"] = [
            {"first_name": {"$regex": safe, "$options": "i"}},
            {"last_name": {"$regex": safe, "$options": "i"}},
            {"email": {"$regex": safe, "$options": "i"}},
        ]
    page = max(1, page)
    page_size = min(max(1, page_size), 200)
    total = await db.members.count_documents(query)
    items = await db.members.find(query, {"_id": 0}).sort("last_name", 1).skip((page - 1) * page_size).limit(page_size).to_list(page_size)
    return {"items": items, "total": total, "page": page, "page_size": page_size}


@router.get("/members/search")
async def search_members(q: str = "", user: dict = Depends(current_user)):
    """Lightweight autocomplete: name/email suggestions from the DB as the user types."""
    club = await get_user_club(user)
    if not q or len(q) < 2:
        return []
    safe = q.strip()
    query = {
        "club_id": club["id"],
        "$or": [
            {"first_name": {"$regex": safe, "$options": "i"}},
            {"last_name": {"$regex": safe, "$options": "i"}},
            {"email": {"$regex": safe, "$options": "i"}},
        ],
    }
    return await get_db().members.find(query, {"_id": 0, "id": 1, "first_name": 1, "last_name": 1, "email": 1, "team": 1}).sort("last_name", 1).to_list(10)


@router.post("/members/bulk-delete")
async def bulk_delete_members(payload: dict, user: dict = Depends(current_user)):
    ids = payload.get("ids") or []
    if not ids:
        raise HTTPException(400, "Aucun adhérent sélectionné")
    db = get_db()
    club = await get_user_club(user)
    result = await db.members.delete_many({"id": {"$in": ids}, "club_id": club["id"]})
    await db.fees.delete_many({"member_id": {"$in": ids}, "club_id": club["id"]})
    return {"deleted": result.deleted_count}


@router.delete("/members")
async def delete_all_members(user: dict = Depends(current_user)):
    """Wipe every member (and their fees) for the current club."""
    db = get_db()
    club = await get_user_club(user)
    member_ids = await db.members.find({"club_id": club["id"]}, {"_id": 0, "id": 1}).to_list(100000)
    result = await db.members.delete_many({"club_id": club["id"]})
    await db.fees.delete_many({"member_id": {"$in": [m["id"] for m in member_ids]}, "club_id": club["id"]})
    return {"deleted": result.deleted_count}


@router.post("/members")
async def create_member(data: MemberCreate, user: dict = Depends(current_user)):
    club = await get_user_club(user)
    m = Member(**data.model_dump(), club_id=club["id"])
    await get_db().members.insert_one(serialize(m))
    return m.model_dump()


@router.put("/members/{member_id}")
async def update_member(member_id: str, data: MemberCreate, user: dict = Depends(current_user)):
    db = get_db()
    club = await get_user_club(user)
    upd = data.model_dump(exclude_unset=True)
    result = await db.members.update_one({"id": member_id, "club_id": club["id"]}, {"$set": upd})
    if result.matched_count == 0:
        raise HTTPException(404, "Membre introuvable")
    return await db.members.find_one({"id": member_id}, {"_id": 0})


@router.delete("/members/{member_id}")
async def delete_member(member_id: str, user: dict = Depends(current_user)):
    db = get_db()
    club = await get_user_club(user)
    await db.members.delete_one({"id": member_id, "club_id": club["id"]})
    await db.fees.delete_many({"member_id": member_id, "club_id": club["id"]})
    return {"ok": True}


@router.post("/members/import")
async def import_members(file: UploadFile = File(...), user: dict = Depends(current_user)):
    db = get_db()
    club = await get_user_club(user)
    content = await file.read()
    text = content.decode("utf-8", errors="ignore")
    reader = csv.DictReader(io.StringIO(text))
    imported = 0
    errors = 0
    for row in reader:
        try:
            row_lower = {k.lower().strip(): (v or "").strip() for k, v in row.items() if k}
            fn = row_lower.get("prenom") or row_lower.get("prénom") or row_lower.get("first_name") or row_lower.get("firstname")
            ln = row_lower.get("nom") or row_lower.get("last_name") or row_lower.get("lastname")
            if not fn or not ln:
                errors += 1
                continue
            m = Member(
                first_name=fn, last_name=ln,
                email=row_lower.get("email", ""),
                phone=row_lower.get("telephone") or row_lower.get("téléphone") or row_lower.get("phone", ""),
                team=row_lower.get("equipe") or row_lower.get("équipe") or row_lower.get("team", ""),
                birth_date=row_lower.get("date_naissance") or row_lower.get("birth_date", ""),
                parent_name=row_lower.get("parent") or row_lower.get("parent_name", ""),
                parent_email=row_lower.get("parent_email", ""),
                club_id=club["id"],
            )
            await db.members.insert_one(serialize(m))
            imported += 1
        except Exception:
            errors += 1
    return {"imported": imported, "errors": errors}


@router.post("/members/import-xlsx")
async def import_members_xlsx(file: UploadFile = File(...), user: dict = Depends(current_user)):
    db = get_db()
    club = await get_user_club(user)
    content = await file.read()
    try:
        records = parse_xlsx(content)
    except Exception:
        raise HTTPException(400, "Fichier Excel invalide")
    imported = 0
    for rec in records:
        try:
            m = Member(**rec, club_id=club["id"])
            await db.members.insert_one(serialize(m))
            imported += 1
        except Exception:
            continue
    return {"imported": imported, "errors": max(0, len(records) - imported)}


# ---- Documents ----
@router.post("/members/{member_id}/documents")
async def upload_document(
    member_id: str,
    file: UploadFile = File(...),
    kind: str = Form("medical_cert"),
    user: dict = Depends(current_user),
):
    db = get_db()
    club = await get_user_club(user)
    member = await db.members.find_one({"id": member_id, "club_id": club["id"]}, {"_id": 0})
    if not member:
        raise HTTPException(404, "Adhérent introuvable")
    content = await file.read()
    if len(content) > 15 * 1024 * 1024:
        raise HTTPException(400, "Fichier trop volumineux (max 15 Mo)")
    ext = (file.filename or "file.bin").split(".")[-1].lower()
    content_type = file.content_type or MIME_TYPES.get(ext, "application/octet-stream")
    path = build_path(club["id"], f"members/{member_id}", file.filename or f"file.{ext}")
    try:
        result = put_object(path, content, content_type)
    except Exception as e:
        logger.error("upload failed: %s", e)
        raise HTTPException(500, "Impossible d'uploader le document")
    doc = Document(
        club_id=club["id"], member_id=member_id, kind=kind,
        original_filename=file.filename or f"document.{ext}",
        storage_path=result["path"], content_type=content_type,
        size=result.get("size", len(content)),
    )
    await db.documents.insert_one(serialize(doc))
    asyncio.create_task(export_member_document(club["id"], member, doc.original_filename, content, content_type))
    if kind == "medical_cert":
        await db.members.update_one({"id": member_id}, {"$set": {"medical_cert_status": "ok"}})
    return doc.model_dump()


@router.get("/members/{member_id}/documents")
async def list_member_documents(member_id: str, user: dict = Depends(current_user)):
    club = await get_user_club(user)
    return await get_db().documents.find(
        {"club_id": club["id"], "member_id": member_id, "is_deleted": False},
        {"_id": 0},
    ).sort("created_at", -1).to_list(200)


@router.delete("/documents/{doc_id}")
async def delete_document(doc_id: str, user: dict = Depends(current_user)):
    club = await get_user_club(user)
    await get_db().documents.update_one(
        {"id": doc_id, "club_id": club["id"]},
        {"$set": {"is_deleted": True}},
    )
    return {"ok": True}


@router.get("/documents/{doc_id}/download")
async def download_document(doc_id: str, user: dict = Depends(current_user)):
    club = await get_user_club(user)
    doc = await get_db().documents.find_one({"id": doc_id, "club_id": club["id"], "is_deleted": False}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Document introuvable")
    try:
        data, ct = get_object(doc["storage_path"])
    except Exception:
        raise HTTPException(500, "Impossible de télécharger")
    return FastAPIResponse(
        content=data, media_type=doc.get("content_type", ct),
        headers={"Content-Disposition": f'attachment; filename="{doc["original_filename"]}"'},
    )


# ---- PDFs ----
def _pdf_response(data: bytes, filename: str):
    return FastAPIResponse(
        content=data, media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/pdf/receipt/{fee_id}")
async def pdf_receipt(fee_id: str, user: dict = Depends(current_user)):
    db = get_db()
    club = await get_user_club(user)
    fee = await db.fees.find_one({"id": fee_id, "club_id": club["id"]}, {"_id": 0})
    if not fee:
        raise HTTPException(404, "Cotisation introuvable")
    member = await db.members.find_one({"id": fee["member_id"]}, {"_id": 0}) or {}
    data = receipt_pdf(club, member, fee)
    return _pdf_response(data, f"recu-{fee_id[:8]}.pdf")


@router.get("/pdf/member/{member_id}")
async def pdf_member(member_id: str, user: dict = Depends(current_user)):
    db = get_db()
    club = await get_user_club(user)
    member = await db.members.find_one({"id": member_id, "club_id": club["id"]}, {"_id": 0})
    if not member:
        raise HTTPException(404, "Adhérent introuvable")
    fees = await db.fees.find({"member_id": member_id, "club_id": club["id"]}, {"_id": 0}).to_list(50)
    data = member_sheet_pdf(club, member, fees)
    fname = f"fiche-{member.get('last_name','')}-{member.get('first_name','')}.pdf"
    return _pdf_response(data, fname)


@router.get("/pdf/license/{member_id}")
async def pdf_license(member_id: str, user: dict = Depends(current_user)):
    db = get_db()
    club = await get_user_club(user)
    member = await db.members.find_one({"id": member_id, "club_id": club["id"]}, {"_id": 0})
    if not member:
        raise HTTPException(404, "Adhérent introuvable")
    data = license_pdf(club, member)
    fname = f"attestation-licence-{member.get('last_name','')}.pdf"
    return _pdf_response(data, fname)
