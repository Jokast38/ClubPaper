"""Fees (cotisations) + Stripe payments."""
import os
import asyncio
import logging
from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException, Request, Depends

import stripe

from models import Fee, CheckoutRequest, PaymentTransaction
from database import get_db
from deps import current_user, get_user_club, serialize
from email_utils import send_email, reminder_html
from sms_utils import send_sms, sms_configured, format_phone, reminder_sms

router = APIRouter(tags=["fees"])
logger = logging.getLogger(__name__)


# ---- Fees ----
@router.post("/fees/generate")
async def generate_fees(user: dict = Depends(current_user)):
    from datetime import timedelta
    db = get_db()
    club = await get_user_club(user)
    default_amt = club.get("default_fee", 150.0)
    season = club.get("season", "2025-2026")
    members = await db.members.find({"club_id": club["id"]}, {"_id": 0}).to_list(5000)
    created = 0
    for m in members:
        exists = await db.fees.find_one({"club_id": club["id"], "member_id": m["id"], "season": season})
        if exists:
            continue
        amt = m.get("fee_amount") or default_amt
        due = (datetime.now(timezone.utc) + timedelta(days=30)).strftime("%Y-%m-%d")
        fee = Fee(club_id=club["id"], member_id=m["id"], season=season, amount=amt, due_date=due)
        await db.fees.insert_one(serialize(fee))
        created += 1
    return {"created": created, "season": season}


@router.get("/fees")
async def list_fees(user: dict = Depends(current_user)):
    db = get_db()
    club = await get_user_club(user)
    rows = await db.fees.find({"club_id": club["id"]}, {"_id": 0}).to_list(5000)
    members = {m["id"]: m async for m in db.members.find({"club_id": club["id"]}, {"_id": 0})}
    for r in rows:
        m = members.get(r["member_id"], {})
        r["member_name"] = f"{m.get('first_name','')} {m.get('last_name','')}".strip()
        r["member_email"] = m.get("email", "")
        r["member_team"] = m.get("team", "")
    return rows


@router.get("/fees/summary")
async def fees_summary(user: dict = Depends(current_user)):
    db = get_db()
    club = await get_user_club(user)
    pipeline = [
        {"$match": {"club_id": club["id"]}},
        {"$group": {"_id": "$status", "count": {"$sum": 1}, "amount": {"$sum": "$amount"}}},
    ]
    agg = await db.fees.aggregate(pipeline).to_list(10)
    summary = {"pending": {"count": 0, "amount": 0.0}, "paid": {"count": 0, "amount": 0.0}, "overdue": {"count": 0, "amount": 0.0}}
    for row in agg:
        s = row["_id"] or "pending"
        summary[s] = {"count": row["count"], "amount": float(row["amount"])}
    summary["total_members"] = await db.members.count_documents({"club_id": club["id"]})
    return summary


@router.post("/fees/{fee_id}/mark-paid")
async def mark_paid(fee_id: str, user: dict = Depends(current_user)):
    db = get_db()
    club = await get_user_club(user)
    result = await db.fees.update_one(
        {"id": fee_id, "club_id": club["id"]},
        {"$set": {"status": "paid", "paid_at": datetime.now(timezone.utc).isoformat()}},
    )
    if result.matched_count == 0:
        raise HTTPException(404, "Cotisation introuvable")
    return {"ok": True}


