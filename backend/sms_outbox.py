"""File d'envoi des « SMS inclus » ClubPaper vers la passerelle SMS personnelle (Dashboardjk).

Chaque SMS est d'abord écrit dans `sms_outbox` (rien ne se perd si la passerelle est
injoignable), puis transmis un par un au serveur SMS, qui applique la cadence anti-blocage
(intervalle, plafonds horaire/journalier, heures calmes). Les statuts reviennent par webhook
signé (`/api/sms/gateway-webhook`) ou, à défaut, par interrogation.

Variables : CLUBPAPER_SMS_URL, CLUBPAPER_SMS_API_KEY, CLUBPAPER_SMS_WEBHOOK_SECRET.
"""
import asyncio
import hashlib
import hmac
import logging
import os
import re
import time
import uuid
from datetime import datetime, timedelta, timezone

import requests
from pymongo import ReturnDocument

from database import get_db
from notification_log import log_notification
from sms_plans import month_start_iso, monthly_quota, sms_segments, sms_used_this_month

logger = logging.getLogger("sms.outbox")

FINAL = {"sent", "delivered", "failed", "rejected"}
GIVE_UP_AFTER = 48 * 3600
STOP_RE = re.compile(r"^\s*(stop|arr[eê]t|arreter|arrêter|desinscri|désinscri|unsubscribe)\b", re.I)
_STATE = {"queued": "submitted", "sending": "submitted", "pending": "submitted", "processed": "submitted",
          "sent": "sent", "delivered": "delivered", "failed": "failed", "cancelled": "failed"}
_wake = asyncio.Event()


class GatewayDown(Exception):
    """Erreur temporaire : on réessaiera plus tard."""


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _cfg() -> tuple[str, str]:
    return os.environ.get("CLUBPAPER_SMS_URL", "").rstrip("/"), os.environ.get("CLUBPAPER_SMS_API_KEY", "")


def _call(method: str, path: str, json_data: dict | None = None) -> dict:
    url, key = _cfg()
    if not (url and key):
        raise GatewayDown("Passerelle SMS non configurée (CLUBPAPER_SMS_URL / CLUBPAPER_SMS_API_KEY)")
    try:
        r = requests.request(method, url + path, json=json_data, headers={"X-API-Key": key}, timeout=60)
    except requests.RequestException as e:
        raise GatewayDown(f"Serveur SMS injoignable ({e.__class__.__name__})")
    if r.status_code in (401, 403, 429) or r.status_code >= 500:
        raise GatewayDown(f"Serveur SMS {r.status_code} : {r.text[:200]}")
    if r.status_code >= 400:
        raise ValueError(f"Refusé par le serveur SMS ({r.status_code}) : {r.text[:200]}")
    return r.json() if r.content else {}


async def ensure_indexes(db) -> None:
    await db.sms_outbox.create_index("id", unique=True)
    await db.sms_outbox.create_index([("status", 1), ("next_attempt_at", 1)])
    await db.sms_outbox.create_index([("club_id", 1), ("created_at", -1)])
    await db.sms_outbox.create_index([("to", 1), ("created_at", -1)])
    await db.sms_outbox.create_index("gateway_id")
    await db.sms_optouts.create_index([("club_id", 1), ("phone", 1)], unique=True)


async def is_opted_out(db, club_id: str, phone: str) -> bool:
    return bool(await db.sms_optouts.find_one({"club_id": club_id, "phone": phone}, {"_id": 1}))


