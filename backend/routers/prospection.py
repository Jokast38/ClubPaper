"""Partie D — prospecting dashboard: funnel, sales-activity metrics,
rejection-reason breakdown, "hot" free/trial clubs, CSV export.

Everything here is read-only aggregation over the existing leads/
lead_activities/appointments/clubs collections — no new collections.
"""
import csv
import io
from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, HTTPException, Depends, Query
from fastapi.responses import Response

from database import get_db
from deps import platform_admin_user
from models import LEAD_STATUSES, LEAD_EXIT_STATUSES, REJECTION_REASONS

router = APIRouter(prefix="/admin/prospection", tags=["prospection"])

PIPELINE_ORDER = [s for s in LEAD_STATUSES if s not in LEAD_EXIT_STATUSES]
HOT_CLUB_TRIAL_WINDOW_DAYS = 7


def _period_bounds(period_days: int):
    end = datetime.now(timezone.utc)
    start = end - timedelta(days=period_days)
    return start.isoformat(), end.isoformat()


def _lead_filter(source: str, employee_id: str) -> dict:
    query = {}
    if source:
        query["source"] = source
    if employee_id:
        query["assigned_to_user_id"] = employee_id
    return query


@router.get("/funnel")
async def prospection_funnel(
    period_days: int = Query(90, ge=1, le=3650),
    source: str = Query(""),
    employee_id: str = Query(""),
    user: dict = Depends(platform_admin_user),
):
    """Current-status snapshot funnel: counts per pipeline stage (a lead
    counts toward every stage up to and including its current one), plus the
    step-to-step conversion rate. `refus`/`injoignable` are reported
    separately as exits, not as pipeline stages."""
    db = get_db()
    start, _ = _period_bounds(period_days)
    query = {**_lead_filter(source, employee_id), "created_at": {"$gte": start}}

    reached = {s: 0 for s in PIPELINE_ORDER}
    exits = {s: 0 for s in LEAD_EXIT_STATUSES}
    async for lead in db.leads.find(query, {"_id": 0, "status": 1}):
        status = lead.get("status")
        if status in PIPELINE_ORDER:
            idx = PIPELINE_ORDER.index(status)
            for s in PIPELINE_ORDER[: idx + 1]:
                reached[s] += 1
        elif status in exits:
            exits[status] += 1

    conversion_rates = {}
    for i in range(len(PIPELINE_ORDER) - 1):
        a, b = PIPELINE_ORDER[i], PIPELINE_ORDER[i + 1]
        conversion_rates[f"{a}->{b}"] = round(reached[b] / reached[a] * 100, 1) if reached[a] else 0.0

    return {"stage_counts": reached, "exit_counts": exits, "conversion_rates": conversion_rates, "period_days": period_days}


@router.get("/activity")
async def prospection_activity(
    period_days: int = Query(30, ge=1, le=3650),
    source: str = Query(""),
    employee_id: str = Query(""),
    user: dict = Depends(platform_admin_user),
):
    """Sales-activity metrics over the period: calls made, decision-makers
    reached, appointments booked, conversions to client_payant."""
    db = get_db()
    start, end = _period_bounds(period_days)

    lead_query = _lead_filter(source, employee_id)
    lead_ids = None
    if lead_query:
        lead_ids = [l["id"] async for l in db.leads.find(lead_query, {"_id": 0, "id": 1})]

    call_query = {"type": "call", "created_at": {"$gte": start, "$lte": end}}
    if employee_id:
        call_query["author_id"] = employee_id
    if lead_ids is not None:
        call_query["lead_id"] = {"$in": lead_ids}
    calls = await db.lead_activities.find(call_query, {"_id": 0}).to_list(100000)
    calls_made = len(calls)
    reached_calls = [c for c in calls if c.get("call_outcome") == "reached"]

    decision_makers_reached = 0
    if reached_calls:
        reached_lead_ids = list({c["lead_id"] for c in reached_calls})
        decision_makers_reached = await db.leads.count_documents({
            "id": {"$in": reached_lead_ids}, "decision_maker_role": {"$nin": [None, ""]},
        })

    appt_query = {"created_at": {"$gte": start, "$lte": end}}
    if employee_id:
        appt_query["assigned_to_user_id"] = employee_id
    if lead_ids is not None:
        appt_query["lead_id"] = {"$in": lead_ids}
    appointments_booked = await db.appointments.count_documents(appt_query)

    conv_query = {"type": "status_change", "to_status": "client_payant", "created_at": {"$gte": start, "$lte": end}}
    if employee_id:
        conv_query["author_id"] = employee_id
    if lead_ids is not None:
        conv_query["lead_id"] = {"$in": lead_ids}
    conversions = await db.lead_activities.count_documents(conv_query)

    return {
        "period_days": period_days,
        "calls_made": calls_made,
        "decision_makers_reached": decision_makers_reached,
        "appointments_booked": appointments_booked,
        "conversions": conversions,
    }


