# Notes & Progress Log

Newest entries at the top. Keep each entry to a few lines.

## 2026-10-04
- Find Leads works server-side: `GETLEAD_API_BASE=https://app.getleads.io`; columns/filters moved to GetLeads' current names; count uses a 1-row search (no REST count route). Country/state/optional-city search.
- Daily Lead Engine built: saved searches marked "Run nightly" run via Railway cron service `nightly-leads` (12:00 UTC ≈ 5 AM PT), max 25/search by default. Owner turns it on in Settings → Schedule.
- Registry waterfall built (California, free sources only): CA SOS BE Public Search (needs free `CASOS_API_KEY` from calicodev.sos.ca.gov) + City of Fresno New Business Directory → Getlead lookup by name → queue, else "Call / visit" list (New Businesses page, CSV export). Runs nightly with the Daily Lead Engine, 40 lookups/run. County DBA filings skipped: no free online feed.
- 18 InboxKit mailboxes exported to Instantly, warmup on (started Oct 3), all 18 on campaign "V1" (draft). Owner wants 1-week warmup → launch Fri Oct 9 at 5/mailbox/day, ramp weekly.
- V1 emails now include mailing address + opt-out. 6 sending domains forward to rscentralvalleycleaning.com.
- 425 verified Central Valley leads pulled from Getlead (private/, not in git) for owner to upload. Getlead renamed its export columns — the app's server-side Getlead search mapper uses the old labels.
- Mailboxes page now syncs live from Instantly; needs an Instantly key with accounts:read.

## 2026-10-01
- Instantly connected to the app (Campaigns page: preview → add approved leads; never launches). Removed main-domain senders from Instantly campaign "V1" (still draft). Waiting on owner: downgrade Instantly to Growth; add Instantly as sequencer in InboxKit → then export 18 mailboxes + start warmup.
- Added `rs-lead-gen-os/` (Next.js + Postgres dashboard/backend from the uploaded zip). Typecheck, 20 tests (incl. DB), and `next build` pass; smoke-tested ingest (re-import = 0 dupes), approval, research, export locally.
- Security fix: middleware no longer lets an arbitrary `Bearer` token bypass login (was exposing `/api/export` etc.).
- Deployed: Railway service `web` (root dir `rs-lead-gen-os`, branch `claude/gracious-noether-voa51y` until PR merges) → https://web-production-3079.up.railway.app. Migration 001 applied on Railway Postgres. Secrets are in Railway Variables only.
- Pilot data (63 orgs / 97 contacts + InboxKit snapshot) prepared in `private/` (gitignored — **repo is public, never commit contact data**). Load with `rs-lead-gen-os/scripts/import-pilot.sh` from the Mac.
- Next: run import script; merge PR then switch Railway source branch to `main`; consider making repo private.

## 2026-09-29
- Set up `CLAUDE.md` (shared instructions) and this log so Mac and cloud sessions stay in sync.
- Next: add first lead list to `leads/` and first outreach template to `templates/`.

## To-do
- [ ] Decide target customer types (e.g., offices, Airbnb hosts, property managers)
- [ ] Decide target cities in the Central Valley
- [ ] First outreach email template
