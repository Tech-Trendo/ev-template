from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.urls import include, path

from django.http import HttpResponse, JsonResponse
from django.shortcuts import redirect

admin.site.site_header = "EV OS Administration"
admin.site.site_title = "EV OS Admin"
admin.site.index_title = "Site administration"
admin.site.site_url = "/dashboard"


def app_health(request):
    """Lightweight liveness probe for Docker / load balancers / monitors."""
    return JsonResponse({"status": "ok"})


def app_robots(request):
    return HttpResponse("User-agent: *\nDisallow: /\n", content_type="text/plain")


def app_root_redirect(request):
    return redirect("/dashboard", permanent=False)


urlpatterns = [
    path("health", app_health),
    path("health/", app_health),
    path("robots.txt", app_robots),
    path("", app_root_redirect),
    path("admin/", admin.site.urls),
    path("", include("config.api_urls")),
]

if settings.DEBUG:
    urlpatterns += static(settings.STATIC_URL, document_root=settings.STATICFILES_DIRS[0])
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
