"""Email sending — SMTP (e.g. Hostinger) if configured, else Resend, else logged/simulated."""
import os
import ssl
import smtplib
import asyncio
import logging
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

import resend

from notification_log import log_notification

logger = logging.getLogger(__name__)


def _sender() -> str:
    return os.environ.get("SENDER_EMAIL", "onboarding@resend.dev")


def _smtp_config():
    host = os.environ.get("SMTP_HOST", "")
    if not host:
        return None
    return {
        "host": host,
        "port": int(os.environ.get("SMTP_PORT", "465")),
        "user": os.environ.get("SMTP_USER", "") or _sender(),
        "password": os.environ.get("SMTP_PASSWORD", ""),
    }


def _send_via_smtp_sync(cfg: dict, to: str, subject: str, html: str, sender: str):
    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = sender
    msg["To"] = to
    msg.attach(MIMEText(html, "html"))

    context = ssl.create_default_context()
    if cfg["port"] == 465:
        with smtplib.SMTP_SSL(cfg["host"], cfg["port"], context=context, timeout=15) as server:
            server.login(cfg["user"], cfg["password"])
            server.sendmail(sender, [to], msg.as_string())
    else:
        with smtplib.SMTP(cfg["host"], cfg["port"], timeout=15) as server:
            server.starttls(context=context)
            server.login(cfg["user"], cfg["password"])
            server.sendmail(sender, [to], msg.as_string())


def _configure_resend():
    api_key = os.environ.get("RESEND_API_KEY", "")
    if api_key:
        resend.api_key = api_key
    return api_key


async def send_email(to: str, subject: str, html: str, *, club_id: str = "", kind: str = ""):
    sender = _sender()
    if not to:
        await log_notification(channel="email", status="skipped", to="", subject=subject, club_id=club_id, kind=kind, error="no address")
        return {"status": "skipped", "reason": "no address"}

    smtp_cfg = _smtp_config()
    if smtp_cfg and smtp_cfg["password"]:
        try:
            await asyncio.to_thread(_send_via_smtp_sync, smtp_cfg, to, subject, html, sender)
            await log_notification(channel="email", status="sent", to=to, subject=subject, club_id=club_id, kind=kind, provider_id="")
            return {"status": "sent", "to": to}
        except Exception as e:
            logger.error("SMTP email failed: %s", e)
            await log_notification(channel="email", status="error", to=to, subject=subject, club_id=club_id, kind=kind, error=str(e))
            return {"status": "error", "error": str(e), "to": to}

    api_key = _configure_resend()
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


def welcome_html(name: str) -> str:
    return f"""
<div style="font-family: -apple-system, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; color: #0f172a;">
  <h2 style="color: #ea580c; margin: 0 0 12px;">Bienvenue sur ClubPaper 🎉</h2>
  <p>Bonjour {name},</p>
  <p>Votre compte a bien été créé. Vous pouvez dès maintenant configurer votre club, ajouter vos adhérents et gérer vos cotisations.</p>
  <p>Vous bénéficiez d'un essai gratuit de 30 jours, sans carte bancaire.</p>
  <p style="color: #64748b; font-size: 14px;">L'équipe ClubPaper</p>
</div>
"""


def club_ready_html(club: dict, public_url: str) -> str:
    logo = club.get("logo_data_url") or ""
    logo_block = (
        f'<img src="{logo}" alt="{club.get("name","")}" style="width:72px;height:72px;border-radius:16px;object-fit:contain;background:#F8FAFC;padding:6px;margin-bottom:16px;" />'
        if logo else ""
    )
    return f"""
<div style="font-family: -apple-system, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; color: #0f172a; text-align: center;">
  {logo_block}
  <h2 style="color: #ea580c; margin: 0 0 12px;">Bravo, {club.get('name','')} est prêt ! 🎉</h2>
  <p style="text-align: left;">Votre club <b>{club.get('name','')}</b> ({club.get('sport','')}{f", {club.get('city')}" if club.get('city') else ""}) est maintenant configuré sur ClubPaper. Vous pouvez ajouter vos adhérents, générer vos cotisations et planifier vos créneaux dès maintenant.</p>
  <p style="text-align: left;">Votre page publique est déjà en ligne — partagez-la pour attirer de nouveaux adhérents :</p>
  <p style="margin: 24px 0;">
    <a href="{public_url}" style="background: #ea580c; color: white; padding: 14px 28px; text-decoration: none; border-radius: 12px; font-weight: 600; display: inline-block;">Voir la page de {club.get('name','')}</a>
  </p>
  <p style="color: #64748b; font-size: 14px; text-align: left;">Vous bénéficiez d'un essai gratuit de 30 jours, sans carte bancaire.</p>
  <p style="color: #64748b; font-size: 14px;">L'équipe ClubPaper</p>
</div>
"""


def new_prospect_html(club_name: str, prospect: dict) -> str:
    return f"""
<div style="font-family: -apple-system, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; color: #0f172a;">
  <p style="color: #64748b; font-size: 14px; text-transform: uppercase; letter-spacing: 1px;">{club_name} — Nouvelle demande</p>
  <h2 style="color: #ea580c; margin: 8px 0 16px;">{prospect.get('first_name','')} {prospect.get('last_name','')}</h2>
  <p><strong>Email :</strong> {prospect.get('email','')}</p>
  {f"<p><strong>Téléphone :</strong> {prospect.get('phone')}</p>" if prospect.get('phone') else ''}
  {f"<p><strong>Équipe souhaitée :</strong> {prospect.get('team_interest')}</p>" if prospect.get('team_interest') else ''}
  {f"<p><strong>Message :</strong><br/>{prospect.get('message')}</p>" if prospect.get('message') else ''}
  <p style="color: #64748b; font-size: 14px;">Retrouvez cette demande dans l'onglet Demandes de votre espace ClubPaper.</p>
</div>
"""


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
