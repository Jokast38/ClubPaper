"""HTML sanitization for user-generated content (blog posts, etc)."""
import re
import bleach

# Tags that should have both the tag AND their inner text removed
_STRIP_TAGS_WITH_CONTENT = re.compile(
    r"<(script|style|iframe|object|embed)[^>]*>.*?</\1>",
    flags=re.IGNORECASE | re.DOTALL,
)

ALLOWED_TAGS = [
    "p", "br", "hr",
    "strong", "b", "em", "i", "u", "s",
    "h2", "h3", "h4",
    "ul", "ol", "li",
    "blockquote", "code", "pre",
    "a", "span",
]

ALLOWED_ATTRS = {
    "a": ["href", "title", "target", "rel"],
    "*": ["class"],
}

ALLOWED_PROTOCOLS = ["http", "https", "mailto"]


def sanitize_html(html: str) -> str:
    """Strip disallowed HTML/attributes/protocols. Safe for public rendering."""
    if not html:
        return ""
    # First remove dangerous tags AND their inner content
    html = _STRIP_TAGS_WITH_CONTENT.sub("", html)
    return bleach.clean(
        html,
        tags=ALLOWED_TAGS,
        attributes=ALLOWED_ATTRS,
        protocols=ALLOWED_PROTOCOLS,
        strip=True,
        strip_comments=True,
    )
