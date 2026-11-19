# ev-template

A white-label **vehicle / fleet management admin template**: a Django REST API
with a Next.js admin dashboard. The public marketing website has been removed —
this repo ships the authenticated operations console only.

## Stack

| Service | Purpose |
| --- | --- |
| `db` | PostgreSQL 16 |
| `backend` | Django 6 + DRF, Gunicorn, demo-data seeding |
| `frontend` | Next.js admin dashboard (proxies `/api/`, `/media/`, `/static/`) |

## Quick start (Docker)

```bash
cp .env.example .env
# edit SECRET_KEY and POSTGRES_PASSWORD in .env
docker compose up -d --build
docker compose logs -f backend
```

Open `http://<server-ip>:3000/auth/login`.

Demo logins (seeded on first boot):

- `template@ev.com` / `evtemplate`
- `admin` / `admin123`

## Local development

```bash
# API
cd backend
python manage.py migrate
python seed_template_data.py
python manage.py runserver

# Dashboard
cd frontend
npm install
npm run dev
```

## Customising

- Brand name: search for `Vehicle Template` in `frontend/src/admin/` and
  `backend/config/settings.py` (`COMPANY_NAME`).
- Logo mark: `frontend/src/admin/AdminApp.tsx`, `frontend/src/admin/Login.tsx`.
- Colours: CSS variables in `frontend/src/index.css`.
- Demo data: `backend/seed_template_data.py`.

See [DEPLOY_NOTES.md](DEPLOY_NOTES.md) for VPS deployment, environment
variables, storage, and periodic tasks.
