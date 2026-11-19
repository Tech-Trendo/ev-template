"""Short-lived signed URLs for private media served through authenticated API endpoints.

A plain ``<img src>`` (or a print window, or a new tab) cannot send the JWT
Authorization header, so serializers append ``?sig=`` to private file URLs.
The signature binds the requesting user and the exact URL path, expires after
``PRIVATE_URL_MAX_AGE`` seconds, and only authenticates safe (GET/HEAD)
requests. Normal permission and dealer-scoping checks still run on the view.
"""

from __future__ import annotations

from typing import Any, Optional
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

from django.conf import settings
from django.contrib.auth import get_user_model
from django.core import signing
from rest_framework.authentication import BaseAuthentication
from rest_framework.exceptions import AuthenticationFailed

SIGNED_URL_PARAM = "sig"
_SALT = "common.private-media-url"


def signed_url_max_age() -> int:
    return int(getattr(settings, "PRIVATE_URL_MAX_AGE", 15 * 60))


def sign_private_url(url: Optional[str], user: Any) -> Optional[str]:
    """Append a signature for ``user`` to an internal API URL. External URLs pass through."""
    if not url or not user or not getattr(user, "is_authenticated", False):
        return url
    parts = urlsplit(url)
    if not parts.path.startswith("/api/"):
        return url
    token = signing.dumps({"u": user.pk, "p": parts.path}, salt=_SALT, compress=True)
    query = [(k, v) for k, v in parse_qsl(parts.query) if k != SIGNED_URL_PARAM]
    query.append((SIGNED_URL_PARAM, token))
    return urlunsplit((parts.scheme, parts.netloc, parts.path, urlencode(query), parts.fragment))


def private_media_url(request: Any, src: Optional[str]) -> Optional[str]:
    """Absolute, signed URL for a private file endpoint (serializer helper)."""
    if not src:
        return src
    if request is not None and not src.startswith("http"):
        src = request.build_absolute_uri(src)
    return sign_private_url(src, getattr(request, "user", None))


class SignedURLAuthentication(BaseAuthentication):
    """Authenticate GET/HEAD requests carrying a valid ``?sig=`` for this exact path."""

    def authenticate(self, request):
        token = request.query_params.get(SIGNED_URL_PARAM)
        if not token or request.method not in ("GET", "HEAD"):
            return None
        try:
            data = signing.loads(token, salt=_SALT, max_age=signed_url_max_age())
        except signing.SignatureExpired:
            raise AuthenticationFailed("This file link has expired. Reload the page to get a new one.")
        except signing.BadSignature:
            raise AuthenticationFailed("Invalid file link signature.")
        if data.get("p") != request.path:
            raise AuthenticationFailed("This file link is not valid for this resource.")
        user = get_user_model().objects.filter(pk=data.get("u"), is_active=True).first()
        if user is None:
            raise AuthenticationFailed("This file link is no longer valid.")
        return (user, None)
