from datetime import datetime, timezone
from ics_utils import build_ics


def test_build_ics_contains_required_fields():
    appointment = {"id": "appt1", "start_at": datetime(2026, 1, 5, 10, 0, tzinfo=timezone.utc), "duration_minutes": 30, "location": "Visio"}
    ics = build_ics(appointment, "Rendez-vous ClubPaper", "Un prospect")
    text = ics.decode("utf-8")
    assert "BEGIN:VEVENT" in text
    assert "DTSTART:20260105T100000Z" in text
    assert "DTEND:20260105T103000Z" in text
    assert "SUMMARY:Rendez-vous ClubPaper" in text
    assert "LOCATION:Visio" in text


def test_build_ics_escapes_special_characters():
    appointment = {"id": "appt1", "start_at": datetime(2026, 1, 5, 10, 0, tzinfo=timezone.utc), "duration_minutes": 30}
    ics = build_ics(appointment, "Titre, avec; virgule", "")
    text = ics.decode("utf-8")
    assert "SUMMARY:Titre\\, avec\\; virgule" in text


def test_build_ics_accepts_iso_string_start_at():
    appointment = {"id": "appt1", "start_at": "2026-01-05T10:00:00+00:00", "duration_minutes": 60}
    ics = build_ics(appointment, "Test", "")
    assert "DTEND:20260105T110000Z" in ics.decode("utf-8")
