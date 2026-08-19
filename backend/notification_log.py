"""Persistent notification log — writes send attempts to MongoDB (silent on failure)."""
import uuid
import logging
from datetime import datetime, timezone

logger = logging.getLogger(__name__)


async def log_notification(
    *,
    channel: str,          # "email" or "sms"
    status: str,           # "sent", "simulated", "skipped", "error"
    to: str,
    subject: str = "",
    club_id: str = "",
    kind: str = "",        # e.g. "reminder", "announcement", "session_change", "test"
    error: str = "",
    provider_id: str = "",
):
    """Persist a notification attempt. Never raises."""
    try:
        from database import get_db
        await get_db().notification_logs.insert_one({
            "id": str(uuid.uuid4()),
            "channel": channel,
            "status": status,
            "to": to,
            "subject": subject,
            "club_id": club_id,
            "kind": kind,
            "error": error,
            "provider_id": provider_id,
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
    except Exception as e:
        logger.warning("notification log failed: %s", e)