# ---------------------------------------------------------------- mise en file
async def enqueue(club: dict, to: str, body: str, *, kind: str = "", priority: int = 0) -> dict:
    """Met un SMS en file pour la passerelle, dans la limite du quota mensuel du club."""
    db = get_db()
    segments = sms_segments(body)
    quota = monthly_quota(club)
    used = await sms_used_this_month(db, club["id"])
    if used + segments > quota:
        await log_notification(channel="sms", status="skipped", to=to, subject=body[:80], club_id=club["id"],
                               kind=kind, error=f"quota SMS mensuel atteint ({used}/{quota})")
        await _quota_reached(db, club, used, quota)
        return {"status": "skipped", "reason": "quota", "used": used, "quota": quota}

    doc = {
        "id": str(uuid.uuid4()), "club_id": club["id"], "to": to, "body": body, "kind": kind,
        "priority": priority, "segments": segments, "status": "queued", "attempts": 0,
        "next_attempt_at": 0, "gateway_id": None, "error": "",
        "created_at": _now_iso(), "updated_at": _now_iso(),
    }
    await db.sms_outbox.insert_one(dict(doc))
    await log_notification(channel="sms", status="queued", to=to, subject=body[:80], club_id=club["id"],
                           kind=kind, provider_id=doc["id"])
    _wake.set()
    return {"status": "queued", "id": doc["id"], "to": to, "segments": segments, "remaining": quota - used - segments}


async def _quota_reached(db, club: dict, used: int, quota: int) -> None:
    """Une seule alerte par mois et par club (invitation à passer Pro / Twilio / Brevo)."""
    month = month_start_iso()[:7]
    res = await db.clubs.update_one({"id": club["id"], "sms_quota_alert_month": {"$ne": month}},
                                    {"$set": {"sms_quota_alert_month": month}})
    if res.modified_count:
        try:
            from plan_limits import log_upgrade_prompt
            await log_upgrade_prompt(club["id"], "sms_quota")
            from telegram_utils import notify_admins_telegram
            await notify_admins_telegram(f"📵 {club.get('name', '')} a atteint son quota SMS ({used}/{quota}) — piste d'upgrade")
        except Exception as e:
            logger.warning("quota alert failed: %s", e)


# ---------------------------------------------------------------- statuts
async def _set_status(item: dict, status: str, error: str = "") -> None:
    db = get_db()
    if item.get("status") == status:
        return
    if item.get("status") in ("delivered", "failed", "rejected") or (item.get("status") == "sent" and status == "submitted"):
        return  # pas de régression
    await db.sms_outbox.update_one({"id": item["id"]}, {"$set": {"status": status, "error": error, "updated_at": _now_iso()}})
    log_status = {"sent": "sent", "delivered": "sent", "failed": "error", "rejected": "error"}.get(status)
    if log_status:
        await db.notification_logs.update_one(
            {"channel": "sms", "provider_id": item["id"]},
            {"$set": {"status": log_status, "error": error if log_status == "error" else ""}})


async def apply_gateway_status(gateway_id: str | None, reference: str | None, state: str | None, error: str = "") -> bool:
    db = get_db()
    q = {"id": reference} if reference else {"gateway_id": gateway_id}
    item = await db.sms_outbox.find_one(q, {"_id": 0}) if (reference or gateway_id) else None
    status = _STATE.get(str(state or "").lower())
    if not item or not status:
        return False
    await _set_status(item, status, error or "")
    return True


# ---------------------------------------------------------------- worker
async def _push_one(item: dict) -> None:
    db = get_db()
    try:
        res = await asyncio.to_thread(_call, "POST", "/api/v1/sms", {
            "to": item["to"], "message": item["body"], "use_prefix": False,
            "reference": item["id"], "priority": item.get("priority", 0),
        })
        gid = ((res.get("messages") or [{}])[0]).get("id")
        await db.sms_outbox.update_one({"id": item["id"]}, {"$set": {
            "status": "submitted", "gateway_id": gid, "error": "", "submitted_at": _now_iso(), "updated_at": _now_iso()}})
    except ValueError as e:  # numéro invalide, etc. : définitif, non décompté du quota
        await _set_status(item, "rejected", str(e))
    except GatewayDown as e:
        age = time.time() - datetime.fromisoformat(item["created_at"]).timestamp()
        if age > GIVE_UP_AFTER:
            await _set_status(item, "failed", f"{e} — abandon après 48 h")
            return
        delay = min(60 * 2 ** max(item.get("attempts", 1) - 1, 0), 1800)
        await db.sms_outbox.update_one({"id": item["id"]}, {"$set": {
            "status": "queued", "error": f"{e} — nouvel essai dans {delay // 60 or 1} min",
            "next_attempt_at": time.time() + delay, "updated_at": _now_iso()}})
        raise


