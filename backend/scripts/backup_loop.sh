#!/bin/sh
# Run database backup every DB_BACKUP_INTERVAL_SECONDS (default 3600).
set -eu

INTERVAL="${DB_BACKUP_INTERVAL_SECONDS:-3600}"

echo "==> DB backup loop starting (interval=${INTERVAL}s)"

# First run shortly after boot so deploys get a fresh dump.
sleep 30

while true; do
  echo "==> $(date -u +%Y-%m-%dT%H:%M:%SZ) running backup_databaseâ€¦"
  if python manage.py backup_database; then
    echo "==> backup_database ok"
  else
    echo "==> backup_database failed (exit $?)" >&2
  fi
  sleep "$INTERVAL"
done
