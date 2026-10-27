from lead_scoring import compute_priority_score, MAX_SCORE


def test_empty_lead_scores_zero():
    assert compute_priority_score({}) == 0


def test_sweet_spot_member_count_beats_ok_range():
    sweet = compute_priority_score({"estimated_member_count": 150})
    ok = compute_priority_score({"estimated_member_count": 30})
    assert sweet > ok > 0


def test_out_of_range_member_count_contributes_nothing():
    assert compute_priority_score({"estimated_member_count": 5}) == 0
    assert compute_priority_score({"estimated_member_count": 10000}) == 0


def test_decision_maker_and_hot_interest_and_now_horizon_stack():
    score = compute_priority_score({
        "decision_maker_role": "president",
        "interest_level": "chaud",
        "buying_horizon": "maintenant",
    })
    assert score == 15 + 25 + 20


def test_score_is_clamped_to_max():
    score = compute_priority_score({
        "estimated_member_count": 150,
        "estimated_team_count": 10,
        "decision_maker_role": "president",
        "interest_level": "chaud",
        "buying_horizon": "maintenant",
    })
    assert score <= MAX_SCORE


def test_unknown_enum_values_are_ignored_not_crashing():
    score = compute_priority_score({"interest_level": "???", "buying_horizon": "???"})
    assert score == 0
