"""SMS : consommation du quota, passage au plan Pro, demandes de volume, webhook de la passerelle."""
import asyncio
import json
import logging
import uuid
from datetime import datetime, timezone
from typing import Optional

import stripe
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field

from database import get_db
from deps import current_user, get_user_club, platform_admin_user, serialize
from models import PaymentTransaction
from sms_outbox import handle_webhook, valid_signature
from sms_plans import TIERS, month_start_iso, plan_tier, sms_quotas, sms_usage
from telegram_utils import notify_admins_telegram

router = APIRouter(tags=["sms"])
logger = logging.getLogger(__name__)


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


# ---------------------------------------------------------------- club
@router.get("/clubs/me/sms-usage")
async def my_sms_usage(user: dict = Depends(current_user)):
    club = await get_user_club(user)
    usage = await sms_usage(get_db(), club)
    usage["pending_request"] = await get_db().sms_volume_requests.find_one(
        {"club_id": club["id"], "status": "nouvelle"}, {"_id": 0})
    return usage


class VolumeRequest(BaseModel):
    option: str = Field(..., pattern="^(pro|twilio|brevo|partenariat)$")
    monthly_volume: int = Field(0, ge=0, le=1_000_000)
    message: str = Field("", max_length=1000)


@router.post("/clubs/me/sms-volume-request")
async def sms_volume_request(body: VolumeRequest, user: dict = Depends(current_user)):
    """Le club a besoin de plus de SMS : on enregistre la demande et on prévient l'équipe."""
    db = get_db()
    club = await get_user_club(user)
    usage = await sms_usage(db, club)
    doc = {
        "id": str(uuid.uuid4()), "club_id": club["id"], "club_name": club.get("name", ""),
        "contact_email": user.get("email", ""), "option": body.option, "monthly_volume": body.monthly_volume,
        "message": body.message.strip(), "tier": usage["tier"], "used": usage["used"], "quota": usage["quota"],
        "status": "nouvelle", "created_at": _now(),
    }
    await db.sms_volume_requests.insert_one(dict(doc))
    try:
        from plan_limits import log_upgrade_prompt
        await log_upgrade_prompt(club["id"], "sms_volume_request")
    except Exception:
        pass
    labels = {"pro": "plan Pro", "twilio": "Twilio", "brevo": "Brevo", "partenariat": "partenariat"}
    asyncio.create_task(notify_admins_telegram(
        f"📨 Demande SMS — {doc['club_name']} : {labels[body.option]}, ~{body.monthly_volume} SMS/mois "
        f"(utilisé {usage['used']}/{usage['quota'] if usage['quota'] is not None else '∞'}). {doc['message'][:200]}"))
    return doc


class UpgradeIn(BaseModel):
    origin_url: str


@router.post("/clubs/me/upgrade-pro")
async def upgrade_pro(body: UpgradeIn, user: dict = Depends(current_user)):
    """Passage Club -> Pro pour un club déjà abonné.

    - Abonnement mensuel : le prix de l'abonnement Stripe est remplacé (au prorata).
    - Saison payée d'avance : paiement de la différence via Stripe Checkout.
    Un club non abonné choisit directement le plan Pro dans « Abonnement ».
    """
    db = get_db()
    club = await get_user_club(user)
    tier = plan_tier(club)
    if tier == "pro":
        raise HTTPException(400, "Votre club est déjà au plan Pro")
    if tier != "club":
        raise HTTPException(400, "Choisissez directement le plan Pro dans la carte Abonnement")
    try:
        if club.get("billing_mode") == "season_upfront":
            prices = stripe.Price.list(lookup_keys=["clubmanager_pro_season_upgrade"], active=True, limit=1).data
            if not prices:
                raise HTTPException(400, "Tarif Stripe du passage Pro introuvable")
            session = stripe.checkout.Session.create(
                line_items=[{"price": prices[0].id, "quantity": 1}], mode="payment",
                success_url=f"{body.origin_url}/payment/success?session_id={{CHECKOUT_SESSION_ID}}",
                cancel_url=f"{body.origin_url}/payment/cancel",
                metadata={"club_id": club["id"], "user_id": user["id"], "lookup_key": "clubmanager_pro_season_upgrade"},
            )
            await db.payment_transactions.insert_one(serialize(PaymentTransaction(
                session_id=session.id, club_id=club["id"], user_id=user["id"],
                lookup_key="clubmanager_pro_season_upgrade", amount=(prices[0].unit_amount or 0) / 100, currency="eur",
            )))
            return {"checkout_url": session.url}

        tx = await db.payment_transactions.find_one(
            {"club_id": club["id"], "stripe_subscription_id": {"$nin": [None, ""]}},
            {"_id": 0, "stripe_subscription_id": 1}, sort=[("created_at", -1)])
        sub_id = club.get("stripe_subscription_id") or (tx or {}).get("stripe_subscription_id")
        if not sub_id:
            raise HTTPException(409, "Abonnement Stripe introuvable : contactez-nous pour passer au plan Pro.")
        prices = stripe.Price.list(lookup_keys=["clubmanager_pro_monthly"], active=True, limit=1).data
        if not prices:
            raise HTTPException(400, "Tarif Stripe du plan Pro introuvable")
        sub = stripe.Subscription.retrieve(sub_id)
        item_id = sub["items"]["data"][0]["id"]
        stripe.Subscription.modify(sub_id, items=[{"id": item_id, "price": prices[0].id}],
                                   proration_behavior="create_prorations")
    except HTTPException:
        raise
    except stripe.error.StripeError as e:
        logger.error("upgrade pro failed: %s", e)
        raise HTTPException(502, f"Erreur Stripe : {e.user_message or str(e)}")
    await db.clubs.update_one({"id": club["id"]}, {"$set": {"plan_tier": "pro", "stripe_subscription_id": sub_id}})
    asyncio.create_task(notify_admins_telegram(f"🚀 {club.get('name','')} passe au plan Pro (mensuel)"))
    return {"ok": True, "tier": "pro"}


