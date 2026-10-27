"""Partie E2/F — admin-side moderation of directory claim requests.

A claimant has already confirmed their email (routers/public.py:verify_claim,
status "a_verifier") before anything reaches this router. Approving here is
the manual identity-review step required before an account/club can be
created — the actual account creation happens client-side once the
claimant sets a password (routers/public.py:activate_claim)."""
import asyncio
from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException, Depends, Query

from database import get_db
from deps import platform_admin_user, frontend_url
from email_utils import send_email, claim_approved_html, claim_rejected_html

router = APIRouter(prefix="/admin/claims", tags=["claims"])


@router.get("")
async def list_claims(status: str = Query(""), user: dict = Depends(platform_admin_user)):
    db = get_db()
    query = {"status": status} if status else {}
    claims = await db.claim_requests.find(query, {"_id": 0}).sort("created_at", -1).to_list(500)
    lead_ids = list({c["lead_id"] for c in claims})
    leads = await db.leads.find({"id": {"$in": lead_ids}}, {"_id": 0, "id": 1, "name": 1, "city": 1, "annuaire_slug": 1}).to_list(len(lead_ids) or 1)
    leads_by_id = {l["id"]: l for l in leads}
    for c in claims:
        c["lead"] = leads_by_id.get(c["lead_id"])
    return claims


@router.post("/{claim_id}/approve")
async def approve_claim(claim_id: str, user: dict = Depends(platform_admin_user)):
    db = get_db()
    claim = await db.claim_requests.find_one({"id": claim_id}, {"_id": 0})
    if not claim:
        raise HTTPException(404, "Demande introuvable")
    if claim["status"] != "a_verifier":
        raise HTTPException(400, "Cette demande n'est pas en attente de validation")
    lead = await db.leads.find_one({"id": claim["lead_id"]}, {"_id": 0})
    await db.claim_requests.update_one(
        {"id": claim_id},
        {"$set": {"status": "verified", "verified_at": datetime.now(timezone.utc).isoformat(), "verified_by_user_id": user["id"]}},
    )
    activation_url = f"{frontend_url()}/revendication/activer/{claim_id}"
    asyncio.create_task(send_email(
        claim["email"], "Votre revendication est validée",
        claim_approved_html((lead or {}).get("name", ""), activation_url), kind="claim_approved",
    ))
    return {"ok": True, "status": "verified"}


@router.post("/{claim_id}/reject")
async def reject_claim(claim_id: str, payload: dict, user: dict = Depends(platform_admin_user)):
    db = get_db()
    claim = await db.claim_requests.find_one({"id": claim_id}, {"_id": 0})
    if not claim:
        raise HTTPException(404, "Demande introuvable")
    if claim["status"] not in ("a_verifier", "pending_verification"):
        raise HTTPException(400, "Cette demande a déjà été traitée")
    note = (payload.get("note") or "").strip()
    lead = await db.leads.find_one({"id": claim["lead_id"]}, {"_id": 0})
    await db.claim_requests.update_one({"id": claim_id}, {"$set": {"status": "rejected", "rejection_note": note}})
    await db.leads.update_one({"id": claim["lead_id"]}, {"$set": {"claim_status": "none"}})
    asyncio.create_task(send_email(
        claim["email"], "Votre revendication n'a pas été validée",
        claim_rejected_html((lead or {}).get("name", ""), note), kind="claim_rejected",
    ))
    return {"ok": True, "status": "rejected"}