async def process_outbox(limit: int = 50) -> int:
    """Transmet les SMS en attente au serveur SMS (qui gère lui-même le rythme d'envoi)."""
    db = get_db()
    pushed = 0
    for _ in range(limit):
        item = await db.sms_outbox.find_one_and_update(
            {"status": "queued", "next_attempt_at": {"$lte": time.time()}},
            {"$set": {"status": "sending", "updated_at": _now_iso()}, "$inc": {"attempts": 1}},
            sort=[("priority", -1), ("created_at", 1)], return_document=ReturnDocument.AFTER)
        if not item:
            break
        item.pop("_id", None)
        try:
            await _push_one(item)
            pushed += 1
        except GatewayDown:
            break  # serveur indisponible : inutile d'insister sur les suivants
    return pushed


async def poll_statuses(limit: int = 30) -> int:
    """Filet de sécurité si un webhook se perd : interroge les SMS transmis depuis plus de 5 min."""
    db = get_db()
    old = (datetime.now(timezone.utc) - timedelta(minutes=5)).isoformat()
    since = (datetime.now(timezone.utc) - timedelta(days=3)).isoformat()
    items = await db.sms_outbox.find(
        {"status": {"$in": ["submitted", "sent"]}, "gateway_id": {"$ne": None},
         "updated_at": {"$lt": old}, "created_at": {"$gt": since}}, {"_id": 0},
    ).sort("updated_at", 1).limit(limit).to_list(limit)
    n = 0
    for it in items:
        try:
            res = await asyncio.to_thread(_call, "GET", f"/api/v1/sms/{it['gateway_id']}")
        except (GatewayDown, ValueError):
            break
        if await apply_gateway_status(it["gateway_id"], it["id"], res.get("status"), res.get("error") or ""):
            n += 1
        await db.sms_outbox.update_one({"id": it["id"], "status": {"$nin": list(FINAL)}}, {"$set": {"updated_at": _now_iso()}})
    return n


async def run_outbox_worker() -> None:
    await ensure_indexes(get_db())
    last_poll = 0.0
    while True:
        try:
            await process_outbox()
            if time.time() - last_poll > 120:
                last_poll = time.time()
                await poll_statuses()
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("SMS outbox worker error")
        _wake.clear()
        try:
            await asyncio.wait_for(_wake.wait(), timeout=10)
        except asyncio.TimeoutError:
            pass


# ---------------------------------------------------------------- webhooks du serveur SMS
def valid_signature(raw: bytes, ts: str, sig: str) -> bool:
    secret = os.environ.get("CLUBPAPER_SMS_WEBHOOK_SECRET", "")
    if not secret or not ts.isdigit() or abs(time.time() - int(ts)) > 300:
        return False
    expected = hmac.new(secret.encode(), raw + ts.encode(), hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, sig or "")


async def handle_webhook(payload: dict) -> dict:
    event, data = payload.get("event", ""), payload.get("data") or {}
    if event == "sms.status":
        ok = await apply_gateway_status(data.get("id"), data.get("reference"), data.get("status"), data.get("error") or "")
        return {"ok": True, "updated": ok}
    if event in ("sms.reply", "sms.received"):
        return await _handle_reply(data.get("from") or "", data.get("message") or "")
    return {"ok": True}


async def _handle_reply(phone: str, text: str) -> dict:
    """Réponse d'un adhérent : historisée ; STOP = plus aucun SMS de ce club vers ce numéro."""
    db = get_db()
    last = await db.sms_outbox.find_one({"to": phone}, {"_id": 0, "club_id": 1}, sort=[("created_at", -1)])
    club_id = (last or {}).get("club_id")
    await db.sms_replies.insert_one({"id": str(uuid.uuid4()), "club_id": club_id, "from": phone, "body": text,
                                     "created_at": _now_iso()})
    if club_id and STOP_RE.match(text or ""):
        await db.sms_optouts.update_one({"club_id": club_id, "phone": phone},
                                        {"$setOnInsert": {"created_at": _now_iso()}}, upsert=True)
        return {"ok": True, "optout": True}
    return {"ok": True}
