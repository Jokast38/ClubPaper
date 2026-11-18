"""Envoi des SMS d'un club.

Fournisseur choisi (voir sms_plans.sms_provider) :
1. Brevo ou Twilio du club, s'il en a configuré un → illimité, facturé par le fournisseur ;
2. sinon les « SMS inclus » ClubPaper (passerelle SMS) → quota mensuel selon le plan, file d'envoi cadencée ;
3. sinon pas de SMS. Le plan gratuit n'a jamais de SMS.
"""
import os
import re
import logging
import asyncio
import unicodedata

from notification_log import log_notification
from sms_plans import gateway_available, own_provider, plan_tier, sms_provider

logger = logging.getLogger(__name__)


def _get_creds(club: dict):
    """Return (sid, token, from_phone, enabled) using club integrations or env fallback."""
    integrations = (club or {}).get("integrations") or {}
    sid = integrations.get("twilio_account_sid") or os.environ.get("TWILIO_ACCOUNT_SID", "")
    token = integrations.get("twilio_auth_token") or os.environ.get("TWILIO_AUTH_TOKEN", "")
    from_phone = integrations.get("twilio_phone_from") or os.environ.get("TWILIO_PHONE_FROM", "")
    enabled = bool(integrations.get("twilio_enabled"))
    return sid, token, from_phone, enabled


def sms_configured(club: dict) -> bool:
    """Le club peut-il envoyer des SMS (fournisseur propre, ou SMS inclus dans son plan) ?"""
    if sms_provider(club) is not None:
        return True
    sid, token, from_phone, enabled = _get_creds(club)  # Twilio avec clés plateforme (variables d'env)
    return plan_tier(club) != "free" and bool(enabled and sid and token and from_phone)


def brevo_sender(club: dict) -> str:
    """Expéditeur alphanumérique Brevo : 11 caractères max, lettres/chiffres sans accents."""
    raw = ((club or {}).get("integrations") or {}).get("brevo_sms_sender") or (club or {}).get("name") or "ClubPaper"
    ascii_ = unicodedata.normalize("NFKD", raw).encode("ascii", "ignore").decode()
    return (re.sub(r"[^A-Za-z0-9]", "", ascii_)[:11]) or "ClubPaper"


async def send_sms(club: dict, to: str, body: str, *, kind: str = "", priority: int = 0) -> dict:
    """Envoie (ou met en file) un SMS. Ne lève jamais d'exception."""
    club_id = (club or {}).get("id", "")
    if not to:
        await log_notification(channel="sms", status="skipped", to="", subject=body[:80], club_id=club_id, kind=kind, error="no phone")
        return {"status": "skipped", "reason": "no phone"}
    if plan_tier(club) == "free":
        # Free plan: email only — SMS is a paid-plan feature.
        await log_notification(channel="sms", status="skipped", to=to, subject=body[:80], club_id=club_id, kind=kind, error="plan gratuit")
        try:
            from plan_limits import log_upgrade_prompt
            await log_upgrade_prompt(club_id, "sms_blocked")
        except Exception:
            pass
        return {"status": "skipped", "reason": "plan gratuit"}
    try:
        from database import get_db
        from sms_outbox import is_opted_out
        if club_id and await is_opted_out(get_db(), club_id, to):
            await log_notification(channel="sms", status="skipped", to=to, subject=body[:80], club_id=club_id, kind=kind, error="désinscrit (STOP)")
            return {"status": "skipped", "reason": "optout"}
    except Exception as e:
        logger.warning("optout check failed: %s", e)

    provider = own_provider(club)
    if provider == "brevo":
        return await _send_brevo(club, to, body, kind)
    if provider is None and gateway_available():
        from sms_outbox import enqueue
        try:
            return await enqueue(club, to, body, kind=kind, priority=priority)
        except Exception as e:
            logger.error("SMS enqueue failed: %s", e)
            await log_notification(channel="sms", status="error", to=to, subject=body[:80], club_id=club_id, kind=kind, error=str(e))
            return {"status": "error", "error": str(e), "to": to}
    return await _send_twilio(club, to, body, kind)


