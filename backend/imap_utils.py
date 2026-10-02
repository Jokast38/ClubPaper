"""IMAP helpers for the personal admin mailbox (read-only: list/fetch inbox messages)."""
import os
import imaplib
import email
from email.header import decode_header
from email.utils import parsedate_to_datetime


def _imap_config():
    host = os.environ.get("IMAP_HOST") or (os.environ.get("SMTP_HOST", "").replace("smtp.", "imap.") or "")
    port = int(os.environ.get("IMAP_PORT", "993"))
    user = os.environ.get("IMAP_USER") or os.environ.get("SMTP_USER", "")
    password = os.environ.get("IMAP_PASSWORD") or os.environ.get("SMTP_PASSWORD", "")
    if not (host and user and password):
        return None
    return {"host": host, "port": port, "user": user, "password": password}


def _decode(value) -> str:
    if not value:
        return ""
    parts = decode_header(value)
    out = []
    for text, enc in parts:
        if isinstance(text, bytes):
            out.append(text.decode(enc or "utf-8", errors="ignore"))
        else:
            out.append(text)
    return "".join(out)


def _connect():
    cfg = _imap_config()
    if not cfg:
        raise RuntimeError("IMAP n'est pas configuré (SMTP_HOST/SMTP_USER/SMTP_PASSWORD manquants).")
    conn = imaplib.IMAP4_SSL(cfg["host"], cfg["port"], timeout=20)
    conn.login(cfg["user"], cfg["password"])
    return conn


def list_inbox(limit: int = 30, offset: int = 0) -> dict:
    """Return the most recent messages (newest first), as lightweight summaries."""
    conn = _connect()
    try:
        conn.select("INBOX", readonly=True)
        typ, data = conn.search(None, "ALL")
        ids = data[0].split()
        ids.reverse()  # newest last in IMAP by default (ascending UID/sequence)
        total = len(ids)
        page_ids = ids[offset: offset + limit]
        messages = []
        for mid in page_ids:
            typ, msg_data = conn.fetch(mid, "(RFC822.HEADER FLAGS)")
            if typ != "OK" or not msg_data or not msg_data[0]:
                continue
            raw_header = msg_data[0][1]
            msg = email.message_from_bytes(raw_header)
            flags_blob = b" ".join(x for x in msg_data if isinstance(x, bytes))
            date_str = msg.get("Date")
            try:
                date = parsedate_to_datetime(date_str).isoformat() if date_str else None
            except Exception:
                date = None
            messages.append({
                "uid": mid.decode(),
                "from": _decode(msg.get("From")),
                "subject": _decode(msg.get("Subject")) or "(sans objet)",
                "date": date,
                "unread": b"\\Seen" not in flags_blob,
            })
        return {"items": messages, "total": total}
    finally:
        try:
            conn.logout()
        except Exception:
            pass


def get_message(uid: str) -> dict:
    """Return a full message: decoded body (prefers HTML) + attachment list (not downloaded yet)."""
    conn = _connect()
    try:
        conn.select("INBOX", readonly=True)
        typ, msg_data = conn.fetch(uid.encode(), "(RFC822)")
        if typ != "OK" or not msg_data or not msg_data[0]:
            raise RuntimeError("Message introuvable")
        raw = msg_data[0][1]
        msg = email.message_from_bytes(raw)

        body_html, body_text, attachments = "", "", []
        if msg.is_multipart():
            for idx, part in enumerate(msg.walk()):
                content_type = part.get_content_type()
                disposition = str(part.get("Content-Disposition") or "")
                if "attachment" in disposition or part.get_filename():
                    filename = _decode(part.get_filename()) or f"piece-jointe-{idx}"
                    payload = part.get_payload(decode=True) or b""
                    attachments.append({"index": idx, "filename": filename, "content_type": content_type, "size": len(payload)})
                elif content_type == "text/html" and not body_html:
                    charset = part.get_content_charset() or "utf-8"
                    body_html = (part.get_payload(decode=True) or b"").decode(charset, errors="ignore")
                elif content_type == "text/plain" and not body_text:
                    charset = part.get_content_charset() or "utf-8"
                    body_text = (part.get_payload(decode=True) or b"").decode(charset, errors="ignore")
        else:
            charset = msg.get_content_charset() or "utf-8"
            payload = (msg.get_payload(decode=True) or b"").decode(charset, errors="ignore")
            if msg.get_content_type() == "text/html":
                body_html = payload
            else:
                body_text = payload

        date_str = msg.get("Date")
        try:
            date = parsedate_to_datetime(date_str).isoformat() if date_str else None
        except Exception:
            date = None

        # Mark as read now that it's been opened.
        try:
            conn.select("INBOX")
            conn.store(uid.encode(), "+FLAGS", "\\Seen")
        except Exception:
            pass

        return {
            "uid": uid,
            "from": _decode(msg.get("From")),
            "to": _decode(msg.get("To")),
            "subject": _decode(msg.get("Subject")) or "(sans objet)",
            "date": date,
            "body_html": body_html,
            "body_text": body_text,
            "attachments": attachments,
        }
    finally:
        try:
            conn.logout()
        except Exception:
            pass


def get_attachment(uid: str, index: int) -> tuple:
    """Return (filename, content_type, bytes) for one attachment of a message."""
    conn = _connect()
    try:
        conn.select("INBOX", readonly=True)
        typ, msg_data = conn.fetch(uid.encode(), "(RFC822)")
        if typ != "OK" or not msg_data or not msg_data[0]:
            raise RuntimeError("Message introuvable")
        msg = email.message_from_bytes(msg_data[0][1])
        for idx, part in enumerate(msg.walk()):
            if idx == index:
                filename = _decode(part.get_filename()) or f"piece-jointe-{idx}"
                content_type = part.get_content_type()
                payload = part.get_payload(decode=True) or b""
                return filename, content_type, payload
        raise RuntimeError("Pièce jointe introuvable")
    finally:
        try:
            conn.logout()
        except Exception:
            pass
