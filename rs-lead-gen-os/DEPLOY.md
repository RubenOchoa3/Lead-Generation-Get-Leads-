# Deploy to Railway

Project: **rs-lead-gen-os** (already exists). **PostgreSQL was provisioned on 2026-09-30** (service `Postgres`, region ams, 50 GB volume).
Note: the project's region is Amsterdam (`ams`). The app and DB are co-located so latency between them is fine; if you prefer US-West for the dashboard, change the region of both services in Railway → Service → Settings → Regions before going live.

## 1. Get the code into Railway (choose one)
**A. GitHub (recommended — version history + auto-deploy)**
1. github.com → New repository → `rs-lead-gen-os` (Private) → Create.
2. Push this folder to it (`git init && git add . && git commit -m init && git remote add origin … && git push -u origin main`).
3. Railway → rs-lead-gen-os → **+ Create** → GitHub Repo → `rs-lead-gen-os`.

**B. Railway CLI (no GitHub)**
1. `npm i -g @railway/cli` → `railway login` → in this folder: `railway link` (pick rs-lead-gen-os) → `railway up`.

## 2. Variables (Railway → web service → Variables)
| Name | Value |
|---|---|
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` (reference variable — pick it from the dropdown) |
| `APP_USER` | `rs` (or your choice) |
| `APP_PASSWORD` | long random password |
| `INGEST_SECRET` | long random string |
| `CRON_SECRET` | long random string |
| optional `GETLEAD_API_KEY`, `GETLEAD_API_BASE` | from Getlead's API settings/docs |
| optional `ANTHROPIC_API_KEY` | only if the app should run Claude research by itself |

## 3. Expose & verify
1. web service → Settings → Networking → **Generate Domain**.
2. Open `https://<domain>/api/health` → expect `{"ok":true,"database":"ok","migrations":"001_init.sql"…}`.
3. Open `https://<domain>/` → log in with APP_USER / APP_PASSWORD → Dashboard loads (empty states, no errors).
4. Acceptance: import `pilot` rows → leads appear; import again → **no duplicates**; approve one → status persists; dashboard counts change.

## Build / start
- Build: `npm ci --include=dev && npm run typecheck && npm test && npm run build` (from `railway.json`).
- Start: `npm start` → runs `scripts/migrate.mjs` (advisory-locked, idempotent) then `next start`.
- Health check: `/api/health`.

## Rollback / recovery
- Code: Railway → Deployments → previous deployment → **Rollback**.
- Schema: migrations are additive; never edit an applied migration — add `002_…sql`.
- Data: Railway Postgres → Backups (enable daily backups on the Postgres service).
- The two empty services `collector` and `reply-classifier` (no source, never deployed) are unused by this app; delete them in Railway if you don't need them.
