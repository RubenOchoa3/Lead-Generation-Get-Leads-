# Campaign learnings (lead-to-profit log)

Read by the `campaign-optimizer` agent before every review; appended after every review.
Rules: `.claude/skills/cold-email-playbook/SKILL.md`. Newest entries at the top of "Reviews".

## Current Control
- **Control (90%)** — `RS · Cycle 1 · Control · Local businesses` (65e5efa2-4d18-4f38-a632-9d1a292369e2).
  Offer: 20-min walkthrough + written room-by-room plan with fixed monthly price (keep it either way);
  free first deep clean + discount on first contract; 24-hour fix guarantee; "reply YES" or Calendly.
  No social proof yet (new business) — owner-run and local instead.
- **Experiment (10%)** — `RS · Cycle 1 · Experiment · Big companies` (59861f3c-357f-45ba-abda-631d90dd84b3):
  same offer, opens with "is cleaning decided locally or by corporate — who should I talk to?"
- No Iterate (20%) arm yet — first candidate after ~300 local sends.

## Proven lessons
_None yet — need closed deals before anything goes here._

## Open hypotheses
- Free walkthrough + written room-by-room scope is a strong enough offer for local facilities.
- Local independent offices (dental, medical, property management) close better than national chains,
  whose cleaning is usually bought by corporate.

## Reviews
### 2026-10-09 — week 1 review (Mon Oct 5 – Fri Oct 9)
- **Control (local):** 406 sent, 36 bounced (8.9%), 370 delivered, 0 real replies, 2 out-of-office, 0 unsubscribes,
  0 YES / walkthroughs / wins. Emails per reply: n/a (0 replies).
  - Statewide leads (Oct 5–6): 197 sent, 22 bounced (11.2%) — national chains and people who had left (H&R Block,
    Merck, Alorica, Follett…).
  - Kern County HQ leads (Oct 7–9): 209 sent, 14 bounced (6.7%; Oct 9 batch 2/54 so far), ~195 delivered.
- **Experiment (big companies):** 18 sent, 3 bounced, 0 replies — paused since Oct 6.
- **Health:** bounce well over the 3% line → weekly ramp held at 5/mailbox. All 18 mailboxes warmup 100%, but warmup
  only started Oct 3 and cold sends began Oct 5 (playbook says 14 days). Owner chose to keep sending during warmup.
  All 18 senders are Microsoft; ~60% of recipients are on Microsoft, ~25% behind security gateways.
- **Data quality:** several bounces have an email domain that doesn't match the company (rlawson@google.com for
  Twin Electric, @air-streams.com for Green Energy TSG, @adultedventura.edu for a vision clinic) → stale GetLeads data.
  Kern pool nearly used up after ~230 businesses (contacts cluster ~5 per business); Oct 9 reached 84 of 90 after
  widening once to Tulare/Kings/Fresno. Fixed: top-up was re-picking un-addable leads (commit af5407e).
- **Decision:** too early to judge the email (needs ≥300 delivered Kern sends ≥3 days old; have ~85). Keep Email A
  running. Owner already agreed to a 50/50 test next week: Email A vs Email B (5-Minute Clean Test give-first offer,
  no link, no "free" subject) — draft below, awaiting owner OK. Free deep clean dropped from new copy (owner).
- **Hypotheses:** (1) a give-first checklist offer gets more replies than a walkthrough ask from cold strangers;
  (2) a lowercase, no-"free", no-link email lands in the inbox more often; (3) skipping contacts whose email domain
  doesn't match the company website cuts bounces at no cost.
- **Next review:** reply rate A vs B (need ~300 delivered each), Kern vs widened-area bounce, seed inbox test result.

### 2026-10-05 — launch
- Both campaigns activated by the owner ("launch"); first sends Tue Oct 6, 8 AM–12 PM PDT. 50 local + 32 big
  leads loaded; daily batches (/today) add more after owner approval. Opens/clicks tracking OFF on purpose
  (deliverability on 2-day-old domains); judge by replies → YES → walkthroughs → wins → revenue.
### 2026-10-05 — setup
- Pilot built: 90 approved Central Valley leads, mailboxes warmed since Oct 3 (warmup score 100), capped 5/day.
- System brought in line with the playbook: one email per cycle, 45-day cooldown between campaigns,
  deal outcomes + revenue on each lead, revenue by segment, Instantly webhook (sent/reply/bounce/unsub,
  "no thanks" auto-suppressed).
- Next: load owner's script as the single email, launch on his OK, first review after ~300 sends.
