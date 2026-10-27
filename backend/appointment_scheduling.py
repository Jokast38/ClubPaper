"""Pure slot-computation + overlap logic for appointment booking (Partie C).

No I/O here — callers pass in already-fetched availability slots and existing
appointments so this stays trivially unit-testable.
"""
from datetime import datetime, timedelta, timezone

SLOT_STEP_MINUTES = 15
ACTIVE_APPOINTMENT_STATUSES = {"planifie", "confirme", "realise"}

DEFAULT_DURATION_MINUTES = {
    "appel_decouverte": 30,
    "demo_visio": 45,
    "installation_distance": 60,
    "installation_sur_place": 90,
}


def _as_utc(dt: datetime) -> datetime:
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def intervals_overlap(a_start: datetime, a_end: datetime, b_start: datetime, b_end: datetime) -> bool:
    return _as_utc(a_start) < _as_utc(b_end) and _as_utc(b_start) < _as_utc(a_end)


def has_conflict(employee_id: str, start_at: datetime, duration_minutes: int, existing_appointments: list, exclude_id: str = None) -> bool:
    """True if [start_at, start_at+duration) overlaps an active appointment of
    the same employee. `existing_appointments` is a flat list of dicts with
    id/assigned_to_user_id/start_at/duration_minutes/status (start_at may be
    an ISO string or a datetime)."""
    end_at = start_at + timedelta(minutes=duration_minutes)
    for appt in existing_appointments:
        if appt.get("id") == exclude_id:
            continue
        if appt.get("assigned_to_user_id") != employee_id:
            continue
        if appt.get("status") not in ACTIVE_APPOINTMENT_STATUSES:
            continue
        other_start = appt["start_at"]
        if isinstance(other_start, str):
            other_start = datetime.fromisoformat(other_start.replace("Z", "+00:00"))
        other_end = other_start + timedelta(minutes=appt.get("duration_minutes", 30))
        if intervals_overlap(start_at, end_at, other_start, other_end):
            return True
    return False


def compute_free_slots(
    slots: list,
    appointment_type: str,
    existing_appointments: list,
    duration_minutes: int,
    window_start: datetime,
    window_end: datetime,
    employee_id: str = None,
    step_minutes: int = SLOT_STEP_MINUTES,
) -> list:
    """Candidate start times (UTC datetimes) for `appointment_type`, derived
    from the employee's recurring weekly availability (`slots`: list of
    {type, weekday, start_time, end_time}), minus anything that would
    conflict with an existing active appointment. `window_start`/`window_end`
    bound how far ahead to search (e.g. "now" .. "+14 days")."""
    window_start, window_end = _as_utc(window_start), _as_utc(window_end)
    relevant = [s for s in slots if s.get("type") == appointment_type]
    if not relevant:
        return []

    out = []
    day = window_start.replace(hour=0, minute=0, second=0, microsecond=0)
    while day <= window_end:
        weekday = day.weekday()
        for slot in relevant:
            if slot.get("weekday") != weekday:
                continue
            h1, m1 = map(int, slot["start_time"].split(":"))
            h2, m2 = map(int, slot["end_time"].split(":"))
            slot_start = day.replace(hour=h1, minute=m1)
            slot_end = day.replace(hour=h2, minute=m2)
            cursor = slot_start
            while cursor + timedelta(minutes=duration_minutes) <= slot_end:
                if cursor >= window_start and cursor <= window_end:
                    conflict = employee_id and has_conflict(employee_id, cursor, duration_minutes, existing_appointments)
                    if not conflict:
                        out.append(cursor)
                cursor += timedelta(minutes=step_minutes)
        day += timedelta(days=1)
    return sorted(out)
