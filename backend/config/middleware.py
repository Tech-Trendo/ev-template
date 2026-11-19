class XRobotsTagMiddleware:
    """
    Adds X-Robots-Tag: noindex, nofollow to all backend HTML, API, and admin responses,
    while leaving static and media files crawlable.
    """
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        response = self.get_response(request)
        path = request.path_info
        # Allow static and media assets to be crawlable if referenced by public site
        if not (path.startswith("/static/") or path.startswith("/media/")):
            response["X-Robots-Tag"] = "noindex, nofollow"
        return response
