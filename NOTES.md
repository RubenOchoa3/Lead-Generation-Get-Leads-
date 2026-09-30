# Notes & Progress Log

Newest entries at the top. Keep each entry to a few lines.

## 2026-09-30 (cloud session, outreach system plan)
- Wrote `docs/OUTREACH_SYSTEM_PLAN.md`: audit, provider comparison, capacity math, costs, ramp plan, task ownership.
- Audit surprises: Instantly is already paid (Hyper Growth $97/mo, renews 2026-10-24) and has the MAIN domain mailboxes as campaign senders; InboxKit has no plan or mailboxes yet; 11 of 12 lookalike domains connected; main domain restored to Squarespace after an accidental nameserver switch and removed from InboxKit.
- Recommendation: InboxKit Google mailboxes (3 per lookalike domain) + Instantly (already paid) + GetLeads. Pilot ~$119/mo extra for ~400 new/day; full 1,000/day needs 30 domains, ~$316/mo extra.
- Next: Ruben answers spend ceiling, cadence, address, Instantly keep/cancel; then AI executes purchases and setup on authorisation.

## 2026-09-30 (cloud session, decision: no Instantly)
- Ruben: Instantly is not being used, so do not connect it. The Instantly webhook token, the six existing Instantly webhooks and the old Railway app (`web-production-031d12`) are all left alone; nothing to repoint.
- Railway project `rs-lead-gen-os` and Supabase project exist (schema applied) but the collector has no email source yet. Open question: which tool will send the outreach emails (Gmail? something else?) so the collector can ingest from it instead of Instantly webhooks.
- Next: answer that question, then finish Railway (repo source, DATABASE_URL, domain) and load the two lead lists.

## 2026-09-30 (cloud session, data platform)
- Built the collector for Railway + Supabase: `db/migrations/001_init.sql`, `services/collector/` (FastAPI webhook receiver, `/api/metrics`, `/api/replies`, reply classifier cron), `pipeline/load_leads.py`, `railway.json`, `.env.example`, `docs/DATA_PLATFORM.md`. Tested end to end against a local Postgres.
- Railway and Supabase are NOT connected to the Claude account yet, so the projects are not created. Instantly already has 6 webhooks pointed at an older Railway app (`web-production-031d12`); decide keep vs replace before repointing.
- Next: connect Railway + Supabase connectors (or do the 4 setup steps in docs/DATA_PLATFORM.md by hand), load the two lead lists, repoint webhooks.

## 2026-09-30 (cloud session)
- Ran a 25-lead ICP test in Bakersfield outside healthcare (property mgmt, offices, industrial, manufacturing, schools). 141 rows, 79 businesses, top 25 delivered: 25 real decision makers (17 facilities-titled), 25 verified emails, 24 direct phones. 141 credits. Output under `data/test_bakersfield_icp/` (git-ignored).
- Extended `pipeline/score_leads.py`: non-healthcare ICP classifier, plant/warehouse managers rank as facilities buyers, assistants do not, and companies already delivered in an earlier list are skipped.
- Next: Ruben reviews both lists; then per-type pulls (churches, gyms, daycares, dealerships) and other Central Valley cities.

## 2026-09-29 (cloud session)
- Connected the GetLeads MCP to the Claude account (OAuth, unlimited plan, 500k rows/day fair-use).
- Wrote `docs/RS_LEAD_SPEC.md` (targets, decision-maker ladder, 0-100 scoring) and `pipeline/score_leads.py` (dedupe, best buyer per company, scoring, audit).
- Ran pilot 1: Bakersfield medical/dental/clinics. 1,168 raw rows, 175 unique businesses, top 100 scored (92 real decision makers, 75 verified emails). 1,213 credits used. No outreach sent.
- Pilot output is on disk under `data/pilot_bakersfield_healthcare/` (git-ignored: contains personal contact data). Copy the CSV into `leads/` from the Mac if it should be tracked.
- Next: Ruben reviews the pilot audit, then approve larger pulls and the other business types.

## 2026-09-29
- Set up `CLAUDE.md` (shared instructions) and this log so Mac and cloud sessions stay in sync.
- Next: add first lead list to `leads/` and first outreach template to `templates/`.

## To-do
- [ ] Decide target customer types (e.g., offices, Airbnb hosts, property managers)
- [ ] Decide target cities in the Central Valley
- [ ] First outreach email template
