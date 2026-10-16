#!/usr/bin/env bash
# One-time load of the Bakersfield pilot + InboxKit snapshot into the deployed app.
# Usage (from rs-lead-gen-os/):  INGEST_SECRET=… ./scripts/import-pilot.sh
# Data files live in ../private/ (gitignored — the repo is public, never commit contact data).
set -euo pipefail
: "${APP_URL:=https://web-production-3079.up.railway.app}"
: "${INGEST_SECRET:?Set INGEST_SECRET (Railway → web → Variables)}"
export APP_URL INGEST_SECRET
cd "$(dirname "$0")/.."
node scripts/push.mjs ingest/getlead ../private/2026-09-getlead-bakersfield-pilot.json
node scripts/push.mjs sync/infrastructure ../private/inboxkit-snapshot-2026-10-01.json
curl -s "$APP_URL/api/health"; echo