@router.post("/fees/{fee_id}/send-reminder")
async def send_reminder(fee_id: str, user: dict = Depends(current_user)):
    db = get_db()
    club = await get_user_club(user)
    fee = await db.fees.find_one({"id": fee_id, "club_id": club["id"]}, {"_id": 0})
    if not fee:
        raise HTTPException(404, "Cotisation introuvable")
    member = await db.members.find_one({"id": fee["member_id"]}, {"_id": 0})
    if not member:
        raise HTTPException(404, "Membre introuvable")
    to_email = member.get("email") or member.get("parent_email")
    if not to_email:
        raise HTTPException(400, "Aucun email pour ce membre")
    frontend = os.environ.get("FRONTEND_URL", "")
    pay_url = f"{frontend}/pay/{fee['id']}"
    level = fee.get("reminders_sent", 0) + 1
    html = reminder_html(club["name"], f"{member['first_name']} {member['last_name']}", fee["amount"], pay_url, level)
    result = await send_email(to_email, f"Rappel cotisation — {club['name']}", html, club_id=club["id"], kind="reminder")
    sms_result = None
    if sms_configured(club) and member.get("phone"):
        sms_result = await send_sms(club, format_phone(member["phone"]), reminder_sms(club["name"], member["first_name"], fee["amount"], pay_url), kind="reminder")
    await db.fees.update_one(
        {"id": fee_id},
        {"$set": {"reminders_sent": level, "last_reminder_at": datetime.now(timezone.utc).isoformat()}},
    )
    return {"ok": True, "email": result, "sms": sms_result}


@router.post("/fees/send-all-reminders")
async def send_all_reminders(user: dict = Depends(current_user)):
    db = get_db()
    club = await get_user_club(user)
    fees = await db.fees.find({"club_id": club["id"], "status": {"$in": ["pending", "overdue"]}}, {"_id": 0}).to_list(5000)
    sent = 0
    for fee in fees:
        member = await db.members.find_one({"id": fee["member_id"]}, {"_id": 0})
        if not member:
            continue
        to = member.get("email") or member.get("parent_email")
        if not to:
            continue
        frontend = os.environ.get("FRONTEND_URL", "")
        pay_url = f"{frontend}/pay/{fee['id']}"
        level = fee.get("reminders_sent", 0) + 1
        html = reminder_html(club["name"], f"{member['first_name']} {member['last_name']}", fee["amount"], pay_url, level)
        await send_email(to, f"Rappel cotisation — {club['name']}", html, club_id=club["id"], kind="reminder")
        if sms_configured(club) and member.get("phone"):
            await send_sms(club, format_phone(member["phone"]), reminder_sms(club["name"], member["first_name"], fee["amount"], pay_url), kind="reminder")
        await db.fees.update_one(
            {"id": fee["id"]},
            {"$set": {"reminders_sent": level, "last_reminder_at": datetime.now(timezone.utc).isoformat()}},
        )
        sent += 1
    return {"sent": sent}


# ---- Stripe payments ----
@router.post("/payments/checkout")
async def create_checkout(req: CheckoutRequest, request: Request):
    db = get_db()
    try:
        if req.fee_id:
            fee = await db.fees.find_one({"id": req.fee_id}, {"_id": 0})
            if not fee:
                raise HTTPException(404, "Cotisation introuvable")
            club = await db.clubs.find_one({"id": fee["club_id"]}, {"_id": 0})
            member = await db.members.find_one({"id": fee["member_id"]}, {"_id": 0})
            amount_cents = int(round(fee["amount"] * 100))
            session = stripe.checkout.Session.create(
                line_items=[{
                    "price_data": {
                        "currency": "eur",
                        "product_data": {"name": f"Cotisation {club['name']} - {member['first_name']} {member['last_name']}"},
                        "unit_amount": amount_cents,
                    }, "quantity": 1,
                }],
                mode="payment",
                success_url=f"{req.origin_url}/payment/success?session_id={{CHECKOUT_SESSION_ID}}",
                cancel_url=f"{req.origin_url}/payment/cancel",
                metadata={"fee_id": req.fee_id, "club_id": club["id"]},
            )
            await db.payment_transactions.insert_one(serialize(PaymentTransaction(
                session_id=session.id, club_id=club["id"], fee_id=req.fee_id,
                amount=fee["amount"], currency="eur",
            )))
            await db.fees.update_one({"id": req.fee_id}, {"$set": {"stripe_session_id": session.id}})
            return {"checkout_url": session.url, "session_id": session.id}

        if req.lookup_key:
            user = await current_user(request)
            club = await get_user_club(user)
            prices = stripe.Price.list(lookup_keys=[req.lookup_key], active=True, limit=1).data
            if not prices:
                raise HTTPException(400, f"Tarif Stripe introuvable ({req.lookup_key}). Vérifiez que STRIPE_SECRET_KEY est configuré côté serveur.")
            price = prices[0]
            session = stripe.checkout.Session.create(
                line_items=[{"price": price.id, "quantity": 1}],
                mode="subscription" if price.recurring else "payment",
                success_url=f"{req.origin_url}/payment/success?session_id={{CHECKOUT_SESSION_ID}}",
                cancel_url=f"{req.origin_url}/payment/cancel",
                metadata={"club_id": club["id"], "user_id": user["id"], "lookup_key": req.lookup_key},
            )
            await db.payment_transactions.insert_one(serialize(PaymentTransaction(
                session_id=session.id, club_id=club["id"], user_id=user["id"],
                lookup_key=req.lookup_key,
                amount=(price.unit_amount or 0) / 100, currency=price.currency,
            )))
            return {"checkout_url": session.url, "session_id": session.id}

        raise HTTPException(400, "fee_id ou lookup_key requis")
    except HTTPException:
        raise
    except stripe.error.StripeError as e:
        logger.error("Stripe checkout failed: %s", e)
        raise HTTPException(502, f"Erreur Stripe : {e.user_message or str(e)}")
    except Exception as e:
        logger.error("Checkout failed: %s", e)
        raise HTTPException(500, "Impossible de créer la session de paiement")


