"""Email sending via Resend (falls back to logging when RESEND_API_KEY not set)."""
import os
import asyncio
import logging
import resend

from notification_log import log_notification

logger = logging.getLogger(__name__)


def _configure():
    api_key = os.environ.get("RESEND_API_KEY", "")
    if api_key:
        resend.api_key = api_key
    return api_key


async def send_email(to: str, subject: str, html: str, *, club_id: str = "", kind: str = ""):
    api_key = _configure()
    sender = os.environ.get("SENDER_EMAIL", "onboarding@resend.dev")
    if not to:
        await log_notification(channel="email", status="skipped", to="", subject=subject, club_id=club_id, kind=kind, error="no address")
        return {"status": "skipped", "reason": "no address"}
    if not api_key:
        logger.info("[EMAIL SIMULATED] To=%s Subject=%s", to, subject)
        await log_notification(channel="email", status="simulated", to=to, subject=subject, club_id=club_id, kind=kind)
        return {"status": "simulated", "to": to, "subject": subject}
    params = {"from": sender, "to": [to], "subject": subject, "html": html}
    try:
        result = await asyncio.to_thread(resend.Emails.send, params)
        await log_notification(channel="email", status="sent", to=to, subject=subject, club_id=club_id, kind=kind, provider_id=result.get("id") or "")
        return {"status": "sent", "id": result.get("id"), "to": to}
    except Exception as e:
        logger.error("Email failed: %s", e)
        await log_notification(channel="email", status="error", to=to, subject=subject, club_id=club_id, kind=kind, error=str(e))
        return {"status": "error", "error": str(e), "to": to}


def reminder_html(club_name: str, member_name: str, amount: float, pay_url: str, level: int) -> str:
    intros = {
        1: "Petit rappel amical",
        2: "Deuxième rappel",
        3: "Dernier rappel",
    }
    intro = intros.get(level, "Rappel")
    return f"""
<div style="font-family: -apple-system, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; color: #0f172a;">
  <h2 style="color: #ea580c; margin: 0 0 12px;">{intro} — {club_name}</h2>
  <p>Bonjour {member_name},</p>
  <p>Votre cotisation d'un montant de <strong>{amount:.2f} €</strong> pour la saison en cours n'a pas encore été réglée.</p>
  <p>Vous pouvez régler en quelques secondes en cliquant sur le bouton ci-dessous :</p>
  <p style="text-align: center; margin: 24px 0;">
    <a href="{pay_url}" style="background: #ea580c; color: white; padding: 14px 28px; text-decoration: none; border-radius: 12px; font-weight: 600;">Payer ma cotisation</a>
  </p>
  <p style="color: #64748b; font-size: 14px;">Merci pour votre engagement au sein du club !</p>
  <p style="color: #64748b; font-size: 14px;">L'équipe de {club_name}</p>
</div>
"""


def announcement_html(club_name: str, title: str, body: str) -> str:
    return f"""
<div style="font-family: -apple-system, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; color: #0f172a;">
  <p style="color: #64748b; font-size: 14px; text-transform: uppercase; letter-spacing: 1px;">{club_name}</p>
  <h2 style="color: #ea580c; margin: 8px 0 16px;">{title}</h2>
  <div style="line-height: 1.6;">{body}</div>
</div>
"""


def session_change_html(club_name: str, session_title: str, when: str, place: str, note: str) -> str:
    return f"""
<div style="font-family: -apple-system, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; color: #0f172a;">
  <p style="color: #64748b; font-size: 14px; text-transform: uppercase; letter-spacing: 1px;">{club_name} — Changement de créneau</p>
  <h2 style="color: #ea580c; margin: 8px 0 16px;">{session_title}</h2>
  <p><strong>Quand :</strong> {when}</p>
  <p><strong>Où :</strong> {place}</p>
  {f'<p style="background: #FEF08A; padding: 12px; border-radius: 8px;">{note}</p>' if note else ''}
</div>
"""
