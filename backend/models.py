"""Pydantic models for ClubManager."""
from datetime import datetime, timezone
from typing import Optional, List
from pydantic import BaseModel, EmailStr, Field, ConfigDict
import uuid


def _now():
    return datetime.now(timezone.utc)


def _uid():
    return str(uuid.uuid4())


# ---------- User ----------
class UserCreate(BaseModel):
    email: EmailStr
    password: str = Field(min_length=6)
    name: str
    club_name: Optional[str] = None


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class User(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=_uid)
    email: EmailStr
    name: str
    role: str = "admin"  # admin (bureau), coach, member
    club_id: Optional[str] = None
    member_id: Optional[str] = None  # if role=member, links to Member record
    tour_seen: bool = False  # onboarding tour already shown — persisted so it doesn't reappear on another device
    tour_enabled: bool = True  # whether the guided tour is allowed to auto-start on first /app visit
    is_platform_admin: bool = False  # ClubPaper's own operator — separate from a club's "admin" (bureau) role
    created_at: datetime = Field(default_factory=_now)


# ---------- Club ----------
class ClubCreate(BaseModel):
    name: str
    sport: str = "Football"
    description: Optional[str] = ""
    address: Optional[str] = ""
    city: Optional[str] = ""
    email: Optional[str] = ""
    phone: Optional[str] = ""


class ClubTheme(BaseModel):
    primary: str = "#EA580C"
    secondary: str = "#0F172A"
    accent: str = "#FACC15"


class Club(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=_uid)
    slug: str
    name: str
    sport: str = "Football"
    description: str = ""
    address: str = ""
    city: str = ""
    email: str = ""
    phone: str = ""
    website_url: str = ""  # club's existing official website, shown as "site officiel" on the public page
    logo_data_url: str = ""  # base64 data URL
    signature_data_url: str = ""  # base64 data URL - uploaded or hand-drawn signature for attestations
    hero_image_data_url: str = ""  # base64 data URL - public page hero background (falls back to a default if empty)
    about_image_data_url: str = ""  # base64 data URL - public page "où nous trouver" illustration
    theme: ClubTheme = Field(default_factory=ClubTheme)
    teams: List[str] = Field(default_factory=list)
    season: str = "2025-2026"
    default_fee: float = 150.0
    subscription_status: str = "trial"  # trial, active, past_due
    trial_ends_at: datetime = Field(default_factory=lambda: _now())
    stripe_customer_id: Optional[str] = None
    owner_id: str
    created_at: datetime = Field(default_factory=_now)


class ClubUpdate(BaseModel):
    name: Optional[str] = None
    sport: Optional[str] = None
    description: Optional[str] = None
    address: Optional[str] = None
    city: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    website_url: Optional[str] = None
    logo_data_url: Optional[str] = None
    signature_data_url: Optional[str] = None
    hero_image_data_url: Optional[str] = None
    about_image_data_url: Optional[str] = None
    theme: Optional[ClubTheme] = None
    teams: Optional[List[str]] = None
    default_fee: Optional[float] = None


# ---------- Member ----------
class MemberCreate(BaseModel):
    first_name: str
    last_name: str
    email: Optional[str] = ""
    phone: Optional[str] = ""
    birth_date: Optional[str] = ""  # YYYY-MM-DD
    team: Optional[str] = ""
    license_status: str = "pending"  # valid, pending, expired
    medical_cert_status: str = "missing"  # ok, missing, expired
    parent_name: Optional[str] = ""
    parent_email: Optional[str] = ""
    notes: Optional[str] = ""
    fee_amount: Optional[float] = None


class Member(MemberCreate):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=_uid)
    club_id: str
    created_at: datetime = Field(default_factory=_now)


# ---------- Fee / Cotisation ----------
class Fee(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=_uid)
    club_id: str
    member_id: str
    season: str
    amount: float
    status: str = "pending"  # pending, paid, overdue
    due_date: str  # YYYY-MM-DD
    paid_at: Optional[datetime] = None
    stripe_session_id: Optional[str] = None
    reminders_sent: int = 0
    last_reminder_at: Optional[datetime] = None
    created_at: datetime = Field(default_factory=_now)


# ---------- Session (créneau) ----------
class SessionCreate(BaseModel):
    title: str
    team: Optional[str] = ""
    start_at: str  # ISO
    end_at: str
    place: str = ""
    kind: str = "training"  # training, match
    notes: Optional[str] = ""


