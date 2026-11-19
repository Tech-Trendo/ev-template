@echo off
REM Vehicle Template periodic tasks runner (Windows)
REM Runs expire_reservations and generate_notifications sequentially.

set SCRIPT_DIR=%~dp0
cd /d "%SCRIPT_DIR%.."

if not exist logs mkdir logs

echo [%DATE% %TIME%] Running expire_reservations >> logs\scheduled_tasks.log
venv\Scripts\python.exe manage.py expire_reservations >> logs\scheduled_tasks.log 2>&1

echo [%DATE% %TIME%] Running generate_notifications >> logs\scheduled_tasks.log
venv\Scripts\python.exe manage.py generate_notifications >> logs\scheduled_tasks.log 2>&1

echo [%DATE% %TIME%] Running purge_old_activity_logs >> logs\scheduled_tasks.log
venv\Scripts\python.exe manage.py purge_old_activity_logs >> logs\scheduled_tasks.log 2>&1

