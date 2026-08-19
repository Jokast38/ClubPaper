"""Notification monitoring — stats & recent logs for the club dashboard."""
from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, Depends, Query

from database import get_db
from deps import current_user, get_user_club

router = APIRouter(prefix="/notifications", tags=["notifications"])


@router.get("/stats")
async def stats(days: int = Query(30, ge=1, le=365), user: dict = Depends(current_user)):
    db = get_db()
    club = await get_user_club(user)
    since = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()

    pipeline = [
        {"$match": {"club_id": club["id"], "created_at": {"$gte": since}}},
        {"$group": {"_id": {"channel": "$channel", "status": "$status"}, "count": {"$sum": 1}}},
    ]
    rows = await db.notification_logs.aggregate(pipeline).to_list(50)
    out = {
        "email": {"sent": 0, "simulated": 0, "skipped": 0, "error": 0, "total": 0},
        "sms":   {"sent": 0, "simulated": 0, "skipped": 0, "error": 0, "total": 0},
        "days": days,
    }
    for r in rows:
        ch = r["_id"]["channel"]
        st = r["_id"]["status"]
        if ch in out and st in out[ch]:
            out[ch][st] = r["count"]
            out[ch]["total"] += r["count"]
    for ch in ("email", "sms"):
        total = out[ch]["total"]
        real_attempts = out[ch]["sent"] + out[ch]["error"]
        out[ch]["success_rate"] = round(100 * out[ch]["sent"] / real_attempts, 1) if real_attempts else None
    return out


@router.get("/logs")
async def logs(
    limit: int = Query(50, ge=1, le=200),
    channel: str = Query("", pattern="^(email|sms|)$"),
    status: str = Query("", pattern="^(sent|simulated|skipped|error|)$"),
    user: dict = Depends(current_user),
):
    db = get_db()
    club = await get_user_club(user)
    query = {"club_id": club["id"]}
    if channel:
        query["channel"] = channel
    if status:
        query["status"] = status
    return await db.notification_logs.find(query, {"_id": 0}).sort("created_at", -1).to_list(limit)
