"""Pydantic models for ClubManager."""
from datetime import datetime, timezone, timedelta
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
    referral_code: Optional[str] = None  # from ?ref=... on the register page; consumed when the club is created


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
    is_sales_employee: bool = False  # sales rep — access to the leads call-tracking workspace, no club of their own
    pending_referral_code: Optional[str] = None  # carried from registration to club creation (onboarding)
    email_signature: str = ""  # personal HTML signature, auto-appended when composing from the admin mailbox
    telegram_chat_id: Optional[str] = None  # personal Telegram alerts (new leads, tickets, signups...) via the platform bot
    created_at: datetime = Field(default_factory=_now)


class EmployeeCreate(BaseModel):
    email: EmailStr
    password: str = Field(min_length=6)
    name: str


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
    subscription_status: str = "trial"  # trial, active, past_due — kept for the admin dashboard; `plan` below is the real gate
    trial_ends_at: datetime = Field(default_factory=lambda: _now())
    stripe_customer_id: Optional[str] = None
    owner_id: str

    # ---- Plan & billing lifecycle ----
    plan: str = "trial"  # free, trial, paid — this is what every limit check reads
    trial_started_at: datetime = Field(default_factory=_now)
    commitment_started_at: Optional[datetime] = None  # set when the club picks "Engagement saison"
    commitment_ends_at: Optional[datetime] = None      # resignation is blocked until this date
    billing_mode: Optional[str] = None  # "monthly" or "season_upfront" once plan == "paid"
    upgrade_prompt_count: int = 0  # how many times a free-plan limit has blocked this club — "hot lead" signal
    trial_reminder_5_sent: bool = False  # idempotency flags for the daily trial-lifecycle job
    trial_reminder_1_sent: bool = False

    # ---- Referral program ----
    referral_code: str = Field(default_factory=lambda: _uid()[:8].upper())
    referred_by_club_id: Optional[str] = None
    referral_reward_applied: bool = False  # true once converting THIS club has credited its referrer (no double-credit)
    referral_credits_months: int = 0     # months already applied to this club's own billing as a referrer reward
    referral_pending_credits: int = 0    # reward months earned while this club wasn't paid yet, applied once it converts

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
    telegram_bot_token: Optional[str] = ""
    telegram_chat_id: Optional[str] = ""
    telegram_enabled: bool = False


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
    telegram_configured: bool = False
    telegram_enabled: bool = False


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


# ---------- Upgrade prompts (free-plan limits that blocked an action) ----------
class UpgradePrompt(BaseModel):
    """Logged every time a free-plan limit blocks an action — lets the platform
    admin spot clubs that keep hitting a ceiling (prime upgrade candidates)."""
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=_uid)
    club_id: str
    limit_type: str  # "payment_blocked", "sms_blocked", "announcement_limit", "member_limit"
    created_at: datetime = Field(default_factory=_now)


# ---------- Sales leads (prospecting CSV import + call tracking) ----------
# Pipeline (Partie A): "refus" and "injoignable" are exit statuses — a lead can
# be moved to either from anywhere in the pipeline.
LEAD_STATUSES = [
    "nouveau", "a_appeler", "contacte", "interesse", "rdv_planifie",
    "essai_demarre", "club_actif", "client_payant",
    "refus", "injoignable",
]
LEAD_EXIT_STATUSES = ["refus", "injoignable"]

# One-time migration map for leads created before this pipeline existed —
# consumed by server.py's startup backfill, never read at request time.
LEAD_STATUS_MIGRATION = {
    "new": "nouveau",
    "interested": "interesse",
    "not_interested": "refus",
    "converted": "client_payant",
    "unreachable": "injoignable",
}

REJECTION_REASONS = ["trop_cher", "deja_equipe", "pas_le_temps", "decision_bureau", "pas_interesse", "autre"]

CURRENT_TOOLS = ["excel", "whatsapp", "helloasso", "assoconnect", "footclubs", "autre"]
DECISION_MAKER_ROLES = ["president", "tresorier", "secretaire", "autre"]
INTEREST_LEVELS = ["froid", "tiede", "chaud"]
BUYING_HORIZONS = ["maintenant", "avant_saison", "plus_tard"]


class LeadCreate(BaseModel):
    name: str
    email: Optional[str] = ""
    phone: Optional[str] = ""
    address: Optional[str] = ""
    postal_code: Optional[str] = ""
    city: Optional[str] = ""
    website: Optional[str] = ""
    description: Optional[str] = ""  # the RNA "objet" free-text field, useful context for the caller
    source: str = "import"  # import, rna_import, csv_import, annuaire, manuel
    external_id: Optional[str] = ""  # e.g. id_rna, used to de-duplicate re-imports