@router.get("/rejections")
async def prospection_rejections(
    period_days: int = Query(90, ge=1, le=3650),
    source: str = Query(""),
    employee_id: str = Query(""),
    user: dict = Depends(platform_admin_user),
):
    db = get_db()
    start, _ = _period_bounds(period_days)
    query = {**_lead_filter(source, employee_id), "status": "refus", "updated_at": {"$gte": start}}
    breakdown = {r: 0 for r in REJECTION_REASONS}
    async for lead in db.leads.find(query, {"_id": 0, "rejection_reason": 1}):
        reason = lead.get("rejection_reason") or "autre"
        if reason in breakdown:
            breakdown[reason] += 1
    return {"breakdown": breakdown, "total": sum(breakdown.values()), "period_days": period_days}


@router.get("/hot-clubs")
async def prospection_hot_clubs(user: dict = Depends(platform_admin_user)):
    """Free/trial clubs that are prime upgrade candidates: already hit a
    plan limit, or a trial ending within the next week — reuses the limit
    tracking that already exists for the self-service upgrade prompts."""
    db = get_db()
    soon = (datetime.now(timezone.utc) + timedelta(days=HOT_CLUB_TRIAL_WINDOW_DAYS)).isoformat()
    now = datetime.now(timezone.utc).isoformat()
    query = {
        "plan": {"$in": ["free", "trial"]},
        "$or": [
            {"upgrade_prompt_count": {"$gt": 0}},
            {"plan": "trial", "trial_ends_at": {"$gte": now, "$lte": soon}},
        ],
    }
    clubs = await db.clubs.find(query, {"_id": 0, "id": 1, "name": 1, "plan": 1, "upgrade_prompt_count": 1, "trial_ends_at": 1, "owner_id": 1}).sort("upgrade_prompt_count", -1).to_list(200)
    owner_ids = [c["owner_id"] for c in clubs if c.get("owner_id")]
    owners = await db.users.find({"id": {"$in": owner_ids}}, {"_id": 0, "id": 1, "email": 1}).to_list(len(owner_ids) or 1)
    owners_by_id = {o["id"]: o["email"] for o in owners}
    for c in clubs:
        c["owner_email"] = owners_by_id.get(c.get("owner_id"), "")
    return clubs


@router.get("/export")
async def export_csv(
    table: str = Query(..., pattern="^(funnel|activity|rejections|hot_clubs)$"),
    period_days: int = Query(90, ge=1, le=3650),
    source: str = Query(""),
    employee_id: str = Query(""),
    user: dict = Depends(platform_admin_user),
):
    db = get_db()
    buf = io.StringIO()
    writer = csv.writer(buf)

    if table == "funnel":
        data = await prospection_funnel(period_days=period_days, source=source, employee_id=employee_id, user=user)
        writer.writerow(["etape", "nb_leads"])
        for stage, count in data["stage_counts"].items():
            writer.writerow([stage, count])
        writer.writerow([])
        writer.writerow(["sortie", "nb_leads"])
        for stage, count in data["exit_counts"].items():
            writer.writerow([stage, count])
        writer.writerow([])
        writer.writerow(["transition", "taux_conversion_pct"])
        for k, v in data["conversion_rates"].items():
            writer.writerow([k, v])
    elif table == "activity":
        data = await prospection_activity(period_days=period_days, source=source, employee_id=employee_id, user=user)
        writer.writerow(["indicateur", "valeur"])
        for k, v in data.items():
            writer.writerow([k, v])
    elif table == "rejections":
        data = await prospection_rejections(period_days=period_days, source=source, employee_id=employee_id, user=user)
        writer.writerow(["motif", "nb_leads"])
        for reason, count in data["breakdown"].items():
            writer.writerow([reason, count])
    else:  # hot_clubs
        clubs = await prospection_hot_clubs(user=user)
        writer.writerow(["club", "plan", "alertes_limite", "fin_essai", "email_contact"])
        for c in clubs:
            writer.writerow([c["name"], c["plan"], c.get("upgrade_prompt_count", 0), c.get("trial_ends_at", ""), c.get("owner_email", "")])

    return Response(
        content=buf.getvalue(), media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="prospection_{table}.csv"'},
    )
