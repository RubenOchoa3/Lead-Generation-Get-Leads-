# Architecture (v0.2)

```
Getlead ──(Claude MCP pull | CSV export | server REST*)──► /api/ingest/getlead
                                                            │
                         mapGetleadRow → classifyBusiness → findOrganization (provider id → domain → name+address → phone)
                                                            │
                         contacts dedupe (email → provider id → LinkedIn → org+name) → rescoreOrganization (100 pts, reasons)
                                                            │
                         suppression check → approval_queue (score ≥ threshold + eligible DM + VALID email)
                                                            ▼
                                           Railway PostgreSQL (source of truth)
                                                            ▼
                     Dashboard · Leads (+drawer) · Approval Queue · Analytics · Health · Automations
                                                            ▼
                               Approved contacts → outreachBlockers() → [sender — not chosen yet]
InboxKit ──(Claude MCP snapshot | server API*)──► /api/sync/infrastructure → domains, mailboxes
Claude ──(session push | server API*)──► /api/research/:orgId → research
```
\* server-side integrations activate when their env keys are set.

Key files: `lib/ingest.ts` (pipeline), `lib/scoring.ts`, `lib/classify.ts`, `lib/suppression.ts`, `lib/providers/getlead.ts`, `db/migrations/001_init.sql`.

## Scale path
Imports are batched in one transaction with a savepoint per record. For daily volumes > ~2,000 rows, move runs to a Railway worker service (same codebase, `node` entry calling `ingestBatch`) triggered by Railway cron → `/api/cron/daily`.