@router.get("/payments/status/{session_id}")
async def payment_status(session_id: str):
    db = get_db()
    record = await db.payment_transactions.find_one({"session_id": session_id}, {"_id": 0})
    if not record:
        raise HTTPException(404, "Transaction introuvable")
    if record.get("payment_status") != "paid":
        try:
            s = stripe.checkout.Session.retrieve(session_id)
            if s.payment_status == "paid" or s.status == "complete":
                now = datetime.now(timezone.utc).isoformat()
                await db.payment_transactions.update_one(
                    {"session_id": session_id, "payment_status": {"$ne": "paid"}},
                    {"$set": {"status": "completed", "payment_status": "paid",
                              "stripe_subscription_id": s.subscription,
                              "stripe_payment_intent_id": s.payment_intent,
                              "updated_at": now}},
                )
                if record.get("fee_id"):
                    await db.fees.update_one({"id": record["fee_id"]}, {"$set": {"status": "paid", "paid_at": now}})
                if record.get("lookup_key") and record.get("club_id"):
                    await db.clubs.update_one({"id": record["club_id"]}, {"$set": {"subscription_status": "active"}})
                record = await db.payment_transactions.find_one({"session_id": session_id}, {"_id": 0})
        except stripe.error.StripeError as e:
            logger.warning("stripe retrieve failed: %s", e)
    return {"session_id": record["session_id"], "status": record["status"], "payment_status": record["payment_status"]}


@router.post("/stripe/webhook")
async def stripe_webhook(request: Request):
    db = get_db()
    payload = await request.body()
    sig = request.headers.get("stripe-signature", "")
    webhook_secret = os.environ.get("STRIPE_WEBHOOK_SECRET", "")
    try:
        event = stripe.Webhook.construct_event(payload, sig, webhook_secret)
    except stripe.error.SignatureVerificationError:
        raise HTTPException(400, "signature invalide")
    obj = event["data"]["object"]
    now = datetime.now(timezone.utc).isoformat()
    if event["type"] == "checkout.session.completed":
        result = await db.payment_transactions.update_one(
            {"session_id": obj["id"], "payment_status": {"$ne": "paid"}},
            {"$set": {"status": "completed", "payment_status": obj.get("payment_status", "paid"),
                      "stripe_subscription_id": obj.get("subscription"),
                      "stripe_payment_intent_id": obj.get("payment_intent"),
                      "updated_at": now}},
        )
        if result.modified_count > 0:
            record = await db.payment_transactions.find_one({"session_id": obj["id"]}, {"_id": 0})
            if record and record.get("fee_id"):
                await db.fees.update_one({"id": record["fee_id"]}, {"$set": {"status": "paid", "paid_at": now}})
            if record and record.get("lookup_key") and record.get("club_id"):
                await db.clubs.update_one({"id": record["club_id"]}, {"$set": {"subscription_status": "active"}})
    return {"status": "ok"}
