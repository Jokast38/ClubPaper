"""Appointment booking (Partie C): employee availability, CRUD, confirmation
emails + .ics, and booking-link generation for the public (no-login) flow.
"""
import asyncio
import logging
from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, HTTPException, Depends, Query
from pymongo.errors import DuplicateKeyError

from database import get_db
from deps import platform_admin_user, sales_user, serialize, frontend_url
from models import (
    Appointment, AppointmentCreate, APPOINTMENT_TYPES, APPOINTMENT_STATUSES,
    EmployeeAvailability, EmployeeAvailabilityUpdate, BookingLink, LeadActivity,
)
from appointment_scheduling import has_conflict, compute_free_slots, DEFAULT_DURATION_MINUTES, ACTIVE_APPOINTMENT_STATUSES
from ics_utils import build_ics
from email_utils import send_email, appointment_confirmation_html, appointment_cancelled_html, booking_link_html
from telegram_utils import notify_admins_telegram
from routers.admin import _assert_can_touch_lead

router = APIRouter(prefix="/admin", tags=["appointments"])
logger = logging.getLogger(__name__)

LEAD_RDV_ELIGIBLE_STATUSES = {"nouveau", "a_appeler", "contacte", "interesse"}


def _scope_appointments(query: dict, user: dict) -> dict:
    if user.get("is_platform_admin"):
        return query
    return {**query, "assigned_to_user_id": user["id"]}


# ---- Availability ----
@router.get("/availability")
async def get_my_availability(user: dict = Depends(sales_user)):
    db = get_db()
    avail = await db.employee_availability.find_one({"user_id": user["id"]}, {"_id": 0})
    return avail or {"user_id": user["id"], "slots": []}


@router.put("/availability")
async def set_my_availability(data: EmployeeAvailabilityUpdate, user: dict = Depends(sales_user)):
    db = get_db()
    for slot in data.slots:
        if slot.type not in APPOINTMENT_TYPES:
            raise HTTPException(400, "Type de rendez-vous invalide")
        if not (0 <= slot.weekday <= 6):
            raise HTTPException(400, "Jour de la semaine invalide")
        if slot.start_time >= slot.end_time:
            raise HTTPException(400, "L'heure de début doit précéder l'heure de fin")
    doc = EmployeeAvailability(user_id=user["id"], slots=data.slots)
    await db.employee_availability.update_one({"user_id": user["id"]}, {"$set": serialize(doc)}, upsert=True)
    return await db.employee_availability.find_one({"user_id": user["id"]}, {"_id": 0})


@router.get("/availability/{user_id}")
async def get_employee_availability(user_id: str, user: dict = Depends(platform_admin_user)):
    db = get_db()
    avail = await db.employee_availability.find_one({"user_id": user_id}, {"_id": 0})
    return avail or {"user_id": user_id, "slots": []}


# ---- Available slots (CRM-side, for an employee booking on behalf of a lead) ----
@router.get("/appointments/available-slots")
async def available_slots(
    type: str = Query(...),
    employee_id: str = Query(None),
    duration_minutes: int = Query(None),
    days: int = Query(14, ge=1, le=60),
    user: dict = Depends(sales_user),
):
    if type not in APPOINTMENT_TYPES:
        raise HTTPException(400, "Type de rendez-vous invalide")
    target_employee = employee_id or user["id"]
    if target_employee != user["id"] and not user.get("is_platform_admin"):
        raise HTTPException(403, "Vous ne pouvez consulter que vos propres disponibilités")
    db = get_db()
    avail = await db.employee_availability.find_one({"user_id": target_employee}, {"_id": 0})
    slots = (avail or {}).get("slots", [])
    existing = await db.appointments.find(
        {"assigned_to_user_id": target_employee, "status": {"$in": list(ACTIVE_APPOINTMENT_STATUSES)}},
        {"_id": 0, "id": 1, "assigned_to_user_id": 1, "start_at": 1, "duration_minutes": 1, "status": 1},
    ).to_list(1000)
    now = datetime.now(timezone.utc)
    free = compute_free_slots(
        slots, type, existing, duration_minutes or DEFAULT_DURATION_MINUTES.get(type, 30),
        now, now + timedelta(days=days), employee_id=target_employee,
    )
    return {"slots": [s.isoformat() for s in free]}


