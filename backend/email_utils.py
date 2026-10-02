"""Email sending — SMTP (e.g. Hostinger) if configured, else Resend, else logged/simulated."""
import os
import ssl
import smtplib
import asyncio
import logging
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.mime.application import MIMEApplication

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


def _send_personal_email_sync(cfg: dict, sender: str, to: list, cc: list, subject: str, html: str, attachments: list):
    """attachments: list of (filename, content_type, bytes)."""
    msg = MIMEMultipart("mixed")
    msg["Subject"] = subject
    msg["From"] = sender
    msg["To"] = ", ".join(to)
    if cc:
        msg["Cc"] = ", ".join(cc)
    alt = MIMEMultipart("alternative")
    alt.attach(MIMEText(html, "html"))
    msg.attach(alt)
    for filename, content_type, data in attachments:
        part = MIMEApplication(data, Name=filename)
        part["Content-Disposition"] = f'attachment; filename="{filename}"'
        msg.attach(part)

    recipients = to + cc
    context = ssl.create_default_context()
    if cfg["port"] == 465:
        with smtplib.SMTP_SSL(cfg["host"], cfg["port"], context=context, timeout=30) as server:
            server.login(cfg["user"], cfg["password"])
            server.sendmail(sender, recipients, msg.as_string())
    else:
        with smtplib.SMTP(cfg["host"], cfg["port"], timeout=30) as server:
            server.starttls(context=context)
            server.login(cfg["user"], cfg["password"])
            server.sendmail(sender, recipients, msg.as_string())


async def send_personal_email(to: list, cc: list, subject: str, html: str, attachments: list, sender_name: str = ""):
    """Send a one-off email from the personal admin mailbox (cc + real
    attachments supported) — distinct from the transactional `send_email`
    used for app notifications. Raises on failure (caller persists the
    SentEmail record either way, with status reflecting the outcome)."""
    cfg = _smtp_config()
    if not cfg:
        raise RuntimeError("SMTP n'est pas configuré (SMTP_HOST manquant).")
    base_sender = _sender()
    sender = f"{sender_name} <{base_sender}>" if sender_name else base_sender
    await asyncio.to_thread(_send_personal_email_sync, cfg, sender, to, cc or [], subject, html, attachments)


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


def support_ticket_html(ticket: dict) -> str:
    return f"""
<div style="font-family: -apple-system, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; color: #0f172a;">
  <p style="color: #64748b; font-size: 14px; text-transform: uppercase; letter-spacing: 1px;">Nouveau signalement — ClubPaper</p>
  <h2 style="color: #ea580c; margin: 8px 0 16px;">{ticket.get('subject','')}</h2>
  <p><strong>De :</strong> {ticket.get('user_name','')} ({ticket.get('user_email','')})</p>
  {f"<p><strong>Club :</strong> {ticket.get('club_name')}</p>" if ticket.get('club_name') else ''}
  <p style="white-space: pre-line; background:#F8FAFC; border-radius:12px; padding:16px; margin-top:16px;">{ticket.get('message','')}</p>
</div>
"""


def support_reply_html(ticket: dict, reply_message: str) -> str:
    return f"""
<div style="font-family: -apple-system, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; color: #0f172a;">
  <p style="color: #64748b; font-size: 14px; text-transform: uppercase; letter-spacing: 1px;">ClubPaper — Réponse à votre signalement</p>
  <h2 style="color: #ea580c; margin: 8px 0 16px;">{ticket.get('subject','')}</h2>
  <p style="white-space: pre-line;">{reply_message}</p>
  <div style="margin-top: 24px; padding-top: 16px; border-top: 1px solid #E2E8F0; color: #64748b; font-size: 13px;">
    <p style="margin:0 0 4px;">Votre message initial :</p>
    <p style="white-space: pre-line; margin:0;">{ticket.get('message','')}</p>
  </div>
  <p style="color: #64748b; font-size: 14px; margin-top:24px;">L'équipe ClubPaper</p>
</div>
"""


