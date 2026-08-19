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
    """Create the admin account from ADMIN_EMAIL/ADMIN_PASSWORD if it doesn't exist yet."""
    email = (os.environ.get("ADMIN_EMAIL") or "").strip().lower()
    password = os.environ.get("ADMIN_PASSWORD") or ""
    if not email or not password:
        return
    if await db.users.find_one({"email": email}):
        return
    user = User(email=email, name="Admin", role="admin")
    doc = serialize(user)
    doc["password_hash"] = hash_password(password)
    await db.users.insert_one(doc)
    logger.info("Seeded admin account: %s", email)


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

    await _seed_admin(db)

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
