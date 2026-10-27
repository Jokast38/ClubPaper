"""Pure unit tests for slot computation + overlap detection (Partie C)."""
from datetime import datetime, timezone

from appointment_scheduling import intervals_overlap, has_conflict, compute_free_slots


def _dt(y, m, d, h, mi=0):
    return datetime(y, m, d, h, mi, tzinfo=timezone.utc)


def test_intervals_overlap_true_when_they_cross():
    assert intervals_overlap(_dt(2026, 1, 5, 10), _dt(2026, 1, 5, 11), _dt(2026, 1, 5, 10, 30), _dt(2026, 1, 5, 11, 30))


def test_intervals_overlap_false_when_adjacent():
    assert not intervals_overlap(_dt(2026, 1, 5, 10), _dt(2026, 1, 5, 11), _dt(2026, 1, 5, 11), _dt(2026, 1, 5, 12))


def test_has_conflict_true_for_overlapping_same_employee():
    existing = [{"id": "a1", "assigned_to_user_id": "emp1", "start_at": "2026-01-05T10:00:00+00:00", "duration_minutes": 30, "status": "planifie"}]
    assert has_conflict("emp1", _dt(2026, 1, 5, 10, 15), 30, existing)


def test_has_conflict_false_for_different_employee():
    existing = [{"id": "a1", "assigned_to_user_id": "emp2", "start_at": "2026-01-05T10:00:00+00:00", "duration_minutes": 30, "status": "planifie"}]
    assert not has_conflict("emp1", _dt(2026, 1, 5, 10, 15), 30, existing)


def test_has_conflict_false_for_cancelled_appointment():
    existing = [{"id": "a1", "assigned_to_user_id": "emp1", "start_at": "2026-01-05T10:00:00+00:00", "duration_minutes": 30, "status": "annule"}]
    assert not has_conflict("emp1", _dt(2026, 1, 5, 10, 15), 30, existing)


def test_has_conflict_false_when_excluded_by_id():
    existing = [{"id": "a1", "assigned_to_user_id": "emp1", "start_at": "2026-01-05T10:00:00+00:00", "duration_minutes": 30, "status": "planifie"}]
    assert not has_conflict("emp1", _dt(2026, 1, 5, 10), 30, existing, exclude_id="a1")


def test_compute_free_slots_respects_weekly_recurrence():
    # Monday 2026-01-05, availability Monday 09:00-10:00 for appel_decouverte
    slots = [{"type": "appel_decouverte", "weekday": 0, "start_time": "09:00", "end_time": "10:00"}]
    free = compute_free_slots(slots, "appel_decouverte", [], 30, _dt(2026, 1, 5, 0), _dt(2026, 1, 5, 23), employee_id="emp1")
    assert _dt(2026, 1, 5, 9) in free
    assert _dt(2026, 1, 5, 9, 30) in free
    # Last 30-min slot must fit entirely before 10:00
    assert all(s.hour < 10 or (s.hour == 9 and s.minute <= 30) for s in free)


def test_compute_free_slots_excludes_other_weekdays():
    slots = [{"type": "appel_decouverte", "weekday": 0, "start_time": "09:00", "end_time": "10:00"}]
    # 2026-01-06 is a Tuesday — no slot defined for that weekday
    free = compute_free_slots(slots, "appel_decouverte", [], 30, _dt(2026, 1, 6, 0), _dt(2026, 1, 6, 23), employee_id="emp1")
    assert free == []


def test_compute_free_slots_excludes_conflicting_times():
    slots = [{"type": "appel_decouverte", "weekday": 0, "start_time": "09:00", "end_time": "10:00"}]
    existing = [{"id": "a1", "assigned_to_user_id": "emp1", "start_at": "2026-01-05T09:00:00+00:00", "duration_minutes": 30, "status": "planifie"}]
    free = compute_free_slots(slots, "appel_decouverte", existing, 30, _dt(2026, 1, 5, 0), _dt(2026, 1, 5, 23), employee_id="emp1")
    assert _dt(2026, 1, 5, 9) not in free
    assert _dt(2026, 1, 5, 9, 30) in free


def test_compute_free_slots_empty_without_matching_type():
    slots = [{"type": "demo_visio", "weekday": 0, "start_time": "09:00", "end_time": "10:00"}]
    free = compute_free_slots(slots, "appel_decouverte", [], 30, _dt(2026, 1, 5, 0), _dt(2026, 1, 5, 23), employee_id="emp1")
    assert free == []