# ---------------------------------------------------------------- passerelle -> ClubPaper
@router.post("/sms/gateway-webhook")
async def gateway_webhook(request: Request):
    """Statuts et réponses envoyés par le serveur SMS (signature HMAC du corps + X-Timestamp)."""
    raw = await request.body()
    if not valid_signature(raw, request.headers.get("X-Timestamp", ""), request.headers.get("X-Signature", "")):
        raise HTTPException(401, "Signature invalide")
    try:
        payload = json.loads(raw)
    except ValueError:
        raise HTTPException(400, "JSON invalide")
    return await handle_webhook(payload)


# ---------------------------------------------------------------- administration plateforme
@router.get("/admin/sms/overview")
async def admin_sms_overview(user: dict = Depends(platform_admin_user)):
    db = get_db()
    since = month_start_iso()
    usage = await db.sms_outbox.aggregate([
        {"$match": {"created_at": {"$gte": since}, "status": {"$ne": "rejected"}}},
        {"$group": {"_id": "$club_id", "used": {"$sum": "$segments"},
                    "failed": {"$sum": {"$cond": [{"$eq": ["$status", "failed"]}, 1, 0]}}}},
        {"$sort": {"used": -1}}, {"$limit": 50},
    ]).to_list(50)
    clubs = {c["id"]: c async for c in db.clubs.find(
        {"id": {"$in": [u["_id"] for u in usage]}},
        {"_id": 0, "id": 1, "name": 1, "plan": 1, "plan_tier": 1, "sms_quota_override": 1})}
    from sms_plans import monthly_quota
    rows = [{"club_id": u["_id"], "name": clubs.get(u["_id"], {}).get("name", "?"),
             "tier": plan_tier(clubs.get(u["_id"], {})), "used": u["used"], "failed": u["failed"],
             "quota": monthly_quota(clubs.get(u["_id"], {}))} for u in usage]
    by_status = {r["_id"]: r["n"] async for r in db.sms_outbox.aggregate([
        {"$match": {"created_at": {"$gte": since}}}, {"$group": {"_id": "$status", "n": {"$sum": 1}}}])}
    requests_ = await db.sms_volume_requests.find({}, {"_id": 0}).sort("created_at", -1).to_list(100)
    return {"quotas": sms_quotas(), "tiers": TIERS, "by_status": by_status, "clubs": rows, "requests": requests_}


class ClubSmsAdminIn(BaseModel):
    plan_tier: Optional[str] = Field(None, pattern="^(club|pro)$")
    sms_quota_override: Optional[int] = Field(None, ge=0, le=1_000_000)
    clear_override: bool = False


@router.put("/admin/clubs/{club_id}/sms")
async def admin_club_sms(club_id: str, body: ClubSmsAdminIn, user: dict = Depends(platform_admin_user)):
    """Ajuste le palier ou le quota SMS d'un club (partenariat, geste commercial)."""
    update: dict = {}
    if body.plan_tier:
        update["plan_tier"] = body.plan_tier
    if body.clear_override:
        update["sms_quota_override"] = None
    elif body.sms_quota_override is not None:
        update["sms_quota_override"] = body.sms_quota_override
    if not update:
        raise HTTPException(422, "Rien à modifier")
    res = await get_db().clubs.update_one({"id": club_id}, {"$set": update})
    if res.matched_count == 0:
        raise HTTPException(404, "Club introuvable")
    return {"ok": True, **update}


class RequestStatusIn(BaseModel):
    status: str = Field(..., pattern="^(nouvelle|en_cours|traitee|refusee)$")


@router.put("/admin/sms/requests/{request_id}")
async def admin_sms_request_status(request_id: str, body: RequestStatusIn, user: dict = Depends(platform_admin_user)):
    res = await get_db().sms_volume_requests.update_one(
        {"id": request_id}, {"$set": {"status": body.status, "updated_at": _now()}})
    if res.matched_count == 0:
        raise HTTPException(404, "Demande introuvable")
    return {"ok": True}
