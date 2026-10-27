"""Probable-duplicate detection for leads — same normalized name+city, or same phone."""
import re
import unicodedata


def _strip_accents(text: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFKD", text) if not unicodedata.combining(c))


def normalize_name(name: str) -> str:
    """Lowercase, strip accents/punctuation, collapse whitespace — for fuzzy
    matching club names like 'AS. Paris Football' vs 'as paris football'."""
    text = _strip_accents((name or "").lower())
    text = re.sub(r"[^a-z0-9\s]", " ", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text


def normalize_phone(phone: str) -> str:
    """Digits only, last 9 (drops country code/leading 0 variance)."""
    digits = re.sub(r"\D", "", phone or "")
    return digits[-9:] if len(digits) >= 9 else digits


def dedupe_key(name: str, city: str) -> str:
    return f"{normalize_name(name)}|{normalize_name(city)}"


def is_probable_duplicate(a: dict, b: dict) -> bool:
    """True if `a` and `b` are likely the same organization."""
    if a.get("id") and a.get("id") == b.get("id"):
        return False
    name_city_a = dedupe_key(a.get("name", ""), a.get("city", ""))
    name_city_b = dedupe_key(b.get("name", ""), b.get("city", ""))
    if name_city_a and name_city_a == name_city_b:
        return True
    phone_a, phone_b = normalize_phone(a.get("phone", "")), normalize_phone(b.get("phone", ""))
    if phone_a and len(phone_a) >= 9 and phone_a == phone_b:
        return True
    return False
