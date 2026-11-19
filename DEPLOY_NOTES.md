# Vehicle Template — VPS deployment

This repository is a **white-label admin dashboard template** for vehicle / fleet
management. The public marketing website has been removed; only the authenticated
admin console remains.

- **Dashboard:** `http://<server-ip>:3000/auth/login`
- **Root URL:** redirects to `/dashboard`
- **Default admin login:** `template@ev.com` / `evtemplate` (or `admin` / `admin123`)

## Stack

| Service | Purpose |
| --- | --- |
| `db` | PostgreSQL 16 (persistent volume) |
| `backend` | Django 6 + DRF API, Gunicorn. Runs migrations, collects static files and seeds demo data on first boot. |
| `frontend` | Next.js admin dashboard. Proxies `/api/`, `/media/` and `/static/` to the backend. |

Both application images are **built from source on the VPS** by Docker Compose.
No GitHub Container Registry, CI workflow or external image pull is required.

## First-time setup on a fresh VPS

```bash
# 1. Install Docker + Compose plugin, then:
git clone <your-repository-url> /opt/vehicle-template
cd /opt/vehicle-template

# 2. Create your environment file
cp .env.example .env

# 3. Edit .env — at minimum change SECRET_KEY and POSTGRES_PASSWORD
nano .env

# 4. Build and start
docker compose up -d --build

# 5. Watch first-boot logs (migrate → collectstatic → seed → gunicorn)
docker compose logs -f backend
```

Open `http://<server-ip>:3000/auth/login` and sign in with `template@ev.com` / `evtemplate` (or `admin` / `admin123`).

## Health check

Both services expose a container healthcheck. The backend answers
`GET /health` with `{"status":"ok"}`; the frontend healthcheck requests
`/dashboard`. External monitors can probe the dashboard port directly.

## Local development (without Docker)

```bash
# Terminal 1 — Django API on 127.0.0.1:8000
cd backend
python manage.py migrate
python seed_template_data.py
python manage.py runserver

# Terminal 2 — Next.js dashboard on 127.0.0.1:5173
cd frontend
npm run dev
```

`frontend/.env.development` points the API proxy at `http://127.0.0.1:8000`.
In Docker Compose it is overridden to the internal `http://backend:8000`.

## Everyday commands

```bash
docker compose ps
docker compose logs -f frontend backend
docker compose restart
docker compose down          # keeps data volumes
docker compose down -v       # DELETES the database and uploaded files
```

## Configuration (`.env`)

| Variable | Default | Notes |
| --- | --- | --- |
| `HOST_PORT` | `3000` | Host port mapped to the dashboard |
| `SECRET_KEY` | — | Required. Generate with `python3 -c "import secrets; print(secrets.token_urlsafe(50))"` |
| `POSTGRES_PASSWORD` | — | Required |
| `POSTGRES_DB` / `POSTGRES_USER` | `vehicle_template_db` / `vehicle_template` | Database names |
| `DEBUG` | `False` | Keep `False` in production |
| `ALLOWED_HOSTS` | `*` | Restrict to your domain / IP when known |
| `CORS_ALLOWED_ORIGINS` | `http://localhost:3000` | Add your public origin if needed |
| `SEED_ON_START` | `true` | Seeds demo data once; set `false` for an empty database |
| `COMPANY_NAME` / `COMPANY_TAGLINE` | `Vehicle Template` | Used in generated documents and API schema |
| `AWS_*` | empty | Optional S3-compatible storage; local volumes used when blank |

## Data / storage

- PostgreSQL data: named volume `postgres_data`
- Public uploads: `media_data` (`/app/media`)
- Private documents: `private_media_data` (`/app/private_media`)
- Static files: `static_data` (`/app/staticfiles`), rebuilt by `collectstatic` on each start

The first boot seeds a realistic demo dataset (vehicles, stock units, dealers,
CRM leads, CMS pages, stories, users). It runs **once**; the marker file
`media/.template_seeded` prevents duplicates on later restarts. To re-seed:

```bash
docker compose exec backend sh -c "rm -f /app/media/.template_seeded"
docker compose restart backend
```

## Putting a domain / TLS in front

Compose exposes the dashboard on `HOST_PORT` only. For production HTTPS, put a
reverse proxy (nginx / Caddy / Traefik) on the host which terminates TLS and
forwards to `127.0.0.1:${HOST_PORT}`. Then set `ALLOWED_HOSTS` and
`CORS_ALLOWED_ORIGINS` to your domain. The dashboard sends all API traffic to the
relative `/api/` path, which Next.js rewrites to `http://backend:8000` on the
internal Docker network — no CORS or cross-origin configuration is needed for
normal use.

## Customising the template

- Brand name/text: search for `Vehicle Template` in `frontend/src/admin/` and
  `backend/config/settings.py` (`COMPANY_NAME`).
- Logo mark: `frontend/src/admin/AdminApp.tsx` and `frontend/src/admin/Login.tsx`
  (currently a simple `VT` text mark). Favicon: `frontend/public/favicon.svg`.
- Colour palette: `frontend/src/index.css` CSS variables.
- Demo data: `backend/seed_template_data.py`.
- Quotation letterhead: `frontend/src/admin/crm/QuotationDetail.tsx` and
  `backend/crm/quotation_pdf.py` (text-only, generic branding).

## Periodic tasks (optional)

`scripts/cron_tasks.sh` runs reservation expiry, notification generation and
activity-log cleanup. Add to the host crontab, e.g. every 15 minutes:

```cron
*/15 * * * * /opt/vehicle-template/scripts/cron_tasks.sh >> /var/log/vehicle_template_cron.log 2>&1
```
