"""ClubManager - FastAPI application entrypoint (slim)."""
from dotenv import load_dotenv
from pathlib import Path

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

import os
import asyncio
import logging

import stripe
from fastapi import FastAPI, APIRouter
from starlette.middleware.cors import CORSMiddleware

from database import get_db, close_client
from setup_stripe import setup_catalog
from storage import init_storage
from scheduler_jobs import create_scheduler
from models import User
from models import LEAD_STATUS_MIGRATION
from auth_utils import hash_password
from deps import serialize

from routers import auth as auth_router
from routers import clubs as clubs_router
from routers import members as members_router
from routers import fees as fees_router
from routers import activity as activity_router
from routers import content as content_router
from routers import public as public_router
from routers import notifications as notifications_router
from routers import drive as drive_router
from routers import gcal as gcal_router
from routers import admin as admin_router
from routers import mailbox as mailbox_router

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger("clubmanager")

stripe.api_key = os.environ.get("STRIPE_SECRET_KEY") or "sk_test_emergent"

app = FastAPI(title="ClubManager API")

# Aggregate all routers under /api
api = APIRouter(prefix="/api")
api.include_router(auth_router.router)
api.include_router(clubs_router.router)
api.include_router(members_router.router)
api.include_router(fees_router.router)
api.include_router(activity_router.router)
api.include_router(content_router.router)
api.include_router(public_router.router)
api.include_router(notifications_router.router)
api.include_router(drive_router.router)
api.include_router(gcal_router.router)
api.include_router(admin_router.router)
api.include_router(mailbox_router.router)


@api.get("/")
async def root():
    return {"app": "ClubManager", "status": "ok"}


app.include_router(api)


def _parse_cors_origins() -> tuple[list[str], bool]:
    """Return (allowed_origins, allow_credentials).
    Cookies require explicit origins — the CORS spec forbids '*' + credentials.
    """
    raw = (os.environ.get("CORS_ORIGINS") or "").strip()
    if not raw or raw == "*":
        # Wildcard: credentials must be False (spec) — frontend still works via Authorization header.
        return (["*"], False)
    origins = [o.strip().rstrip("/") for o in raw.split(",") if o.strip()]
    return (origins, True)


_cors_origins, _cors_creds = _parse_cors_origins()
logger.info("CORS origins: %s (credentials=%s)", _cors_origins, _cors_creds)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=_cors_creds,
    allow_origins=_cors_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)


async def _seed_admin(db):
    """Create (or promote) the platform operator account from ADMIN_EMAIL/ADMIN_PASSWORD."""
    email = (os.environ.get("ADMIN_EMAIL") or "").strip().lower()
    password = os.environ.get("ADMIN_PASSWORD") or ""
    if not email or not password:
        return
    existing = await db.users.find_one({"email": email})
    if existing:
        if not existing.get("is_platform_admin"):
            await db.users.update_one({"id": existing["id"]}, {"$set": {"is_platform_admin": True}})
            logger.info("Promoted existing account to platform admin: %s", email)
        return
    user = User(email=email, name="Admin", role="admin", is_platform_admin=True)
    doc = serialize(user)
    doc["password_hash"] = hash_password(password)
    await db.users.insert_one(doc)
    logger.info("Seeded platform admin account: %s", email)


async def _backfill_referral_codes(db):
    """One-time migration: clubs created before the referral program need a
    referral_code to be shareable, and a `plan` consistent with their
    existing subscription_status (so free-plan limits apply sensibly)."""
    import uuid
    async for club in db.clubs.find({"referral_code": {"$exists": False}}, {"_id": 0, "id": 1}):
        await db.clubs.update_one({"id": club["id"]}, {"$set": {"referral_code": uuid.uuid4().hex[:8].upper()}})
    # Legacy clubs with no `plan` field: infer it from subscription_status so
    # an already-active paying club isn't suddenly capped as free.
    await db.clubs.update_many({"plan": {"$exists": False}, "subscription_status": "active"}, {"$set": {"plan": "paid"}})
    await db.clubs.update_many({"plan": {"$exists": False}}, {"$set": {"plan": "trial"}})


