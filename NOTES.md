# Notes & Progress Log

Newest entries at the top. Keep each entry to a few lines.

## 2026-10-01
- Added `rs-lead-gen-os/` (Next.js + Postgres dashboard/backend from the uploaded zip). Typecheck, 20 tests (incl. DB), and `next build` pass; smoke-tested ingest (re-import = 0 dupes), approval, research, export locally.
- Security fix: middleware no longer lets an arbitrary `Bearer` token bypass login (was exposing `/api/export` etc.).
- Next: deploy to Railway (root dir `rs-lead-gen-os`), set APP_PASSWORD/INGEST_SECRET/CRON_SECRET, then import the 63 pilot leads.

## 2026-09-29
- Set up `CLAUDE.md` (shared instructions) and this log so Mac and cloud sessions stay in sync.
- Next: add first lead list to `leads/` and first outreach template to `templates/`.

## To-do
- [ ] Decide target customer types (e.g., offices, Airbnb hosts, property managers)
- [ ] Decide target cities in the Central Valley
- [ ] First outreach email template
