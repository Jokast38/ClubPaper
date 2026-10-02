"""Background scheduler for automatic reminders (fees + season)."""
import os
import logging
from datetime import datetime, timezone, timedelta
from apscheduler.schedulers.asyncio import AsyncIOScheduler

from email_utils import send_email, reminder_html, trial_reminder_html, trial_ended_html
from sms_utils import send_sms, sms_configured, format_phone, reminder_sms

logger = logging.getLogger("scheduler")


# Reminder intervals: (level, days_after_creation)
FEE_INTERVALS = [(1, 7), (2, 15), (3, 30)]


async def run_fee_reminders(db):
    """Send J+7 / J+15 / J+30 reminders for unpaid fees."""
    now = datetime.now(timezone.utc)
    frontend = os.environ.get("FRONTEND_URL", "")
    total_sent = 0
    for level, days in FEE_INTERVALS:
        cutoff = now - timedelta(days=days)
        fees = await db.fees.find({
            "status": {"$in": ["pending", "overdue"]},
            "reminders_sent": {"$lt": level},
        }, {"_id": 0}).to_list(5000)
        for fee in fees:
            try:
                created_at = datetime.fromisoformat(fee["created_at"].replace("Z", "+00:00"))
            except Exception:
                continue
            if created_at > cutoff:
                continue
            member = await db.members.find_one({"id": fee["member_id"]}, {"_id": 0})
            club = await db.clubs.find_one({"id": fee["club_id"]}, {"_id": 0})
            if not member or not club:
                continue
            to = member.get("email") or member.get("parent_email")
            if not to:
                continue
            pay_url = f"{frontend}/pay/{fee['id']}"
            html = reminder_html(club["name"], f"{member['first_name']} {member['last_name']}", fee["amount"], pay_url, level)
            await send_email(to, f"Rappel cotisation — {club['name']}", html, club_id=club["id"], kind="reminder_auto")
            if sms_configured(club) and member.get("phone"):
                await send_sms(club, format_phone(member["phone"]), reminder_sms(club["name"], member["first_name"], fee["amount"], pay_url), kind="reminder_auto")
            new_status = "overdue" if level >= 3 else fee["status"]
            await db.fees.update_one(
                {"id": fee["id"]},
                {"$set": {
                    "reminders_sent": level,
                    "last_reminder_at": now.isoformat(),
                    "status": new_status,
                }},
            )
            total_sent += 1
    if total_sent:
        logger.info("Sent %d automatic fee reminders", total_sent)
    return total_sent


async def run_season_reminders(db):
    """Send season-end + renewal reminders."""
    now = datetime.now(timezone.utc)
    total = 0
    async for club in db.clubs.find({}, {"_id": 0}):
        settings = club.get("season_settings") or {}
        # End of season (once, when within 30 days)
        end_str = settings.get("end_date")
        renewal_str = settings.get("renewal_open_date")
        for kind, target_str, flag in [("end", end_str, "sent_end_reminder"), ("renewal", renewal_str, "sent_renewal_reminder")]:
            if not target_str or settings.get(flag):
                continue
            try:
                target = datetime.fromisoformat(target_str)
                if target.tzinfo is None:
                    target = target.replace(tzinfo=timezone.utc)
            except Exception:
                continue
            days_to = (target - now).total_seconds() / 86400
            if 0 < days_to <= 30:
                subject, body = _season_message(club, kind, target)
                members = await db.members.find({"club_id": club["id"]}, {"_id": 0}).to_list(10000)
                for m in members:
                    to = m.get("email") or m.get("parent_email")
                    if not to:
                        continue
                    await send_email(to, subject, body, club_id=club["id"], kind=f"season_{kind}")
                    total += 1
                await db.clubs.update_one({"id": club["id"]}, {"$set": {f"season_settings.{flag}": True}})
    if total:
        logger.info("Sent %d season reminders", total)
    return total


