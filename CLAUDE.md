# CLAUDE.md — Lead Generation (Get Leads)

Claude reads this file automatically at the start of every session — on your Mac
(Claude Code desktop/CLI) and in cloud sessions. Keep it short: every line here costs
tokens in every session.

## What this project is
Lead generation for **RS Central Valley Cleaning**: finding, organizing, and
contacting potential cleaning clients.

## How we work together (Mac + cloud)
- **Always `git pull` before starting** and **commit + push when done**, so the Mac
  and cloud sessions see the same files.
- Work on a branch, open a pull request, merge to `main`.
- Log what was done and what's next in `NOTES.md` (keep it brief — newest at top).
- Don't re-explain context that's already in this file or `NOTES.md`.

## Folder layout
- `CLAUDE.md` — standing instructions (this file). Rarely changes.
- `NOTES.md` — running progress log, decisions, and to-dos.
- `leads/` — lead lists (CSV). One file per source/date, e.g. `leads/2026-09-google-maps.csv`.
- `templates/` — email / text / call scripts.

## Conventions
- Lead CSV columns: `business_name,contact_name,email,phone,website,city,source,status,notes`
- `status` values: `new`, `contacted`, `replied`, `booked`, `not_interested`
- Never commit passwords or API keys.

## Token-saving tips for Claude
- Read `NOTES.md` first instead of re-scanning the whole repo.
- Only open the specific lead file needed; don't load every CSV.
- Give short answers unless asked for detail.