# ---- Appointments CRUD ----
@router.get("/appointments")
async def list_appointments(
    start: str = Query(None), end: str = Query(None), employee_id: str = Query(None),
    status: str = Query(""), user: dict = Depends(sales_user),
):
    db = get_db()
    query = {}
    if status:
        query["status"] = status
    if employee_id:
        if employee_id != user["id"] and not user.get("is_platform_admin"):
            raise HTTPException(403, "Accès refusé")
        query["assigned_to_user_id"] = employee_id
    if start:
        query["start_at"] = {"$gte": start}
    if end:
        query.setdefault("start_at", {})
        if isinstance(query["start_at"], dict):
            query["start_at"]["$lte"] = end
    query = _scope_appointments(query, user) if not employee_id else query
    return await db.appointments.find(query, {"_id": 0}).sort("start_at", 1).to_list(1000)


async def _create_appointment(db, data: AppointmentCreate, *, claim_token: str = None, notify_admin: bool = False):
    if data.type not in APPOINTMENT_TYPES:
        raise HTTPException(400, "Type de rendez-vous invalide")
    employee = await db.users.find_one({"id": data.assigned_to_user_id}, {"_id": 0})
    if not employee or not (employee.get("is_sales_employee") or employee.get("is_platform_admin")):
        raise HTTPException(400, "Employé invalide")
    lead = await db.leads.find_one({"id": data.lead_id}, {"_id": 0})
    if not lead:
        raise HTTPException(404, "Lead introuvable")

    existing = await db.appointments.find(
        {"assigned_to_user_id": data.assigned_to_user_id, "status": {"$in": list(ACTIVE_APPOINTMENT_STATUSES)}},
        {"_id": 0, "id": 1, "assigned_to_user_id": 1, "start_at": 1, "duration_minutes": 1, "status": 1},
    ).to_list(1000)
    if has_conflict(data.assigned_to_user_id, data.start_at, data.duration_minutes, existing):
        raise HTTPException(409, "Ce créneau n'est plus disponible pour cet employé")

    appointment = Appointment(
        **data.model_dump(), assigned_to_name=employee.get("name", ""), claim_token=claim_token,
    )
    try:
        await db.appointments.insert_one(serialize(appointment))
    except DuplicateKeyError:
        raise HTTPException(409, "Ce créneau n'est plus disponible pour cet employé")

    update = {"updated_at": datetime.now(timezone.utc).isoformat()}
    if lead.get("status") in LEAD_RDV_ELIGIBLE_STATUSES:
        update["status"] = "rdv_planifie"
    await db.leads.update_one({"id": data.lead_id}, {"$set": update})
    await db.lead_activities.insert_one(serialize(LeadActivity(
        lead_id=data.lead_id, type="appointment", author_id=employee["id"], author_name=employee.get("name", ""),
        text=f"Rendez-vous {data.type} planifié pour le {data.start_at.strftime('%d/%m/%Y %H:%M')}",
    )))

    ics = build_ics(appointment.model_dump(), f"ClubPaper — {data.type}", lead.get("name", ""))
    if lead.get("email"):
        asyncio.create_task(send_email(
            lead["email"], "Confirmation de votre rendez-vous ClubPaper",
            appointment_confirmation_html(appointment.model_dump(), lead.get("name", "")),
            kind="appointment_confirmation", attachments=[("rendez-vous.ics", "text/calendar", ics)],
        ))
    if employee.get("email"):
        asyncio.create_task(send_email(
            employee["email"], f"Nouveau rendez-vous — {lead.get('name','')}",
            appointment_confirmation_html(appointment.model_dump(), employee.get("name", "")),
            kind="appointment_confirmation", attachments=[("rendez-vous.ics", "text/calendar", ics)],
        ))
    if notify_admin:
        asyncio.create_task(notify_admins_telegram(
            f"📅 Nouveau rendez-vous pris par un prospect\n{lead.get('name','')} ({lead.get('city','')})\n"
            f"Type: {data.type}\nAvec: {employee.get('name','')}\nLe: {data.start_at.strftime('%d/%m/%Y %H:%M')}"
        ))
    return appointment.model_dump()


@router.post("/appointments")
async def create_appointment(data: AppointmentCreate, user: dict = Depends(sales_user)):
    db = get_db()
    await _assert_can_touch_lead(db, data.lead_id, user)
    if data.assigned_to_user_id != user["id"] and not user.get("is_platform_admin"):
        raise HTTPException(403, "Vous ne pouvez planifier un rendez-vous que pour vous-même")
    return await _create_appointment(db, data)