def _season_message(club, kind, target):
    if kind == "end":
        subject = f"{club['name']} — Fin de saison approche"
        body = f"""<div style="font-family: -apple-system, sans-serif; padding: 20px; color: #0f172a;">
<h2 style="color: #ea580c;">La saison touche à sa fin</h2>
<p>La saison {club.get('season','')} se termine le <b>{target.strftime('%d/%m/%Y')}</b>.</p>
<p>Merci pour votre engagement tout au long de l'année !</p>
<p style="color:#64748b">L'équipe de {club['name']}</p></div>"""
    else:
        subject = f"{club['name']} — Renouvellement des licences"
        body = f"""<div style="font-family: -apple-system, sans-serif; padding: 20px; color: #0f172a;">
<h2 style="color: #ea580c;">Renouvelez votre licence</h2>
<p>Les inscriptions pour la nouvelle saison sont ouvertes à partir du <b>{target.strftime('%d/%m/%Y')}</b>.</p>
<p>Nous serions ravis de vous revoir au club !</p>
<p style="color:#64748b">L'équipe de {club['name']}</p></div>"""
    return subject, body


async def run_trial_lifecycle(db):
    """Daily check on trial clubs: J-5 / J-1 reminder emails, then auto-downgrade
    to the free plan at J+0 (no hard cutoff — just the free-plan ceilings kick in)."""
    now = datetime.now(timezone.utc)
    since_30d = (now - timedelta(days=30)).isoformat()
    reminders_sent = 0
    downgraded = 0

    async for club in db.clubs.find({"plan": "trial"}, {"_id": 0}):
        try:
            ends_at = datetime.fromisoformat(club["trial_ends_at"].replace("Z", "+00:00"))
        except Exception:
            continue
        days_left = (ends_at - now).total_seconds() / 86400
        owner = await db.users.find_one({"id": club.get("owner_id")}, {"_id": 0, "email": 1})
        to = club.get("email") or (owner or {}).get("email", "")
        if not to:
            continue

        if days_left <= 0:
            await db.clubs.update_one({"id": club["id"]}, {"$set": {"plan": "free"}})
            await send_email(to, f"{club['name']} — Votre essai est terminé", trial_ended_html(club["name"]), club_id=club["id"], kind="trial_ended")
            downgraded += 1
            continue

        milestone = None
        if 4 < days_left <= 5 and not club.get("trial_reminder_5_sent"):
            milestone = (5, "trial_reminder_5_sent")
        elif 0 < days_left <= 1 and not club.get("trial_reminder_1_sent"):
            milestone = (1, "trial_reminder_1_sent")
        if not milestone:
            continue

        days_label, flag = milestone
        members_count = await db.members.count_documents({"club_id": club["id"]})
        ann_count = await db.announcements.count_documents({"club_id": club["id"], "created_at": {"$gte": since_30d}})
        sms_count = await db.notification_logs.count_documents({"club_id": club["id"], "channel": "sms", "status": "sent", "created_at": {"$gte": since_30d}})
        usage_line = f"Depuis 30 jours : {members_count} adhérent(s), {ann_count} annonce(s) et {sms_count} SMS envoyé(s)."
        await send_email(
            to, f"{club['name']} — Votre essai se termine bientôt",
            trial_reminder_html(club["name"], days_label, usage_line),
            club_id=club["id"], kind="trial_reminder",
        )
        await db.clubs.update_one({"id": club["id"]}, {"$set": {flag: True}})
        reminders_sent += 1

    if reminders_sent or downgraded:
        logger.info("Trial lifecycle: %d reminder(s), %d downgrade(s)", reminders_sent, downgraded)
    return {"reminders": reminders_sent, "downgraded": downgraded}


def create_scheduler(db):
    scheduler = AsyncIOScheduler(timezone="Europe/Paris")
    # Fee reminders: every day at 09:00
    scheduler.add_job(lambda: run_fee_reminders(db), "cron", hour=9, minute=0, id="fee_reminders")
    # Season reminders: every day at 09:15
    scheduler.add_job(lambda: run_season_reminders(db), "cron", hour=9, minute=15, id="season_reminders")
    # Trial lifecycle (J-5 / J-1 reminders, J+0 downgrade to free): every day at 08:30
    scheduler.add_job(lambda: run_trial_lifecycle(db), "cron", hour=8, minute=30, id="trial_lifecycle")
    return scheduler
