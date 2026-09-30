# Data platform: Supabase + Railway

Goal: every email event from Instantly lands in one Postgres database, joined to the scored leads,
so we can see which business types, titles and score bands actually reply and book.

```
GetLeads MCP ──> pipeline/score_leads.py ──> leads_scored.csv ──> pipeline/load_leads.py ──┐
                                                                                            ▼
Instantly webhooks ──> Railway: services/collector (FastAPI) ──> Supabase Postgres (db/migrations)
                                                                        │
                       Railway cron: analyze_replies.py  <──────────────┤  (classifies replies)
                                                                        ▼
                                          views: lead_funnel, performance_by_* , /api/metrics
```

## Decision (2026-09-30): Instantly is not used

Ruben confirmed Instantly is not part of the stack. Do not connect it, do not set an Instantly
webhook token, and leave the six old Instantly webhooks and the earlier Railway app
(`web-production-031d12`) untouched. The `/api/webhooks/instantly` endpoint in the collector stays
as dormant code until the real email source is chosen; step 4 below is skipped.

## One-time setup (about 20 minutes)

### 1. Supabase
1. Create a project (region: US West, closest to Bakersfield). Save the database password.
2. SQL editor: paste and run `db/migrations/001_init.sql`.
3. Project Settings > Database: copy the **pooler** connection URI (port 6543). That is `DATABASE_URL`.

### 2. Railway
1. New project > Deploy from GitHub repo > this repo, branch `main` (after the PR merges) or the
   working branch. Railway picks up `railway.json` and builds `services/collector/Dockerfile`.
2. Variables: `DATABASE_URL`, `INSTANTLY_WEBHOOK_TOKEN` (generate a fresh 64-char hex token),
   optional `ANTHROPIC_API_KEY`.
3. Settings > Networking > Generate domain. Note the URL, e.g. `https://rs-collector.up.railway.app`.
4. Check `GET /health` returns `{"ok": true, "events": 0}`.
5. Add a second service from the same repo for the cron: start command
   `python -m services.collector.analyze_replies`, cron schedule `*/30 * * * *`, same variables.

### 3. Load the scored leads
From a machine with the data folder (the Mac):
```
DATABASE_URL=... python3 pipeline/load_leads.py data/pilot_bakersfield_healthcare/leads_scored.csv \
                                              data/test_bakersfield_icp/leads_scored.csv
```
Re-run any time a list is regenerated; it upserts.

### 4. Repoint Instantly
In Instantly > Settings > Webhooks, edit each of the six webhooks: set the URL to the new Railway
domain plus `/api/webhooks/instantly`, and set the header `x-rs-webhook-token` to the new token.
Then send a test event from Instantly and confirm `GET /health` shows `events: 1`.

## Reading the data
- `GET /api/metrics` on the collector: reply and positive rates by business type, title tier,
  score band and sequence step, plus raw event totals.
- `GET /api/replies?limit=50`: latest replies with classification and one-line summary.
- Supabase SQL editor: the `lead_funnel` view is one row per lead with sent/opened/replied/
  positive/booked flags. Everything else builds on it.

## Rules
- The collector never sends email. It only records what Instantly reports.
- Raw payloads are kept in `email_events.payload`; nothing is thrown away, so the schema can grow.
- Row level security is on; the collector connects with the database URL, not the anon key, so no
  browser client can read lead data.
