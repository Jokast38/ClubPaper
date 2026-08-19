"""Public (unauthenticated) endpoints."""
from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import Response as FastAPIResponse

from models import ProspectCreate, Prospect
from database import get_db
from deps import serialize
from storage import get_object

router = APIRouter(prefix="/public", tags=["public"])


@router.get("/clubs/{slug}")
async def public_club(slug: str):
    db = get_db()
    club = await db.clubs.find_one({"slug": slug}, {"_id": 0, "owner_id": 0, "stripe_customer_id": 0})
    if not club:
        raise HTTPException(404, "Club introuvable")
    club["members_count"] = await db.members.count_documents({"club_id": club["id"]})
    return club


@router.post("/clubs/{slug}/prospects")
async def submit_prospect(slug: str, data: ProspectCreate):
    db = get_db()
    club = await db.clubs.find_one({"slug": slug}, {"_id": 0})
    if not club:
        raise HTTPException(404, "Club introuvable")
    prospect = Prospect(**data.model_dump(), club_id=club["id"])
    await db.prospects.insert_one(serialize(prospect))
    return {"ok": True, "message": "Votre demande a bien été reçue. Le club vous contactera prochainement."}


@router.get("/clubs/{slug}/blog")
async def public_blog_list(slug: str):
    db = get_db()
    club = await db.clubs.find_one({"slug": slug}, {"_id": 0})
    if not club:
        raise HTTPException(404, "Club introuvable")
    return await db.blog_posts.find(
        {"club_id": club["id"], "published": True},
        {"_id": 0, "body": 0},
    ).sort("created_at", -1).to_list(50)


@router.get("/clubs/{slug}/blog/{post_slug}")
async def public_blog_detail(slug: str, post_slug: str):
    db = get_db()
    club = await db.clubs.find_one({"slug": slug}, {"_id": 0})
    if not club:
        raise HTTPException(404, "Club introuvable")
    post = await db.blog_posts.find_one({"club_id": club["id"], "slug": post_slug, "published": True}, {"_id": 0})
    if not post:
        raise HTTPException(404, "Article introuvable")
    return {"post": post, "club": {"name": club["name"], "slug": club["slug"], "theme": club.get("theme", {}), "logo_data_url": club.get("logo_data_url", "")}}


@router.get("/fees/{fee_id}")
async def public_fee(fee_id: str):
    db = get_db()
    fee = await db.fees.find_one({"id": fee_id}, {"_id": 0})
    if not fee:
        raise HTTPException(404, "Cotisation introuvable")
    club = await db.clubs.find_one({"id": fee["club_id"]}, {"_id": 0})
    member = await db.members.find_one({"id": fee["member_id"]}, {"_id": 0})
    return {
        "fee": fee,
        "club": {"name": club["name"], "slug": club["slug"], "theme": club.get("theme", {}), "logo_data_url": club.get("logo_data_url", "")},
        "member": {"first_name": member["first_name"], "last_name": member["last_name"]},
    }


@router.get("/media")
async def public_media(path: str = Query(...)):
    if not path.startswith("clubmanager/clubs/") or "/media/" not in path:
        raise HTTPException(404, "Introuvable")
    try:
        data, ct = get_object(path)
    except Exception:
        raise HTTPException(404, "Introuvable")
    return FastAPIResponse(content=data, media_type=ct, headers={"Cache-Control": "public, max-age=86400"})
