# EV OS — VPS deployment

This repository is a **white-label admin dashboard template** for vehicle / fleet
management. The public marketing website has been removed; only the authenticated
admin console remains.

- **Dashboard:** `http://<server-ip>:3001/auth/login` (port from `HOST_PORT`)
- **Root URL:** redirects to `/dashboard`
- **Default admin login:** `template@ev.com` / `evtemplate` (or `admin` / `admin123`)

## Stack

| Service | Purpose |
| --- | --- |
| `db` | PostgreSQL 16 (persistent volume) |
| `backend` | Django 6 + DRF API, Gunicorn. Runs migrations, collects static files and seeds demo data on first boot. |
| `frontend` | Next.js admin dashboard. Proxies `/api/`, `/media/` and `/static/` to the backend. |

Two deployment modes are supported:

- **Local build:** Docker Compose builds both images from source on the VPS.
- **GitHub Actions:** the workflow builds the images, pushes them to GHCR, then
  pulls and restarts them on the VPS. See
  [Automated deploy (GitHub Actions)](#automated-deploy-github-actions).

## First-time setup on a fresh VPS

```bash
# 1. Install Docker + Compose plugin, then:
git clone <your-repository-url> /opt/ev-template
cd /opt/ev-template

# 2. Create your environment file
cp .env.example .env

# 3. Edit .env — at minimum change SECRET_KEY and POSTGRES_PASSWORD
nano .env

# 4. Build and start
docker compose up -d --build

# 5. Watch first-boot logs (migrate → collectstatic → seed → gunicorn)
docker compose logs -f backend
```

Open `http://<server-ip>:3001/auth/login` and sign in with `template@ev.com` / `evtemplate` (or `admin` / `admin123`).

## Automated deploy (GitHub Actions)

`.github/workflows/deploy.yml` runs on every push to `main` (and manually via
`workflow_dispatch`):

1. builds the `backend` and `frontend` images,
2. pushes them to GHCR as `ghcr.io/tech-trendo/ev-template-backend` and
   `ghcr.io/tech-trendo/ev-template-frontend` (`latest` + commit SHA),
3. copies `docker-compose.yml` to the VPS,
4. logs in to GHCR, pulls the images and runs `docker compose up -d`,
5. waits for the backend healthcheck and prunes dangling images.

Images are published as multi-arch manifests (`linux/amd64` + `linux/arm64`).
If the VPS is known to be amd64, you can delete the `platforms:` lines in the
workflow to build faster.

### One-time VPS preparation

```bash
# From a machine that has this repo checked out:
mkdir -p /opt/ev-template        # run on the VPS
scp .env.example $VPS_USER@$VPS_HOST:/opt/ev-template/.env
ssh $VPS_USER@$VPS_HOST 'cd /opt/ev-template && nano .env'
```

`docker-compose.yml` is uploaded by the workflow; `.env` stays on the VPS.

Set in `.env`:

- `SECRET_KEY`, `POSTGRES_PASSWORD` — strong random values.
- `COMPOSE_PROJECT_NAME` — **must be unique** among the sites on this VPS
  (e.g. `ev-template`). Compose prefixes container, network and volume names
  with it, so this stack never touches the other site's containers.
- `HOST_PORT` — a free host port (e.g. `3001`). Check with
  `ss -ltnp | grep -E ':(3000|3001|8080)'`.
- `CORS_ALLOWED_ORIGINS` / `ALLOWED_HOSTS` if you put a domain in front.

The SSH user must be able to run `docker` (member of the `docker` group) and
have write access to `/opt/ev-template`.

### GitHub repo secrets

| Secret | Value |
| --- | --- |
| `VPS_HOST` | VPS IP / hostname |
| `VPS_PORT` | SSH port (default `22`) |
| `VPS_USER` | SSH user |
| `VPS_SSH_KEY` | private SSH key (PEM/OpenSSH) |
| `GHCR_DEPLOY_TOKEN` | GitHub PAT with `read:packages` (needed for a private repo/package) |
| `GHCR_USERNAME` | GitHub username that owns `GHCR_DEPLOY_TOKEN` |

The workflow uses its short-lived `GITHUB_TOKEN` to push images; the VPS uses
`GHCR_DEPLOY_TOKEN` only to pull them. If the repository and package are
public, the GHCR login is skipped.

### Running beside another site

This stack is self-contained: only the frontend publishes a host port, the
backend is reached over the internal Compose network, and every volume is
project-scoped. As long as `COMPOSE_PROJECT_NAME` and `HOST_PORT` differ from
the other site, both run side by side. `docker image prune -f` in the workflow
only removes dangling images, so it will not delete the other site's images.

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
| `COMPOSE_PROJECT_NAME` | `ev-template` | Unique per site on the VPS; prefixes containers, network and volumes |
| `HOST_PORT` | `3001` | Host port mapped to the dashboard; must be free |
| `BACKEND_IMAGE` / `FRONTEND_IMAGE` | local build | Set by the Actions workflow to the GHCR `latest` images |
| `SECRET_KEY` | — | Required. Generate with `python3 -c "import secrets; print(secrets.token_urlsafe(50))"` |
| `POSTGRES_PASSWORD` | — | Required |
| `POSTGRES_DB` / `POSTGRES_USER` | `vehicle_template_db` / `vehicle_template` | Database names |
| `DEBUG` | `False` | Keep `False` in production |
| `ALLOWED_HOSTS` | `*` | Restrict to your domain / IP when known |
| `CORS_ALLOWED_ORIGINS` | `http://localhost:3001` | Add your public origin if needed |
| `SEED_ON_START` | `true` | Seeds demo data once; set `false` for an empty database |
| `COMPANY_NAME` / `COMPANY_TAGLINE` | `EV OS` | Used in generated documents and API schema |
| `AWS_*` | empty | Optional S3-compatible storage; local volumes used when blank |

## Data / storage

Compose prefixes volume names with `COMPOSE_PROJECT_NAME`, e.g.
`ev-template_postgres_data`:

- PostgreSQL data: `postgres_data`
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

- Brand name/text: search for `EV OS` in `frontend/src/admin/` and
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
*/15 * * * * /opt/ev-template/scripts/cron_tasks.sh >> /var/log/ev_os_cron.log 2>&1
```