@router.get("/appointments/{appointment_id}")
async def get_appointment(appointment_id: str, user: dict = Depends(sales_user)):
    db = get_db()
    appt = await db.appointments.find_one({"id": appointment_id}, {"_id": 0})
    if not appt:
        raise HTTPException(404, "Rendez-vous introuvable")
    if appt["assigned_to_user_id"] != user["id"] and not user.get("is_platform_admin"):
        raise HTTPException(403, "Accès refusé")
    return appt


@router.put("/appointments/{appointment_id}")
async def update_appointment(appointment_id: str, payload: dict, user: dict = Depends(sales_user)):
    db = get_db()
    appt = await db.appointments.find_one({"id": appointment_id}, {"_id": 0})
    if not appt:
        raise HTTPException(404, "Rendez-vous introuvable")
    if appt["assigned_to_user_id"] != user["id"] and not user.get("is_platform_admin"):
        raise HTTPException(403, "Accès refusé")

    allowed = {"start_at", "duration_minutes", "status", "note", "location", "video_link"}
    update = {k: v for k, v in payload.items() if k in allowed}
    if "status" in update and update["status"] not in APPOINTMENT_STATUSES:
        raise HTTPException(400, "Statut invalide")

    reschedule = "start_at" in update
    if reschedule:
        start_at = update["start_at"]
        if isinstance(start_at, str):
            start_at = datetime.fromisoformat(start_at.replace("Z", "+00:00"))
            update["start_at"] = start_at.isoformat()
        duration = update.get("duration_minutes", appt["duration_minutes"])
        existing = await db.appointments.find(
            {"assigned_to_user_id": appt["assigned_to_user_id"], "status": {"$in": list(ACTIVE_APPOINTMENT_STATUSES)}},
            {"_id": 0, "id": 1, "assigned_to_user_id": 1, "start_at": 1, "duration_minutes": 1, "status": 1},
        ).to_list(1000)
        if has_conflict(appt["assigned_to_user_id"], start_at, duration, existing, exclude_id=appointment_id):
            raise HTTPException(409, "Ce créneau n'est plus disponible")

    update["updated_at"] = datetime.now(timezone.utc).isoformat()
    try:
        await db.appointments.update_one({"id": appointment_id}, {"$set": update})
    except DuplicateKeyError:
        raise HTTPException(409, "Ce créneau n'est plus disponible")

    updated = await db.appointments.find_one({"id": appointment_id}, {"_id": 0})
    if update.get("status") == "annule" and appt.get("status") != "annule":
        lead = await db.leads.find_one({"id": appt["lead_id"]}, {"_id": 0})
        if lead and lead.get("email"):
            asyncio.create_task(send_email(
                lead["email"], "Rendez-vous annulé", appointment_cancelled_html(updated, lead.get("name", "")),
                kind="appointment_cancelled",
            ))
    return updated


@router.delete("/appointments/{appointment_id}")
async def cancel_appointment(appointment_id: str, user: dict = Depends(sales_user)):
    return await update_appointment(appointment_id, {"status": "annule"}, user=user)


# ---- Public booking link generation ----
@router.post("/leads/{lead_id}/booking-link")
async def create_booking_link(lead_id: str, payload: dict, user: dict = Depends(sales_user)):
    appointment_type = payload.get("appointment_type")
    if appointment_type not in APPOINTMENT_TYPES:
        raise HTTPException(400, "Type de rendez-vous invalide")
    employee_id = payload.get("employee_id") or None
    db = get_db()
    lead = await _assert_can_touch_lead(db, lead_id, user)
    link = BookingLink(
        lead_id=lead_id, appointment_type=appointment_type, employee_id=employee_id,
        expires_at=datetime.now(timezone.utc) + timedelta(days=7),
    )
    await db.booking_links.insert_one(serialize(link))
    booking_url = f"{frontend_url()}/rdv/{link.id}"
    if lead.get("email"):
        from email_utils import APPOINTMENT_TYPE_LABEL
        asyncio.create_task(send_email(
            lead["email"], "Choisissez votre créneau de rendez-vous",
            booking_link_html(lead.get("name", ""), booking_url, APPOINTMENT_TYPE_LABEL.get(appointment_type, appointment_type)),
            kind="booking_link",
        ))
    return {"booking_url": booking_url, "token": link.id, "expires_at": link.expires_at.isoformat()}
