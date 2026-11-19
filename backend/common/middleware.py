from __future__ import annotations

import contextvars
from typing import Any, Optional, Tuple

_current_request_context: contextvars.ContextVar[Tuple[Optional[Any], Optional[str]]] = (
    contextvars.ContextVar("current_request_context", default=(None, None))
)


def get_client_ip(request: Any) -> Optional[str]:
    """Extract client IP from X-Forwarded-For or REMOTE_ADDR."""
    if not request:
        return None
    x_forwarded_for = request.META.get("HTTP_X_FORWARDED_FOR")
    if x_forwarded_for:
        ip = x_forwarded_for.split(",")[0].strip()
    else:
        ip = request.META.get("REMOTE_ADDR")
    return ip or None


def get_current_request_context() -> Tuple[Optional[Any], Optional[str]]:
    """Return (request, ip) from the active context variable."""
    return _current_request_context.get()


class AuditContextMiddleware:
    """
    Lightweight middleware capturing the current HTTP request and client IP
    in Python contextvars. Enables model signals to access the acting staff user
    and IP without overhead.
    """

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        ip = get_client_ip(request)
        token = _current_request_context.set((request, ip))
        try:
            return self.get_response(request)
        finally:
            _current_request_context.reset(token)
