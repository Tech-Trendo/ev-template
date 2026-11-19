"""Whitelist-based HTML sanitizer for Story rich text content.

Uses only the Python standard library (html.parser) so no extra
dependencies are required. Everything outside the whitelist is dropped;
dangerous attributes (event handlers, javascript: URLs, <script>/<style>
content) are removed.
"""

from __future__ import annotations

import html
import re
from html.parser import HTMLParser

ALLOWED_TAGS = {
    "p", "br", "hr",
    "h2", "h3", "h4",
    "strong", "b", "em", "i", "u", "s", "del", "mark", "code",
    "ul", "ol", "li",
    "a", "blockquote",
    "figure", "figcaption", "img",
    "table", "thead", "tbody", "tfoot", "tr", "th", "td", "colgroup", "col",
    "pre", "span",
}

VOID_ELEMENTS = {"br", "hr", "img", "col"}

# Attributes allowed per tag; None means the common set applies.
GLOBAL_ATTRS = {"class", "dir"}
TAG_ATTRS = {
    "a": {"href", "title", "target", "rel"},
    "img": {"src", "alt", "title", "width", "height", "loading"},
    "td": {"colspan", "rowspan"},
    "th": {"colspan", "rowspan"},
    "col": {"span", "width"},
    "ol": {"start"},
}

URL_ATTRS = {"href", "src"}
SAFE_URL_RE = re.compile(r"^(https?:|mailto:|tel:|/|#)", re.IGNORECASE)
DROP_CONTENT_TAGS = {"script", "style", "iframe", "object", "embed", "noscript"}


def _clean_attr(tag: str, attr_name: str, value: str):
    name = attr_name.lower()
    if name not in GLOBAL_ATTRS and name not in TAG_ATTRS.get(tag, set()):
        return None
    if name.startswith("on"):
        return None
    value = html.unescape(value or "")
    if name == "target":
        return ("target", "_blank")
    if name == "rel":
        return ("rel", "noopener noreferrer nofollow")
    if name in URL_ATTRS:
        stripped = value.strip().replace("\n", "").replace("\r", "").replace("\t", "")
        if not SAFE_URL_RE.match(stripped) and not stripped.startswith("data:image/"):
            return None
        return (name, stripped)
    if name == "class":
        # Only keep known internal utility classes used by the editor/renderer
        kept = [c for c in value.split() if c in {"story-caption", "story-table"}]
        if not kept:
            return None
        return ("class", " ".join(kept))
    if name == "loading":
        return ("loading", "lazy") if value == "lazy" else None
    return (name, value)


class _Sanitizer(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.out = []
        self.open_stack = []
        self.drop_depth = 0

    def handle_starttag(self, tag, attrs):
        tag = tag.lower()
        if tag in DROP_CONTENT_TAGS:
            self.drop_depth += 1
            return
        if self.drop_depth:
            return
        if tag not in ALLOWED_TAGS:
            return  # drop tag, keep children (text flows through)
        clean_attrs = []
        seen = set()
        for name, value in attrs:
            result = _clean_attr(tag, name, value or "")
            if result and result[0] not in seen:
                clean_attrs.append(result)
                seen.add(result[0])
        attr_str = "".join(
            f' {name}="{html.escape(value, quote=True)}"' for name, value in clean_attrs
        )
        if tag in VOID_ELEMENTS:
            self.out.append(f"<{tag}{attr_str}>")
            return
        # Auto-close an open <p>/<li> when a block element starts to avoid nesting junk
        if self.open_stack and self.open_stack[-1] in {"p", "li"} and tag in {
            "p", "h2", "h3", "h4", "ul", "ol", "li", "blockquote",
            "figure", "table", "pre", "hr",
        }:
            self.out.append(f"</{self.open_stack.pop()}>")
        self.out.append(f"<{tag}{attr_str}>")
        self.open_stack.append(tag)

    def handle_startendtag(self, tag, attrs):
        tag = tag.lower()
        if tag in VOID_ELEMENTS and not self.drop_depth:
            self.handle_starttag(tag, attrs)

    def handle_endtag(self, tag):
        tag = tag.lower()
        if tag in DROP_CONTENT_TAGS:
            if self.drop_depth:
                self.drop_depth -= 1
            return
        if self.drop_depth:
            return
        if tag in VOID_ELEMENTS or tag not in ALLOWED_TAGS:
            return
        if tag in self.open_stack:
            # Close any unclosed inner tags up to this one
            while self.open_stack:
                open_tag = self.open_stack.pop()
                self.out.append(f"</{open_tag}>")
                if open_tag == tag:
                    break

    def handle_data(self, data):
        if self.drop_depth:
            return
        self.out.append(html.escape(data))

    def result(self):
        while self.open_stack:
            self.out.append(f"</{self.open_stack.pop()}>")
        return "".join(self.out)


def sanitize_html(value: str | None) -> str:
    """Return a sanitized HTML string safe for storage/rendering."""
    if not value:
        return ""
    parser = _Sanitizer()
    try:
        parser.feed(value)
        parser.close()
    except Exception:
        return ""
    return parser.result()
