"""Offres SMS de ClubPaper : plans Club / Pro, quotas mensuels et choix du fournisseur.

- Plan Club (19,99 €/mois) : quota SMS mensuel « SMS inclus » via la passerelle ClubPaper.
- Plan Pro (29,99 €/mois)  : quota plus élevé.
- Essai : petit quota pour découvrir la fonction. Plan gratuit : pas de SMS.
- Club avec son propre Twilio ou Brevo : envois illimités, facturés par le fournisseur (pas de quota).

Le quota est compté en segments SMS (un SMS long = plusieurs SMS facturés par l'opérateur).
"""
import os
from datetime import datetime, timezone

try:
    from zoneinfo import ZoneInfo
    PARIS = ZoneInfo("Europe/Paris")
except Exception:  # Windows sans tzdata
    PARIS = timezone.utc


def _int(name: str, default: int) -> int:
    try:
        return int(os.environ.get(name, default))
    except ValueError:
        return default


TIERS = {"club": "Club", "pro": "Pro"}
PRO_PRICE_CENTS = 2999
PRO_SEASON_UPFRONT_PRICE_CENTS = 11996   # 4 mois facturés pour 6 mois d'accès, comme le plan Club
PRO_SEASON_UPGRADE_PRICE_CENTS = 4000    # passage Club saison -> Pro saison (différence)


def sms_quotas() -> dict:
    return {
        "trial": _int("SMS_QUOTA_TRIAL", 10),
        "club": _int("SMS_QUOTA_CLUB", 50),
        "pro": _int("SMS_QUOTA_PRO", 300),
    }


def plan_tier(club: dict) -> str:
    """'free', 'trial', 'club' ou 'pro'."""
    plan = (club or {}).get("plan", "trial")
    if plan == "paid":
        return "pro" if (club or {}).get("plan_tier") == "pro" else "club"
    return plan


def monthly_quota(club: dict) -> int:
    override = (club or {}).get("sms_quota_override")
    if isinstance(override, int) and override >= 0:
        return override
    return sms_quotas().get(plan_tier(club), 0)


def month_start_iso(now: datetime | None = None) -> str:
    now = (now or datetime.now(timezone.utc)).astimezone(PARIS)
    return now.replace(day=1, hour=0, minute=0, second=0, microsecond=0).astimezone(timezone.utc).isoformat()


# ---------------------------------------------------------------- fournisseurs
def own_provider(club: dict) -> str | None:
    """Fournisseur SMS propre au club (illimité, facturé au club), ou None."""
    it = (club or {}).get("integrations") or {}
    if it.get("brevo_enabled") and it.get("brevo_api_key"):
        return "brevo"
    if it.get("twilio_enabled") and it.get("twilio_account_sid") and it.get("twilio_auth_token") and it.get("twilio_phone_from"):
        return "twilio"
    return None


def gateway_available() -> bool:
    return bool(os.environ.get("CLUBPAPER_SMS_URL") and os.environ.get("CLUBPAPER_SMS_API_KEY"))


def sms_provider(club: dict) -> str | None:
    """Fournisseur qui sera utilisé : 'brevo', 'twilio', 'gateway' ou None (pas de SMS)."""
    if plan_tier(club) == "free":
        return None
    return own_provider(club) or ("gateway" if gateway_available() and monthly_quota(club) > 0 else None)


# ---------------------------------------------------------------- comptage
_GSM7 = set(
    "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?"
    "¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà"
)
_GSM7_EXT = set("^{}\\[~]|€\f")


def sms_segments(text: str) -> int:
    """Nombre de SMS facturés pour ce texte (GSM-7 : 160/153 car., sinon UCS-2 : 70/67)."""
    text = text or ""
    if all(c in _GSM7 or c in _GSM7_EXT for c in text):
        length, single, multi = sum(2 if c in _GSM7_EXT else 1 for c in text), 160, 153
    else:
        length, single, multi = len(text.encode("utf-16-le")) // 2, 70, 67
    return 1 if length <= single else -(-length // multi)


async def sms_used_this_month(db, club_id: str) -> int:
    rows = await db.sms_outbox.aggregate([
        {"$match": {"club_id": club_id, "created_at": {"$gte": month_start_iso()}, "status": {"$ne": "rejected"}}},
        {"$group": {"_id": None, "n": {"$sum": "$segments"}}},
    ]).to_list(1)
    return int(rows[0]["n"]) if rows else 0


async def sms_usage(db, club: dict) -> dict:
    provider = sms_provider(club)
    quota = monthly_quota(club)
    used = await sms_used_this_month(db, club["id"])
    unlimited = provider in ("twilio", "brevo")
    return {
        "tier": plan_tier(club),
        "provider": provider,
        "own_provider": own_provider(club),
        "gateway_available": gateway_available(),
        "quota": None if unlimited else quota,
        "used": used,
        "remaining": None if unlimited else max(quota - used, 0),
        "quotas": sms_quotas(),
        "month_start": month_start_iso(),
        "pacing": {
            "per_hour": _int("SMS_PACING_PER_HOUR_HINT", 120),
            "quiet_hours": os.environ.get("SMS_PACING_QUIET_HINT", "21h–8h"),
        },
    }