async def _backfill_lead_pipeline(db):
    """One-time migration: leads created before the extended qualification
    pipeline (Partie A) need their status remapped to the new vocabulary and
    the new fields defaulted, so old documents keep working untouched."""
    for old_status, new_status in LEAD_STATUS_MIGRATION.items():
        await db.leads.update_many({"status": old_status}, {"$set": {"status": new_status}})
    await db.leads.update_many(
        {"priority_score": {"$exists": False}},
        {"$set": {
            "priority_score": 0, "do_not_call": False, "claim_status": "none",
            "annuaire_visible": False, "contact_source": "", "rejection_reason": "", "rejection_note": "",
            "name_city_key": "", "phone_key": "", "probable_duplicate_of": [],
        }},
    )
    from lead_dedupe import dedupe_key, normalize_phone
    from pymongo import UpdateOne
    # Fully materialize the batch before writing — updating the same field the
    # cursor is actively scanning on (name_city_key: "") would otherwise make
    # documents shift in and out of the index range mid-scan.
    to_backfill = await db.leads.find(
        {"name_city_key": ""}, {"_id": 0, "id": 1, "name": 1, "city": 1, "phone": 1},
    ).to_list(length=None)
    for i in range(0, len(to_backfill), 1000):
        batch = to_backfill[i:i + 1000]
        ops = [
            UpdateOne(
                {"id": lead["id"]},
                {"$set": {
                    "name_city_key": dedupe_key(lead.get("name", ""), lead.get("city", "")),
                    "phone_key": normalize_phone(lead.get("phone", "")),
                }},
            )
            for lead in batch
        ]
        if ops:
            await db.leads.bulk_write(ops, ordered=False)


@app.on_event("startup")
async def startup():
    db = get_db()
    await db.users.create_index("email", unique=True)
    await db.clubs.create_index("slug", unique=True)
    await db.members.create_index([("club_id", 1), ("last_name", 1)])
    await db.fees.create_index([("club_id", 1), ("status", 1)])
    await db.sessions.create_index([("club_id", 1), ("start_at", 1)])
    await db.documents.create_index([("club_id", 1), ("member_id", 1)])
    await db.blog_posts.create_index([("club_id", 1), ("slug", 1)], unique=True)
    await db.leads.create_index("external_id", sparse=True)
    await db.leads.create_index("status")
    await db.leads.create_index("assigned_to_user_id")
    await db.leads.create_index("do_not_call")
    await db.leads.create_index([("annuaire_visible", 1), ("sport", 1), ("city", 1)])
    await db.leads.create_index("annuaire_slug", unique=True, sparse=True)
    await db.leads.create_index("name_city_key")
    await db.leads.create_index("phone_key", sparse=True)
    await db.lead_activities.create_index([("lead_id", 1), ("created_at", -1)])
    await db.appointments.create_index([("lead_id", 1)])
    await db.appointments.create_index([("assigned_to_user_id", 1), ("start_at", 1)])
    # DB-level double-booking guard: exact same employee + exact same start time
    # cannot coexist while both are "active" bookings (cancelled ones don't block a slot).
    await db.appointments.create_index(
        [("assigned_to_user_id", 1), ("start_at", 1)],
        unique=True, partialFilterExpression={"status": {"$in": ["planifie", "confirme", "realise"]}},
        name="no_double_booking",
    )
    await db.employee_availability.create_index("user_id", unique=True)
    await db.claim_requests.create_index("lead_id")
    await db.claim_requests.create_index("email")
    await db.claim_requests.create_index("created_at")

    await _seed_admin(db)
    await _backfill_referral_codes(db)

    async def _run_lead_backfill():
        try:
            await asyncio.wait_for(_backfill_lead_pipeline(db), timeout=300)
            logger.info("Lead pipeline backfill complete.")
        except Exception as e:
            logger.warning("Lead pipeline backfill skipped/incomplete (will retry on next restart): %s", e)
    # Fire-and-forget: a slow/degraded DB connection must never delay the app
    # from accepting traffic. Safe to run alongside live requests — it only
    # touches legacy documents that are missing the new fields/keys.
    asyncio.create_task(_run_lead_backfill())

    try:
        await asyncio.to_thread(setup_catalog)
        logger.info("Stripe catalog ready.")
    except Exception as e:
        logger.warning("Stripe catalog setup skipped: %s", e)

    try:
        await asyncio.to_thread(init_storage)
        logger.info("Storage initialized.")
    except Exception as e:
        logger.warning("Storage init skipped: %s", e)

    try:
        app.state.scheduler = create_scheduler(db)
        app.state.scheduler.start()
        logger.info("Scheduler started.")
    except Exception as e:
        logger.warning("Scheduler start failed: %s", e)


@app.on_event("shutdown")
async def shutdown():
    try:
        if getattr(app.state, "scheduler", None):
            app.state.scheduler.shutdown(wait=False)
    except Exception:
        pass
    await close_client()
