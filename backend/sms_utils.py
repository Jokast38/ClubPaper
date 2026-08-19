"""SMS sending via Twilio - uses per-club credentials from club.integrations."""
import os
import logging
import asyncio

from notification_log import log_notification

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
    sid, token, from_phone, enabled = _get_creds(club)
    return bool(enabled and sid and token and from_phone)


async def send_sms(club: dict, to: str, body: str, *, kind: str = "") -> dict:
    """Send an SMS via Twilio. Returns dict with status. Never raises."""
    club_id = (club or {}).get("id", "")
    if not to:
        await log_notification(channel="sms", status="skipped", to="", subject=body[:80], club_id=club_id, kind=kind, error="no phone")
        return {"status": "skipped", "reason": "no phone"}
    sid, token, from_phone, enabled = _get_creds(club)
    if not enabled:
        logger.info("[SMS SKIPPED - twilio disabled] to=%s", to)
        await log_notification(channel="sms", status="skipped", to=to, subject=body[:80], club_id=club_id, kind=kind, error="twilio not enabled")
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
        return {"status": "sent", "sid": message_sid, "to": to}
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
