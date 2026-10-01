# R&S Lead Generation OS — handoff for Claude Code

Read this first, then README.md, DEPLOY.md, ARCHITECTURE.md and docs/status-2026-10-01.xlsx.

## Stack (do not change without owner approval)
Next.js 15 + TypeScript · Railway (web + PostgreSQL) · Getlead (leads) · InboxKit (domains/mailboxes) · Claude (research).
Do NOT add Supabase, Clay, Apollo, Hunter, Instantly, Smartlead or any paid service without the owner's explicit OK.

## Current state (Oct 1, 2026)
- Railway project `rs-lead-gen-os`: PostgreSQL provisioned (service `Postgres`, region ams). **Web app not deployed.**
  Two empty services `collector` and `reply-classifier` exist — unused; don't delete without asking.
- This repo: schema `db/migrations/001_init.sql` (auto-applied by `npm start`), Getlead ingest (dedupe → classify → 100-pt score → queue),
  dashboard pages, lead drawer, approval queue, research API, InboxKit snapshot sync. Tests: `npm test` (DB tests need TEST_PSQL_ARGS).
  `npm run typecheck` / `next build` have NOT been run yet (npm was blocked in the previous environment) — run them first and fix anything.
- Live dashboard (interim, until Railway is deployed): claude.ai artifact https://claude.ai/artifact/QRmiFUckxm3arQuqZZwR9Q
  Source: docs/live-dashboard-artifact.html. Its data store holds 63 real Bakersfield leads (Getlead pilot), InboxKit domains/mailboxes,
  owner approvals (`leads/<id>.approval`, `decidedAt`) and research (`leads/<id>.research`). Copy that into Postgres after deploy.

## Your next tasks, in order
1. `npm install && npm run typecheck && npm test && npm run build` — fix errors without changing behaviour.
2. Deploy to Railway (see DEPLOY.md): web service from this repo, `DATABASE_URL=${{Postgres.DATABASE_URL}}`, APP_PASSWORD, INGEST_SECRET, CRON_SECRET.
   Verify `/api/health` → database ok, migration 001 applied.
3. Migrate the live-dashboard data (leads, approvals, research, InboxKit snapshot) into Postgres via `/api/ingest/getlead`, `/api/sync/infrastructure`, `/api/research/:orgId`. Re-import must create zero duplicates.
4. Bring the six dashboard improvements into the Next.js app where missing (most exist): Needs-Your-Attention panel, end-to-end test tracker,
   actionable DNS/mailbox states, "Primary Business Domain — Protected" wording, Research-with-Claude button in the queue. Use real DB state only.
5. Stop at the sender boundary. No sender is chosen; Getlead and InboxKit cannot send email. Show it as blocked. Never send or launch outreach without explicit owner approval.

## Hard rules
- Never fabricate leads, metrics, research or connection status. Empty states say what's missing.
- `rscentralvalleycleaning.com` is the protected primary business domain: never cold-email from it, never rotate or assign it. In InboxKit it is "scheduled for removal from InboxKit only" — do not imply the domain is being deleted.
- Human approval between qualified leads and outreach. Rejected/suppressed leads never enter outreach.
- Secrets only in Railway variables. Confirm before any destructive infra action.
- When you need something from the owner, give: exact site/page, exact button, exact info, where to put it, how to verify.