async def _send_brevo(club: dict, to: str, body: str, kind: str) -> dict:
    import requests
    club_id = club.get("id", "")
    key = (club.get("integrations") or {}).get("brevo_api_key", "")

    def _send():
        r = requests.post(
            "https://api.brevo.com/v3/transactionalSMS/sms",
            headers={"api-key": key, "accept": "application/json", "content-type": "application/json"},
            json={"sender": brevo_sender(club), "recipient": to.lstrip("+"), "content": body,
                  "type": "transactional", "tag": kind or "clubpaper", "unicodeEnabled": True},
            timeout=20,
        )
        if r.status_code >= 400:
            raise RuntimeError(f"Brevo {r.status_code} : {r.text[:200]}")
        return str((r.json() if r.content else {}).get("messageId", ""))

    try:
        message_id = await asyncio.to_thread(_send)
        await log_notification(channel="sms", status="sent", to=to, subject=body[:80], club_id=club_id, kind=kind, provider_id=message_id)
        return {"status": "sent", "sid": message_id, "to": to, "provider": "brevo"}
    except Exception as e:
        logger.error("Brevo send failed: %s", e)
        await log_notification(channel="sms", status="error", to=to, subject=body[:80], club_id=club_id, kind=kind, error=str(e))
        return {"status": "error", "error": str(e), "to": to}


async def _send_twilio(club: dict, to: str, body: str, kind: str) -> dict:
    club_id = (club or {}).get("id", "")
    sid, token, from_phone, enabled = _get_creds(club)
    if not enabled:
        logger.info("[SMS SKIPPED - aucun fournisseur] to=%s", to)
        await log_notification(channel="sms", status="skipped", to=to, subject=body[:80], club_id=club_id, kind=kind, error="aucun fournisseur SMS actif")
        return {"status": "skipped", "reason": "twilio not enabled"}
    if not (sid and token and from_phone):
        logger.info("[SMS SIMULATED] to=%s body=%s", to, body[:60])
        await log_notification(channel="sms", status="simulated", to=to, subject=body[:80], club_id=club_id, kind=kind)
        return {"status": "simulated", "to": to}

    def _send():
        from twilio.rest import Client
        client = Client(sid, token)
        message = client.messages.create(body=body, from_=from_phone, to=to)
        return message.sid

    try:
        message_sid = await asyncio.to_thread(_send)
        await log_notification(channel="sms", status="sent", to=to, subject=body[:80], club_id=club_id, kind=kind, provider_id=message_sid or "")
        return {"status": "sent", "sid": message_sid, "to": to, "provider": "twilio"}
    except Exception as e:
        logger.error("Twilio send failed: %s", e)
        await log_notification(channel="sms", status="error", to=to, subject=body[:80], club_id=club_id, kind=kind, error=str(e))
        return {"status": "error", "error": str(e), "to": to}


def format_phone(raw: str, default_country: str = "+33") -> str:
    """Normalize a French phone number to E.164 (+33...)."""
    if not raw:
        return ""
    p = "".join(ch for ch in raw if ch.isdigit() or ch == "+")
    if p.startswith("+"):
        return p
    if p.startswith("00"):
        return "+" + p[2:]
    if p.startswith("0") and len(p) == 10:
        return default_country + p[1:]
    return p


def reminder_sms(club_name: str, member_name: str, amount: float, pay_url: str) -> str:
    return f"{club_name}: bonjour {member_name}, cotisation de {amount:.0f}€ à régler. Paiement rapide: {pay_url}"


def announcement_sms(club_name: str, title: str) -> str:
    return f"{club_name}: {title}. Consultez votre espace pour en savoir plus."


def session_change_sms(club_name: str, session_title: str, when: str) -> str:
    return f"{club_name} - Créneau {session_title} modifié. Nouveau créneau: {when}."
