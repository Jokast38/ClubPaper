"""Priority score for the sales call queue — never blocking, purely for sorting.

The formula is a simple additive score (0-100, clamped). Each weight below is
isolated so it can be tuned without touching the calculation logic.
"""

# ---- Tunable weights (change freely) ----
MEMBER_COUNT_SWEET_SPOT = (60, 300)   # clubs in this range are the best fit (not too small, not already on a big tool)
MEMBER_COUNT_SWEET_SPOT_POINTS = 30
MEMBER_COUNT_OK_RANGE = (20, 600)
MEMBER_COUNT_OK_POINTS = 15

TEAM_COUNT_THRESHOLD = 3              # clubs with several teams feel the pain of spreadsheets more
TEAM_COUNT_POINTS = 10

DECISION_MAKER_IDENTIFIED_POINTS = 15  # we know who signs — call isn't wasted on an intermediary

INTEREST_LEVEL_POINTS = {
    "chaud": 25,
    "tiede": 12,
    "froid": 0,
}

BUYING_HORIZON_POINTS = {
    "maintenant": 20,
    "avant_saison": 10,
    "plus_tard": 0,
}

MAX_SCORE = 100


def compute_priority_score(lead: dict) -> int:
    """Pure function: lead dict in, 0-100 score out. Missing/empty fields just
    contribute 0 — every qualification criterion is optional."""
    score = 0

    members = lead.get("estimated_member_count")
    if isinstance(members, (int, float)):
        lo, hi = MEMBER_COUNT_SWEET_SPOT
        ok_lo, ok_hi = MEMBER_COUNT_OK_RANGE
        if lo <= members <= hi:
            score += MEMBER_COUNT_SWEET_SPOT_POINTS
        elif ok_lo <= members <= ok_hi:
            score += MEMBER_COUNT_OK_POINTS

    teams = lead.get("estimated_team_count")
    if isinstance(teams, (int, float)) and teams >= TEAM_COUNT_THRESHOLD:
        score += TEAM_COUNT_POINTS

    if (lead.get("decision_maker_role") or "").strip():
        score += DECISION_MAKER_IDENTIFIED_POINTS

    score += INTEREST_LEVEL_POINTS.get(lead.get("interest_level") or "", 0)
    score += BUYING_HORIZON_POINTS.get(lead.get("buying_horizon") or "", 0)

    return min(score, MAX_SCORE)
