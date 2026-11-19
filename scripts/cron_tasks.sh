#!/usr/bin/env bash
# Vehicle Template periodic tasks runner (Docker Compose / local virtualenv)
# Runs expire_reservations, generate_notifications and activity-log cleanup.
#
# Crontab setup (every 15 minutes):
# */15 * * * * /path/to/vehicle-template/scripts/cron_tasks.sh >> /var/log/vehicle_template_cron.log 2>&1

set -euo pipefail

# Run inside the Docker Compose backend container when it is available.
if command -v docker >/dev/null 2>&1 && docker ps --format '{{.Names}}' | grep -q '^vehicle_template_backend$'; then
    echo "[$(date -u '+%Y-%m-%d %H:%M:%S UTC')] Running periodic tasks via docker exec vehicle_template_backend..."
    docker exec -t vehicle_template_backend python manage.py expire_reservations
    docker exec -t vehicle_template_backend python manage.py generate_notifications
    docker exec -t vehicle_template_backend python manage.py purge_old_activity_logs
    exit 0
fi

# Fallback: direct virtualenv execution on the host.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$(cd "${SCRIPT_DIR}/../backend" && pwd)"

if [ -f "${BACKEND_DIR}/venv/bin/python" ]; then
    PYTHON_BIN="${BACKEND_DIR}/venv/bin/python"
elif command -v python3 >/dev/null 2>&1; then
    PYTHON_BIN="$(command -v python3)"
else
    PYTHON_BIN="python"
fi

cd "${BACKEND_DIR}"
echo "[$(date -u '+%Y-%m-%d %H:%M:%S UTC')] Running periodic tasks via ${PYTHON_BIN}..."
"${PYTHON_BIN}" manage.py expire_reservations
"${PYTHON_BIN}" manage.py generate_notifications
"${PYTHON_BIN}" manage.py purge_old_activity_logs
