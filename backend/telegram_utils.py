"""Telegram notifications - club-level (per-club bot) and platform-level (admin personal alerts)."""
import os
import logging
import asyncio

import requests

from notification_log import log_notification

logger = logging.getLogger(__name__)

TELEGRAM_API = "https://api.telegram.org"


def _send_sync(bot_token: str, chat_id: str, text: str) -> dict:
    resp = requests.post(
        f"{TELEGRAM_API}/bot{bot_token}/sendMessage",
        json={"chat_id": chat_id, "text": text, "parse_mode": "HTML"},
        timeout=10,
    )
    data = resp.json()
    if not data.get("ok"):
        raise RuntimeError(data.get("description") or f"HTTP {resp.status_code}")
    return data


async def send_telegram_message(bot_token: str, chat_id: str, text: str) -> dict:
    """Low-level send via the Telegram Bot API. Never raises."""
    if not (bot_token and chat_id):
        return {"status": "skipped", "reason": "missing bot_token/chat_id"}
    try:
        await asyncio.to_thread(_send_sync, bot_token, chat_id, text)
        return {"status": "sent"}
    except Exception as e:
        logger.error("Telegram send failed: %s", e)
        return {"status": "error", "error": str(e)}


def _get_club_creds(club: dict):
    integrations = (club or {}).get("integrations") or {}
    bot_token = integrations.get("telegram_bot_token") or ""
    chat_id = integrations.get("telegram_chat_id") or ""
    enabled = bool(integrations.get("telegram_enabled"))
    return bot_token, chat_id, enabled


def telegram_configured(club: dict) -> bool:
    bot_token, chat_id, enabled = _get_club_creds(club)
    return bool(enabled and bot_token and chat_id)


async def send_club_telegram(club: dict, text: str, *, kind: str = "") -> dict:
    """Send a club-level Telegram notification (bureau channel). Never raises."""
    club_id = (club or {}).get("id", "")
    bot_token, chat_id, enabled = _get_club_creds(club)
    if not enabled:
        await log_notification(channel="telegram", status="skipped", to=chat_id, subject=text[:80], club_id=club_id, kind=kind, error="telegram not enabled")
        return {"status": "skipped", "reason": "telegram not enabled"}
    if not (bot_token and chat_id):
        await log_notification(channel="telegram", status="skipped", to=chat_id, subject=text[:80], club_id=club_id, kind=kind, error="not configured")
        return {"status": "skipped", "reason": "not configured"}
    result = await send_telegram_message(bot_token, chat_id, text)
    await log_notification(channel="telegram", status=result["status"], to=chat_id, subject=text[:80], club_id=club_id, kind=kind, error=result.get("error", ""))
    return result


def _platform_bot_token() -> str:
    return os.environ.get("TELEGRAM_BOT_TOKEN", "")


async def notify_admin_telegram(chat_id: str, text: str) -> dict:
    """Send a personal alert to one platform admin via the platform's own bot."""
    bot_token = _platform_bot_token()
    if not bot_token:
        return {"status": "skipped", "reason": "TELEGRAM_BOT_TOKEN not set"}
    return await send_telegram_message(bot_token, chat_id, text)


async def notify_admins_telegram(text: str) -> None:
    """Broadcast a personal alert to every platform admin who set a telegram_chat_id."""
    bot_token = _platform_bot_token()
    if not bot_token:
        return
    try:
        from database import get_db
        db = get_db()
        cursor = db.users.find({"is_platform_admin": True, "telegram_chat_id": {"$exists": True, "$ne": None, "$ne": ""}})
        admins = await cursor.to_list(length=100)
    except Exception as e:
        logger.error("notify_admins_telegram: failed to fetch admins: %s", e)
        return
    for admin in admins:
        chat_id = admin.get("telegram_chat_id")
        if chat_id:
            await send_telegram_message(bot_token, chat_id, text)
