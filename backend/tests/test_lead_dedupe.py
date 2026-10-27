from lead_dedupe import normalize_name, normalize_phone, dedupe_key, is_probable_duplicate


def test_normalize_name_strips_accents_punctuation_case():
    assert normalize_name("AS. Paris Football!") == "as paris football"
    assert normalize_name("Étoile Sportive") == "etoile sportive"


def test_normalize_phone_keeps_last_9_digits():
    assert normalize_phone("+33 6 12 34 56 78") == "612345678"
    assert normalize_phone("06 12 34 56 78") == "612345678"
    assert normalize_phone("") == ""


def test_same_name_and_city_is_a_duplicate():
    a = {"id": "1", "name": "AS Paris Football", "city": "Paris", "phone": ""}
    b = {"id": "2", "name": "as. paris football", "city": "PARIS", "phone": ""}
    assert is_probable_duplicate(a, b)


def test_same_phone_different_name_is_a_duplicate():
    a = {"id": "1", "name": "Club A", "city": "Lyon", "phone": "0612345678"}
    b = {"id": "2", "name": "Club B (renamed)", "city": "Villeurbanne", "phone": "+33612345678"}
    assert is_probable_duplicate(a, b)


def test_different_club_is_not_a_duplicate():
    a = {"id": "1", "name": "Club A", "city": "Lyon", "phone": "0612345678"}
    b = {"id": "2", "name": "Club B", "city": "Marseille", "phone": "0698765432"}
    assert not is_probable_duplicate(a, b)


def test_same_record_is_never_its_own_duplicate():
    a = {"id": "1", "name": "Club A", "city": "Lyon", "phone": "0612345678"}
    assert not is_probable_duplicate(a, dict(a))


def test_dedupe_key_is_order_sensitive_but_stable():
    assert dedupe_key("Club A", "Lyon") == dedupe_key("club a", "LYON")