def referral_signup_html(referrer_club_name: str, new_club_name: str) -> str:
    return f"""
<div style="font-family: -apple-system, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; color: #0f172a;">
  <h2 style="color: #ea580c; margin: 0 0 12px;">Bonne nouvelle, {referrer_club_name} ! 🎉</h2>
  <p><b>{new_club_name}</b> vient de créer son compte ClubPaper grâce à votre lien de parrainage.</p>
  <p>Dès que {new_club_name} choisira l'abonnement, vous recevrez automatiquement <b>un mois offert</b> sur votre propre abonnement — aucune démarche à faire de votre côté.</p>
  <p style="color: #64748b; font-size: 14px; margin-top:24px;">Merci de faire connaître ClubPaper autour de vous !</p>
  <p style="color: #64748b; font-size: 14px;">L'équipe ClubPaper</p>
</div>
"""


def referral_reward_html(referrer_club_name: str, referred_club_name: str, total_months: int) -> str:
    return f"""
<div style="font-family: -apple-system, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; color: #0f172a;">
  <h2 style="color: #ea580c; margin: 0 0 12px;">Un mois offert pour {referrer_club_name} 🎁</h2>
  <p><b>{referred_club_name}</b>, que vous avez parrainé, vient de choisir l'abonnement ClubPaper.</p>
  <p>Comme promis, <b>un mois est offert</b> sur votre abonnement — il a été appliqué automatiquement. Vous avez maintenant {total_months} mois offert{'s' if total_months > 1 else ''} au total grâce au parrainage.</p>
  <p style="color: #64748b; font-size: 14px; margin-top:24px;">Continuez à parrainer d'autres clubs depuis Paramètres pour cumuler encore plus de mois offerts.</p>
  <p style="color: #64748b; font-size: 14px;">L'équipe ClubPaper</p>
</div>
"""


def referral_pending_html(referrer_club_name: str, pending_months: int) -> str:
    return f"""
<div style="font-family: -apple-system, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; color: #0f172a;">
  <h2 style="color: #ea580c; margin: 0 0 12px;">Un club que vous avez parrainé vient de s'abonner ! 🎉</h2>
  <p>Bonjour {referrer_club_name},</p>
  <p>Comme promis, un mois est offert sur votre futur abonnement. Vous êtes encore en plan gratuit ou en essai : ce mois sera appliqué automatiquement dès que vous choisirez l'abonnement vous-même.</p>
  <p>Vous avez actuellement <b>{pending_months} mois offert{'s' if pending_months > 1 else ''}</b> en attente.</p>
  <p style="color: #64748b; font-size: 14px; margin-top:24px;">L'équipe ClubPaper</p>
</div>
"""


def trial_reminder_html(club_name: str, days_left: int, usage_line: str) -> str:
    urgency = "se termine demain" if days_left <= 1 else f"se termine dans {days_left} jours"
    return f"""
<div style="font-family: -apple-system, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; color: #0f172a;">
  <h2 style="color: #ea580c; margin: 0 0 12px;">Votre essai {urgency}</h2>
  <p>Bonjour,</p>
  <p>Votre essai gratuit de <b>{club_name}</b> {urgency}. Pas d'inquiétude : rien ne sera coupé brutalement, mais certaines fonctionnalités seront limitées si vous ne choisissez pas de formule.</p>
  {f'<p style="background:#F8FAFC; border-radius:12px; padding:14px;">{usage_line}</p>' if usage_line else ''}
  <table style="width:100%; border-collapse: collapse; margin-top:16px;">
    <tr>
      <td style="padding:12px; border:1px solid #E2E8F0; border-radius:8px; vertical-align:top;">
        <b>Rester en gratuit</b><br/>
        <span style="color:#64748b; font-size:13px;">25 adhérents max, 2 annonces/mois, pas de paiement en ligne ni de SMS.</span>
      </td>
      <td style="width:12px;"></td>
      <td style="padding:12px; border:2px solid #EA580C; border-radius:8px; vertical-align:top;">
        <b>Engagement saison</b><br/>
        <span style="color:#64748b; font-size:13px;">19,99€/mois, sans limite, engagement 1 saison (6 mois).</span>
      </td>
    </tr>
  </table>
  <p style="margin-top:20px;">Rendez-vous dans Paramètres pour choisir votre formule.</p>
  <p style="color: #64748b; font-size: 14px; margin-top:24px;">L'équipe ClubPaper</p>
</div>
"""


