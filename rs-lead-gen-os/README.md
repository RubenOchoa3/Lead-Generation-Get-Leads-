# R&S Lead Generation OS

Internal operating dashboard for R&S Central Valley Cleaning:
**find → dedupe → qualify → score → research → approve → (outreach) → replies → meetings → customers**.

Stack: **Next.js 15 + TypeScript · Railway (web + PostgreSQL) · Getlead (leads) · InboxKit (sending infrastructure) · Claude (research/analysis)**.
No Supabase, Google Places, Hunter, Clay or Apollo. Nothing on any page is simulated — empty states say what is missing.

## What works now (v0.2, Phase 1)
| Area | Status |
|---|---|
| Postgres schema + auto-migrations (`npm start` runs them) | Implemented, tested locally on PG 16 |
| Getlead → Postgres ingest (dedupe, classify, transparent 100-pt score, queue) | Implemented, tested with a real 100-lead Bakersfield pull |
| Import paths: Claude Getlead MCP → `/api/ingest/getlead`, or Getlead CSV upload on Find Leads | Implemented |
| Server-side Getlead search (Get Leads / Preview count) | Code ready, **needs `GETLEAD_API_KEY` + `GETLEAD_API_BASE`**; endpoint paths unverified |
| Dashboard, Leads table + right drawer, Approval Queue (keyboard + mobile), Analytics, Health, Automations, Settings | Implemented |
| Mailboxes / Domains from InboxKit snapshots (`/api/sync/infrastructure`) | Implemented |
| Claude research (server: `ANTHROPIC_API_KEY`; or pushed from a Claude session) | Implemented, server path untested without a key |
| Campaigns / Replies | Honest "not connected" — **waiting on sender decision** (Getlead cannot send email) |
| Daily scheduled engine | Off by design until the pilot is reviewed |

## Safety rules enforced in code
- Basic auth on every page/API (`APP_PASSWORD`; refuses to serve in production without it). Machine calls need `INGEST_SECRET` / `CRON_SECRET`.
- `rscentralvalleycleaning.com` is permanently suppressed (DB seed + hard-coded).
- Janitorial competitors (NAICS 561720/561790) auto-suppressed.
- `outreachBlockers()` refuses any contact that is not Approved, not VALID, suppressed, or previously bounced/complained/unsubscribed.
- Only one run per automation type at a time (unique partial index).
- No code path sends email.

## Local development
```bash
npm install
cp .env.example .env.local   # set DATABASE_URL to a local Postgres
npm run migrate
npm run dev
npm run typecheck && npm test   # DB tests run when TEST_PSQL_ARGS is set, e.g. "-h localhost -U postgres -d postgres"
```

## Pushing data from Claude
```bash
APP_URL=https://<app>.up.railway.app INGEST_SECRET=… npm run push -- ingest/getlead pilot.json        # {"rows":[…GetLeads rows…]}
APP_URL=… INGEST_SECRET=… npm run push -- sync/infrastructure inboxkit.json                           # {"domains":[…],"mailboxes":[…]}
APP_URL=… INGEST_SECRET=… npm run push -- research/<orgId> research.json                              # validated research JSON
```

See `DEPLOY.md` for Railway steps and `ARCHITECTURE.md` for the data flow.
