"""Minimal .ics (iCalendar) generation — no external library needed for a
single VEVENT. Attached to appointment confirmation emails (Partie C)."""
import uuid
from datetime import datetime, timedelta, timezone


def _fmt(dt: datetime) -> str:
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc).strftime("%Y%m%dT%H%M%SZ")


def _escape(text: str) -> str:
    return (text or "").replace("\\", "\\\\").replace(",", "\\,").replace(";", "\\;").replace("\n", "\\n")


def build_ics(appointment: dict, summary: str, description: str = "") -> bytes:
    start = appointment["start_at"]
    if isinstance(start, str):
        start = datetime.fromisoformat(start.replace("Z", "+00:00"))
    end = start + timedelta(minutes=appointment.get("duration_minutes", 30))
    uid = appointment.get("id") or str(uuid.uuid4())
    location = appointment.get("location") or appointment.get("video_link") or ""
    lines = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//ClubPaper//FR",
        "METHOD:PUBLISH",
        "BEGIN:VEVENT",
        f"UID:{uid}@clubpaper.fr",
        f"DTSTAMP:{_fmt(datetime.now(timezone.utc))}",
        f"DTSTART:{_fmt(start)}",
        f"DTEND:{_fmt(end)}",
        f"SUMMARY:{_escape(summary)}",
        f"DESCRIPTION:{_escape(description)}",
        f"LOCATION:{_escape(location)}",
        "STATUS:CONFIRMED",
        "END:VEVENT",
        "END:VCALENDAR",
    ]
    return ("\r\n".join(lines) + "\r\n").encode("utf-8")