class Session(SessionCreate):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=_uid)
    club_id: str
    created_by: str
    google_event_id: Optional[str] = None
    created_at: datetime = Field(default_factory=_now)


# ---------- Announcement ----------
class AnnouncementCreate(BaseModel):
    title: str
    body: str
    audience: str = "all"  # all, team:<name>
    send_email: bool = False


class Announcement(AnnouncementCreate):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=_uid)
    club_id: str
    author_id: str
    author_name: str
    created_at: datetime = Field(default_factory=_now)


# ---------- Prospect (from public landing) ----------
class ProspectCreate(BaseModel):
    first_name: str
    last_name: str
    email: EmailStr
    phone: Optional[str] = ""
    team_interest: Optional[str] = ""
    message: Optional[str] = ""


class Prospect(ProspectCreate):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=_uid)
    club_id: str
    status: str = "new"  # new, contacted, converted, rejected
    created_at: datetime = Field(default_factory=_now)


# ---------- Payment tracking ----------
class CheckoutRequest(BaseModel):
    lookup_key: Optional[str] = None
    fee_id: Optional[str] = None
    origin_url: str


# ---------- Documents (per member) ----------
class Document(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=_uid)
    club_id: str
    member_id: Optional[str] = None  # None = general club doc
    kind: str = "medical_cert"  # medical_cert, license, other
    original_filename: str
    storage_path: str
    content_type: str = "application/pdf"
    size: int = 0
    is_deleted: bool = False
    created_at: datetime = Field(default_factory=_now)


# ---------- Blog ----------
class BlogPostCreate(BaseModel):
    title: str
    slug: Optional[str] = None
    excerpt: Optional[str] = ""
    body: str  # markdown / plain text
    category: str = "actualite"  # actualite, saison, discipline
    cover_image: Optional[str] = ""  # data url or storage path
    published: bool = True


class BlogPost(BlogPostCreate):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=_uid)
    club_id: str
    author_name: str
    created_at: datetime = Field(default_factory=_now)
    updated_at: datetime = Field(default_factory=_now)


# ---------- Season settings ----------
class SeasonSettings(BaseModel):
    end_date: Optional[str] = None
    renewal_open_date: Optional[str] = None
    sent_end_reminder: bool = False
    sent_renewal_reminder: bool = False


# ---------- Integration settings (per club) ----------
class ClubIntegrations(BaseModel):
    resend_api_key: Optional[str] = ""
    resend_sender: Optional[str] = ""
    resend_enabled: bool = False
    stripe_secret_key: Optional[str] = ""
    stripe_publishable_key: Optional[str] = ""
    stripe_enabled: bool = False
    twilio_account_sid: Optional[str] = ""
    twilio_auth_token: Optional[str] = ""
    twilio_phone_from: Optional[str] = ""
    twilio_enabled: bool = False


class ClubIntegrationsPublic(BaseModel):
    """Redacted view — hides sensitive tokens."""
    resend_configured: bool = False
    resend_sender: Optional[str] = ""
    resend_enabled: bool = False
    stripe_configured: bool = False
    stripe_enabled: bool = False
    twilio_configured: bool = False
    twilio_phone_from: Optional[str] = ""
    twilio_enabled: bool = False


class PaymentTransaction(BaseModel):
    model_config = ConfigDict(extra="ignore")
    session_id: str
    club_id: Optional[str] = None
    user_id: Optional[str] = None
    fee_id: Optional[str] = None
    lookup_key: Optional[str] = None
    amount: float
    currency: str
    status: str = "initiated"
    payment_status: str = "pending"
    created_at: datetime = Field(default_factory=_now)
    updated_at: datetime = Field(default_factory=_now)


# ---------- Support tickets (complaints / bug reports raised from Aide) ----------
class SupportTicketCreate(BaseModel):
    subject: str
    message: str


class SupportTicket(SupportTicketCreate):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=_uid)
    club_id: Optional[str] = None
    club_name: str = ""
    user_id: str
    user_name: str = ""
    user_email: str = ""
    status: str = "new"  # new, replied, resolved
    replies: List[dict] = Field(default_factory=list)  # [{from: "admin", message, created_at}]
    created_at: datetime = Field(default_factory=_now)
