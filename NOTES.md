# Notes & Progress Log

Newest entries at the top. Keep each entry to a few lines.

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
