"""Canaux d'envoi des messages aux adhérents : email, SMS, Telegram.

Chaque type de message a ses canaux par défaut (Paramètres → Canaux d'envoi), modifiables
au moment de l'envoi (annonce, relance, demande de cotisation).

- email / SMS : un message individuel par adhérent ;
- Telegram : une publication dans le groupe ou canal Telegram des adhérents du club
  (impossible d'écrire individuellement à un adhérent sans qu'il ait parlé au bot).
"""
import html
import os
import re
from typing import Iterable, Optional

from email_utils import send_email, reminder_html, fee_request_html
from sms_utils import send_sms, sms_configured, format_phone, reminder_sms, fee_request_sms
from telegram_utils import send_members_telegram, telegram_members_configured

CHANNELS = ("email", "sms", "telegram")

KINDS = {
    "announcement": {"label": "Annonces", "allowed": ["email", "sms", "telegram"], "default": ["email", "sms", "telegram"]},
    "fee_request": {"label": "Demandes de cotisation", "allowed": ["email", "sms"], "default": ["email"]},
    "fee_reminder": {"label": "Relances de cotisation", "allowed": ["email", "sms"], "default": ["email", "sms"]},
    "session_change": {"label": "Changements de créneau", "allowed": ["email", "sms", "telegram"], "default": ["email", "sms", "telegram"]},
    "season": {"label": "Rappels de saison", "allowed": ["email", "sms", "telegram"], "default": ["email"]},
}


def available(club: dict) -> dict:
    """Canaux réellement utilisables par ce club."""
    return {"email": True, "sms": sms_configured(club), "telegram": telegram_members_configured(club)}


def club_defaults(club: dict, kind: str) -> list:
    saved = ((club or {}).get("notification_channels") or {}).get(kind)
    chosen = saved if isinstance(saved, list) else KINDS[kind]["default"]
    return [c for c in chosen if c in KINDS[kind]["allowed"]]


def resolve(club: dict, kind: str, requested: Optional[Iterable[str]] = None) -> list:
    """Canaux à utiliser : ceux demandés (ou les défauts du club), limités aux canaux autorisés et disponibles."""
    base = list(requested) if requested is not None else club_defaults(club, kind)
    ok = available(club)
    return [c for c in CHANNELS if c in base and c in KINDS[kind]["allowed"] and ok.get(c)]


def channels_view(club: dict) -> dict:
    return {
        "available": available(club),
        "kinds": {k: {"label": v["label"], "allowed": v["allowed"], "selected": club_defaults(club, k)} for k, v in KINDS.items()},
    }


def html_to_text(body: str, limit: int = 3500) -> str:
    text = re.sub(r"<\s*br\s*/?>|</p>|</li>|</h\d>", "\n", body or "", flags=re.I)
    text = re.sub(r"<li[^>]*>", "• ", text, flags=re.I)
    text = html.unescape(re.sub(r"<[^>]+>", "", text))
    text = re.sub(r"\n{3,}", "\n\n", text).strip()
    return text[:limit] + ("…" if len(text) > limit else "")


def member_email(m: dict) -> str:
    return m.get("email") or m.get("parent_email") or ""


async def notify_member(club: dict, member: dict, channels: list, *, subject: str, email_html: str, sms_text: str, kind: str) -> dict:
    """Envoie à un adhérent sur les canaux individuels choisis. Retourne {canal: statut}."""
    out = {}
    if "email" in channels and member_email(member):
        r = await send_email(member_email(member), subject, email_html, club_id=club["id"], kind=kind)
        out["email"] = (r or {}).get("status")
    if "sms" in channels and member.get("phone"):
        r = await send_sms(club, format_phone(member["phone"]), sms_text, kind=kind)
        out["sms"] = r.get("status")
    return out


async def post_telegram(club: dict, channels: list, text: str, kind: str) -> Optional[str]:
    if "telegram" not in channels:
        return None
    return (await send_members_telegram(club, text, kind=kind)).get("status")


async def send_fee_message(club: dict, fee: dict, member: dict, channels: list, *, mode: str, level: int = 0, kind: str = "") -> dict:
    """Demande de cotisation (mode='request') ou relance (mode='reminder') sur les canaux choisis."""
    pay_url = f"{os.environ.get('FRONTEND_URL', '')}/pay/{fee['id']}"
    name = f"{member.get('first_name', '')} {member.get('last_name', '')}".strip()
    if mode == "request":
        subject = f"Cotisation {club.get('season', '')} — {club['name']}"
        email_html = fee_request_html(club["name"], name, fee["amount"], pay_url, fee.get("due_date", ""))
        sms_text = fee_request_sms(club["name"], member.get("first_name", ""), fee["amount"], pay_url)
    else:
        subject = f"Rappel cotisation — {club['name']}"
        email_html = reminder_html(club["name"], name, fee["amount"], pay_url, level)
        sms_text = reminder_sms(club["name"], member.get("first_name", ""), fee["amount"], pay_url)
    return await notify_member(club, member, channels, subject=subject, email_html=email_html,
                               sms_text=sms_text, kind=kind or ("fee_request" if mode == "request" else "reminder"))
