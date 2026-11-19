#!/bin/sh
set -e

echo "[entrypoint] Applying database migrations..."
python manage.py migrate --noinput

echo "[entrypoint] Collecting static files..."
python manage.py collectstatic --noinput --clear >/dev/null

if [ "${SEED_ON_START:-true}" = "true" ] && [ ! -f /app/media/.template_seeded ]; then
  echo "[entrypoint] Seeding demo data (first boot only)..."
  python seed_template_data.py
  touch /app/media/.template_seeded
  echo "[entrypoint] Demo data seeded. Login: template@ev.com / evtemplate"
else
  echo "[entrypoint] Skipping seed (already seeded or SEED_ON_START=false)."
fi

echo "[entrypoint] Starting gunicorn..."
exec gunicorn config.wsgi:application \
  --bind 0.0.0.0:8000 \
  --workers "${WEB_CONCURRENCY:-3}" \
  --timeout 120 \
  --access-logfile -