def trial_ended_html(club_name: str) -> str:
    return f"""
<div style="font-family: -apple-system, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; color: #0f172a;">
  <h2 style="color: #ea580c; margin: 0 0 12px;">Votre essai est terminé</h2>
  <p>Bonjour,</p>
  <p>L'essai gratuit de <b>{club_name}</b> est terminé. Votre club reste pleinement accessible, en plan gratuit : jusqu'à 25 adhérents, 2 annonces par mois, sans paiement en ligne ni SMS.</p>
  <p>Vous pouvez passer à l'abonnement « Engagement saison » à tout moment depuis Paramètres pour débloquer toutes les fonctionnalités.</p>
  <p style="color: #64748b; font-size: 14px; margin-top:24px;">L'équipe ClubPaper</p>
</div>
"""


def lead_campaign_html(lead_name: str, landing_url: str, sender_name: str = "") -> str:
    """Outbound prospecting email sent to a club found via the leads CRM —
    presents ClubPaper's value (time saved, fewer unpaid fees, free trial)."""
    signature = f"<p style=\"margin-top:4px;\">{sender_name}<br/>ClubPaper</p>" if sender_name else "<p style=\"margin-top:4px;\">L'équipe ClubPaper</p>"
    return f"""
<div style="font-family: -apple-system, sans-serif; max-width: 580px; margin: 0 auto; padding: 24px; color: #0f172a;">
  <h2 style="color: #ea580c; margin: 0 0 16px;">Bonjour {lead_name},</h2>
  <p>Je me permets de vous contacter car de nombreux clubs amateurs comme le vôtre passent encore des heures chaque semaine sur Excel, WhatsApp et les relances de cotisations par téléphone.</p>
  <p><b>ClubPaper</b> rassemble tout ça dans un seul outil simple, pensé pour des bénévoles — pas pour des informaticiens :</p>
  <ul style="line-height:1.8; padding-left:20px;">
    <li><b>Des heures gagnées chaque semaine</b> : fiche adhérent, cotisations et planning centralisés, fini les tableurs à jour manuellement.</li>
    <li><b>Moins d'impayés</b> : relances automatiques par email (et SMS en option), paiement en ligne en 2 clics pour les familles.</li>
    <li><b>Une communication fluide</b> : annonces et changements de créneaux envoyés automatiquement à tous les adhérents concernés.</li>
    <li><b>Une image professionnelle</b> : une page publique à vos couleurs, générée automatiquement, pour attirer de nouveaux adhérents.</li>
  </ul>
  <p>Résultat pour un club de taille moyenne : plusieurs heures de gestion économisées chaque mois, et une trésorerie plus prévisible grâce à des cotisations mieux suivies.</p>
  <p style="text-align: center; margin: 28px 0;">
    <a href="{landing_url}" style="background: #ea580c; color: white; padding: 14px 28px; text-decoration: none; border-radius: 12px; font-weight: 600;">Découvrir ClubPaper — essai gratuit 30 jours</a>
  </p>
  <p>Sans carte bancaire, sans engagement pendant l'essai. Si ça ne convient pas à votre club, vous pouvez repartir sans frais.</p>
  <p>Des questions ? Répondez simplement à cet email, je me ferai un plaisir d'y répondre.</p>
  {signature}
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
