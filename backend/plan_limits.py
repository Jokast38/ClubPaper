"""Free-plan enforcement — limits, upgrade-prompt logging, plan helpers.

Every limit here is checked server-side (not just hidden in the UI), so a
free-plan club can't bypass a ceiling by calling the API directly. Messages
are written in the app's existing tone: plain, for a volunteer, never
guilt-tripping or pushy.
"""
from datetime import datetime, timezone, timedelta
from fastapi import HTTPException

from database import get_db
from deps import serialize

FREE_MEMBER_LIMIT = 25
FREE_ANNOUNCEMENT_MONTHLY_LIMIT = 2


def is_free_plan(club: dict) -> bool:
    return (club or {}).get("plan", "trial") == "free"


async def log_upgrade_prompt(club_id: str, limit_type: str):
    from models import UpgradePrompt
    db = get_db()
    await db.upgrade_prompts.insert_one(serialize(UpgradePrompt(club_id=club_id, limit_type=limit_type)))
    await db.clubs.update_one({"id": club_id}, {"$inc": {"upgrade_prompt_count": 1}})


async def check_member_limit(club: dict):
    """Raise if this free-plan club already has FREE_MEMBER_LIMIT active members."""
    if not is_free_plan(club):
        return
    db = get_db()
    count = await db.members.count_documents({"club_id": club["id"]})
    if count >= FREE_MEMBER_LIMIT:
        await log_upgrade_prompt(club["id"], "member_limit")
        raise HTTPException(
            403,
            f"Vous avez atteint la limite de {FREE_MEMBER_LIMIT} adhérents du plan gratuit. "
            "Passez à l'abonnement pour accueillir plus de monde.",
        )


async def check_announcement_limit(club: dict):
    """Raise if this free-plan club already published FREE_ANNOUNCEMENT_MONTHLY_LIMIT
    announcements in the last rolling 30 days."""
    if not is_free_plan(club):
        return
    db = get_db()
    since = (datetime.now(timezone.utc) - timedelta(days=30)).isoformat()
    count = await db.announcements.count_documents({"club_id": club["id"], "created_at": {"$gte": since}})
    if count >= FREE_ANNOUNCEMENT_MONTHLY_LIMIT:
        await log_upgrade_prompt(club["id"], "announcement_limit")
        raise HTTPException(
            403,
            f"Limite de {FREE_ANNOUNCEMENT_MONTHLY_LIMIT} annonces/mois atteinte en plan gratuit. "
            "Passez à l'abonnement pour communiquer sans limite.",
        )


async def check_payment_allowed(club: dict):
    """Raise if this free-plan club tries to open a member-facing Stripe payment link."""
    if is_free_plan(club):
        await log_upgrade_prompt(club["id"], "payment_blocked")
        raise HTTPException(403, "Passez au plan payant pour activer le paiement en ligne.")
