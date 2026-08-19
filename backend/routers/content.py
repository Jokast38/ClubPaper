"""Blog + image uploads."""
import logging
from datetime import datetime, timezone
from typing import Optional
from fastapi import APIRouter, HTTPException, Depends, UploadFile, File, Form

from models import BlogPostCreate, BlogPost
from database import get_db
from deps import current_user, get_user_club, serialize, slugify
from sanitizer import sanitize_html
from storage import put_object, build_path

router = APIRouter(tags=["content"])
logger = logging.getLogger(__name__)

ALLOWED_IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp", "image/gif"}


# ---- Image upload ----
@router.post("/uploads/image")
async def upload_image(
    file: UploadFile = File(...),
    folder: str = Form("blog"),
    user: dict = Depends(current_user),
):
    club = await get_user_club(user)
    content = await file.read()
    if len(content) > 8 * 1024 * 1024:
        raise HTTPException(400, "Image trop volumineuse (max 8 Mo)")
    if (file.content_type or "") not in ALLOWED_IMAGE_TYPES:
        raise HTTPException(400, "Format d'image non supporté (JPEG, PNG, WEBP, GIF)")
    subfolder = folder if folder in {"blog", "misc"} else "misc"
    path = build_path(club["id"], f"media/{subfolder}", file.filename or "image.jpg")
    try:
        result = put_object(path, content, file.content_type)
    except Exception as e:
        logger.error("image upload failed: %s", e)
        raise HTTPException(500, "Impossible d'uploader l'image")
    return {"path": result["path"], "content_type": file.content_type, "size": result.get("size", len(content))}


# ---- Blog admin ----
def _slugify_post(title: str) -> str:
    return slugify(title)[:80] or "article"


async def _unique_post_slug(club_id: str, base: str, current_id: Optional[str] = None) -> str:
    db = get_db()
    s = base
    n = 1
    while True:
        existing = await db.blog_posts.find_one({"club_id": club_id, "slug": s})
        if not existing or existing.get("id") == current_id:
            return s
        n += 1
        s = f"{base}-{n}"


@router.get("/blog")
async def list_posts(user: dict = Depends(current_user)):
    club = await get_user_club(user)
    return await get_db().blog_posts.find({"club_id": club["id"]}, {"_id": 0}).sort("created_at", -1).to_list(200)


@router.post("/blog")
async def create_post(data: BlogPostCreate, user: dict = Depends(current_user)):
    club = await get_user_club(user)
    slug = await _unique_post_slug(club["id"], _slugify_post(data.slug or data.title))
    clean_body = sanitize_html(data.body)
    payload = {**data.model_dump(), "slug": slug, "body": clean_body}
    post = BlogPost(
        **payload, club_id=club["id"], author_name=user.get("name", "Bureau"),
    )
    await get_db().blog_posts.insert_one(serialize(post))
    return post.model_dump()


@router.put("/blog/{post_id}")
async def update_post(post_id: str, data: BlogPostCreate, user: dict = Depends(current_user)):
    db = get_db()
    club = await get_user_club(user)
    current = await db.blog_posts.find_one({"id": post_id, "club_id": club["id"]}, {"_id": 0})
    if not current:
        raise HTTPException(404, "Article introuvable")
    slug = await _unique_post_slug(club["id"], _slugify_post(data.slug or data.title), post_id)
    upd = data.model_dump(exclude_unset=True)
    if "body" in upd:
        upd["body"] = sanitize_html(upd["body"])
    upd["slug"] = slug
    upd["updated_at"] = datetime.now(timezone.utc).isoformat()
    await db.blog_posts.update_one({"id": post_id}, {"$set": upd})
    return await db.blog_posts.find_one({"id": post_id}, {"_id": 0})


@router.delete("/blog/{post_id}")
async def delete_post(post_id: str, user: dict = Depends(current_user)):
    club = await get_user_club(user)
    await get_db().blog_posts.delete_one({"id": post_id, "club_id": club["id"]})
    return {"ok": True}