class Lead(LeadCreate):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=_uid)
    status: str = "nouveau"
    notes: str = ""  # legacy free-text field, superseded by LeadActivity notes — kept for old records
    assigned_to_user_id: Optional[str] = None
    assigned_to_name: str = ""
    campaign_sent_at: Optional[datetime] = None
    last_contacted_at: Optional[datetime] = None
    contact_source: str = ""  # where the phone/email came from: rna, google_places, site_web, revendication...

    # ---- Anti-doublon (indexed, computed server-side from name/city/phone on every write) ----
    name_city_key: str = ""
    phone_key: str = ""
    probable_duplicate_of: List[str] = Field(default_factory=list)

    # ---- Qualification criteria (Partie A) — all optional ----
    sport: Optional[str] = ""
    estimated_member_count: Optional[int] = None
    estimated_team_count: Optional[int] = None
    current_tool: Optional[str] = ""  # one of CURRENT_TOOLS, free text accepted too
    decision_maker_role: Optional[str] = ""  # one of DECISION_MAKER_ROLES
    interest_level: Optional[str] = ""  # one of INTEREST_LEVELS
    buying_horizon: Optional[str] = ""  # one of BUYING_HORIZONS
    priority_score: int = 0  # recomputed server-side whenever qualification fields change — see lead_scoring.py

    # ---- Rejection ----
    rejection_reason: Optional[str] = ""  # one of REJECTION_REASONS, required when status -> refus
    rejection_note: Optional[str] = ""  # free text for "autre"

    # ---- Compliance (Partie F) ----
    do_not_call: bool = False
    do_not_call_at: Optional[datetime] = None
    do_not_call_source: str = ""  # unsubscribe_link, manual, phone_request...

    # ---- Call-queue assignment & reminders (Partie B) ----
    callback_at: Optional[datetime] = None  # next scheduled callback — surfaces the lead at the top of the queue

    # ---- Directory (Partie E) — defaults keep existing leads unpublished ----
    annuaire_visible: bool = False
    annuaire_slug: Optional[str] = None
    claim_status: str = "none"  # none, a_verifier, revendique
    claimed_by_user_id: Optional[str] = None
    claimed_club_id: Optional[str] = None
    retrait_requested: bool = False

    created_at: datetime = Field(default_factory=_now)
    updated_at: datetime = Field(default_factory=_now)


# ---------- Lead activity feed (Partie B) ----------
LEAD_ACTIVITY_TYPES = ["note", "status_change", "call", "email", "appointment"]
CALL_OUTCOMES = ["no_answer", "voicemail", "reached", "callback", "refus", "interesse"]


class LeadActivityCreate(BaseModel):
    type: str  # note, call (status_change/email/appointment are system-generated)
    note_type: Optional[str] = "appel"  # for type=note: appel, email, visite, interne
    text: Optional[str] = ""
    call_outcome: Optional[str] = None  # for type=call
    call_duration_seconds: Optional[int] = None
    callback_at: Optional[datetime] = None  # for call_outcome=callback


class LeadActivity(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=_uid)
    lead_id: str
    type: str
    note_type: Optional[str] = None
    text: str = ""
    author_id: str
    author_name: str = ""
    # status_change payload
    from_status: Optional[str] = None
    to_status: Optional[str] = None
    # call payload
    call_outcome: Optional[str] = None
    call_duration_seconds: Optional[int] = None
    callback_at: Optional[datetime] = None
    created_at: datetime = Field(default_factory=_now)


# ---------- Appointments (Partie C) ----------
APPOINTMENT_TYPES = ["appel_decouverte", "demo_visio", "installation_distance", "installation_sur_place"]
APPOINTMENT_STATUSES = ["planifie", "confirme", "realise", "annule", "non_presente"]


class AppointmentCreate(BaseModel):
    lead_id: str
    type: str  # one of APPOINTMENT_TYPES
    start_at: datetime
    duration_minutes: int = 30
    assigned_to_user_id: str
    location: Optional[str] = ""  # for installation_sur_place
    video_link: Optional[str] = ""  # for demo_visio
    note: Optional[str] = ""


class Appointment(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=_uid)
    lead_id: str
    type: str
    start_at: datetime
    duration_minutes: int = 30
    timezone: str = "Europe/Paris"
    assigned_to_user_id: str
    assigned_to_name: str = ""
    location: str = ""
    video_link: str = ""
    status: str = "planifie"
    note: str = ""
    reminder_day_before_sent: bool = False
    reminder_1h_sent: bool = False
    claim_token: Optional[str] = None  # set when booked via the public claim/booking link, for audit
    created_at: datetime = Field(default_factory=_now)
    updated_at: datetime = Field(default_factory=_now)


class EmployeeAvailabilitySlot(BaseModel):
    type: str  # one of APPOINTMENT_TYPES
    weekday: int  # 0 = Monday ... 6 = Sunday
    start_time: str  # "HH:MM"
    end_time: str  # "HH:MM"


class EmployeeAvailability(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=_uid)
    user_id: str
    slots: List[EmployeeAvailabilitySlot] = Field(default_factory=list)
    updated_at: datetime = Field(default_factory=_now)


# ---------- Directory claim flow (Partie E2) ----------
class ClaimRequestCreate(BaseModel):
    lead_id: str
    name: str
    role: str  # president, tresorier, secretaire, autre
    email: EmailStr
    phone: Optional[str] = ""


class ClaimRequest(ClaimRequestCreate):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=_uid)
    status: str = "pending_verification"  # pending_verification, a_verifier, verified, rejected, revoked
    verification_method: str = ""  # email_code, manual
    verified_at: Optional[datetime] = None
    verified_by_user_id: Optional[str] = None
    club_id: Optional[str] = None  # set once the club is created
    ip_address: str = ""
    created_at: datetime = Field(default_factory=_now)


# ---------- Personal admin mailbox (compose/send + templates) ----------
class EmailTemplateCreate(BaseModel):
    name: str
    subject: str
    body_html: str


class EmailTemplate(EmailTemplateCreate):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=_uid)
    user_id: str
    created_at: datetime = Field(default_factory=_now)
    updated_at: datetime = Field(default_factory=_now)


class SentEmail(BaseModel):
    """Record of an email sent from the personal admin mailbox (not the
    transactional app emails in notification_logs)."""
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=_uid)
    user_id: str
    to: List[str] = Field(default_factory=list)
    cc: List[str] = Field(default_factory=list)
    subject: str = ""
    body_html: str = ""
    attachments: List[dict] = Field(default_factory=list)  # [{filename, content_type, size}]
    status: str = "sent"  # sent, error
    error: str = ""
    created_at: datetime = Field(default_factory=_now)
