import os
import sys

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

if BASE_DIR not in sys.path:
    sys.path.insert(0, BASE_DIR)

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")

try:
    from django.core.wsgi import get_wsgi_application
    application = get_wsgi_application()
except Exception:
    # Make the actual Python/Django error visible to Passenger/cPanel
    import traceback
    traceback.print_exc()
    raise