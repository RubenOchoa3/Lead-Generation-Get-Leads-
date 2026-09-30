# RS Commercial Cleaning: email outreach system plan

Date: 2026-09-30. Goal: 1,000 first-contact emails/day to new California prospects,
follow-ups counted separately. Optimise for qualified replies, then volume, at minimum
additional spend. Nothing here is purchased or launched without Ruben's authorisation.

## 1. Audit of what exists (verified via connected tools, 2026-09-30)

| Asset | State | Cost today |
|---|---|---|
| 12 lookalike domains (Spaceship) | 11 connected to InboxKit (nameservers matched). `rscentralvalleycleaning.online` still on Spaceship NS. | Paid (annual) |
| Main domain `rscentralvalleycleaning.com` | Back on Squarespace NS; A, MX (Google), SPF, DKIM, DMARC p=none all present. Removed from InboxKit (scheduled for deletion). | n/a |
| InboxKit | No plan, 0 credits, 0 mailboxes, 0 warmups, no sequencer connected. | $0 |
| Instantly | **Paid: Hyper Growth, $97/month, renews 2026-10-24.** 25,000 active-lead cap (13 used). 1 mailbox connected: `rubenochoa@` on the MAIN domain (warmup score 100, limit 20/day). 2 draft campaigns; the R&S V1 draft is a 4-step sequence sending from `rubenochoa@` and `info@` (main domain). 6 webhooks point at the old Railway app. | $97/mo |
| GetLeads | Unlimited plan; 500k rows/day fair use, ~1.4k used this month. CA decision makers with VALID email: 131,079 (title match, all industries); 30,992 inside the target facility industries. Export cap 50k per CSV. | Paid |
| Railway `courteous-encouragement` (old) | 4 services live (web, worker, control, Postgres 500 MB). Code not in this repo. | Usage billing |
| Railway `rs-lead-gen-os` (new) | 2 services created, no source, no deployments. | ~$0 |
| Supabase `rs-lead-gen-os` | Active, schema applied. Old project inactive. | Free tier |
| This repo | Scoring pipeline, Supabase schema, collector service (built for Instantly-style webhooks), 125 scored Bakersfield leads on disk. | $0 |

Key audit findings
- A campaign sender already exists and is already paid for: Instantly Hyper Growth at $97/month.
  Using it costs $0 more. Replacing it (Smartlead Pro ~$94, Saleshandy ~$25-35 plus infra) costs more.
- The main business domain is wired into Instantly as a sender and in warmup. That must be
  removed before any launch.
- Lead supply is the real constraint on quality: 31k high-fit CA contacts = about 6 weeks at
  1,000/day. 131k broad = about 6 months.

## 2. Mailbox provider comparison

Prices marked (API) were read from InboxKit's billing API today. Prices marked (list) are
public list prices from memory; vendor pages were unreachable from this sandbox and must be
confirmed at checkout.

| Option | Price per mailbox / month | Setup burden | Notes |
|---|---|---|---|
| InboxKit Google slots (API) | Professional $39 for 10 ($3.90); Agency $99 for 30 ($3.30); Enterprise $299 for 100 ($2.99). Add-ons $3.50 / $3.25 / $2.99 | DNS, DKIM, profiles automated | **Cheapest supported path for owned domains.** |
| InboxKit Microsoft 365 add-on (API) | $5.00 | Automated | Dearer than Google here; Outlook reputation weaker for cold. |
| InboxKit Azure add-on (API) | $5.00 per mailbox, or pre-warmed tenant $40/mo + $12.50 domain (inventory shows 100 mailbox capacity per tenant) | Automated | Only cheaper if you pack many mailboxes on one domain, which burns the domain. Ask InboxKit if they quoted you a different Azure deal. |
| Google Workspace direct (list) | ~$7 annual / ~$8.40 monthly | Manual DNS, DKIM, warmup wiring per domain | 2x InboxKit cost plus hours of setup. |
| Microsoft 365 Business Basic / Exchange Online P1 (list) | ~$6 / ~$4 | Manual | Cheap on paper, weakest cold deliverability, manual setup. |
| InboxKit pre-warmed Google domains (API) | $6 per mailbox + $12.50 domain | None | Skips 2-3 week warmup; use only if speed matters more than $2.50/box. |

Recurring extras
- Warmup: included in Instantly Hyper Growth ($0). InboxKit warmup is $3/mailbox (API); not needed.
- Verification: GetLeads exports with `email_status=VALID` ($0). Add a bulk verifier only if
  bounce rate exceeds 3% (MillionVerifier or similar, roughly $10 per 25k, list price).
- Sending software: Instantly already paid. Smartlead Pro (~$94 list) or Saleshandy would be
  new spend for no gain.

## 3. Recommendation

Use InboxKit Google mailboxes on the lookalike domains, Instantly (already paid) as the
sender, GetLeads for supply, Supabase/Railway for tracking. Do not buy a second sending tool.

Capacity assumptions (labelled; none guarantee inbox placement)
- A1: 30 cold sends per mailbox per day after warmup.
- A2: 3 mailboxes per domain (reputation is per domain; more than 3-4 per domain raises risk).
- A3: 3-step sequence (day 0, day 4, day 9). Steady-state follow-ups ~1.7x new (after replies,
  bounces and opt-outs drop out).
- A4: 22 sending days per month.

Pilot (uses only what you own): 12 domains x 3 = 36 mailboxes x 30 = 1,080 sends/day
= about 400 new + 680 follow-ups per day, ~8,800 new prospects/month.

Full target: 1,000 new + ~1,700 follow-ups = 2,700 sends/day / 30 = 90 mailboxes = 30 domains.
Needs 18 more domains.

Itemised additional monthly cost

| Item | Pilot (400 new/day) | Full (1,000 new/day) |
|---|---|---|
| InboxKit plan | Agency $99 (30 slots) + 6 add-ons x $3.25 = $118.50 | Enterprise $299 (100 slots) |
| Extra domains | $0 | 18 x ~$11/yr = ~$17/mo equivalent (one-time ~$200) |
| Instantly | $0 (already $97) | $0, plus $87 lead add-on only if active leads exceed 25k (avoid by archiving finished leads) |
| Warmup, verification | $0 | $0 (verifier optional, ~$10 per 25k) |
| GetLeads, Railway, Supabase | $0 | $0 |
| **Additional per month** | **~$119** | **~$316** (~$403 if lead add-on needed) |

Cheapest useful pilot: InboxKit Professional $39 (10 slots) on 4 domains at 25/day = 250 sends/day,
~100 new/day. Adds $39/month. Good enough to prove reply rate before scaling.

Quality note: at 1,000 new/day the 31k high-fit CA pool is gone in 6 weeks. Recommended steady
state is 400-500 new/day from the high-fit pool, with the broad pool as overflow.

## 4. Setup and ramp plan

Week 0 (now)
1. Human: confirm spend ceiling, Instantly keep/cancel, follow-up cadence, physical address for
   the footer. Fix `rscentralvalleycleaning.online` nameservers in Spaceship.
2. AI (on authorisation): remove `rubenochoa@` and `info@` from the Instantly campaign and
   account list; buy InboxKit plan; create 3 Google mailboxes per domain (real first names,
   "R&S Central Valley Cleaning" as company, profile photo); InboxKit exports them to Instantly.
3. Auth per domain (InboxKit automates): SPF, DKIM, DMARC p=none with rua to a monitoring
   mailbox, custom tracking domain off (text-only campaigns), no open tracking.
4. Main-domain protection: never a sender; DMARC stays on Squarespace; reply-to on outreach
   mailboxes; forward interested replies to `info@`.

Weeks 1-3: warmup only (Instantly warmup, 20-40 warmup emails/day per box). No campaigns.

Week 3-4: pilot launch at 10/day per mailbox, +5/day every 3 days to 30. Start with the two
Bakersfield lists (125 leads) plus a GetLeads export of Central Valley high-fit contacts.

Week 5+: review metrics, then scale to 30 domains if reply and bounce targets hold.

Lead quality: GetLeads export with VALID email, target industries, decision-maker titles,
scored by `pipeline/score_leads.py`; only score >= 60 goes into campaigns; dedupe against
Supabase `leads` before upload.

Reply handling: Instantly stop-on-reply on; AI classifies replies (rules first, Claude second)
into the Supabase `replies` table via the collector; interested and meeting-booked go to Ruben
by email the same day; out-of-office resumes after 7 days; not-interested is suppressed.

Opt-outs: every email carries a plain-text opt-out line and the postal address (CAN-SPAM);
Instantly adds List-Unsubscribe headers; opt-outs suppressed across all campaigns within
24 hours (law allows 10 days); global blocklist of replied not-interested and bounced.

Monitoring (weekly, AI): bounce < 3%, spam complaints < 0.1%, reply rate 2-5% target,
positive rate >= 0.5%; pause any mailbox with bounce > 5% or a Google postmaster flag;
rotate a domain out if its reply rate drops below half the fleet average.

Requirements: CAN-SPAM (accurate From, honest subject, physical address, working opt-out);
Google and Yahoo bulk-sender rules (SPF, DKIM, DMARC, one-click unsubscribe, complaint rate
under 0.3%); California CCPA notice-at-collection for B2B contacts (link to a privacy page).

## 5. Task ownership

| Task | Owner | Status |
|---|---|---|
| Audit stack, DNS, InboxKit, Instantly, GetLeads, Railway, Supabase | AI | Completed, verified 2026-09-30 |
| Restore main domain DNS, remove it from InboxKit | AI + Human (Squarespace) | Completed, verified |
| This plan and NOTES entry | AI | Completed |
| Spend ceiling, cadence, address, Instantly keep/cancel | Human | Pending |
| Fix `.online` nameservers; buy 18 more domains later | Human (Spaceship) | Pending |
| Remove main-domain senders from Instantly | AI | Proposed, needs OK |
| Buy InboxKit plan and mailboxes | AI executes, Human authorises spend | Proposed |
| Export and score CA lead lists from GetLeads | AI | Proposed |
| Load leads to Instantly, edit sequence to 3 steps, add footer | AI | Proposed |
| Connect Railway collector to repo, set DATABASE_URL, repoint Instantly webhooks | AI + Human (DB password) | Proposed |
| Decide fate of old Railway project (4 live services, billing) | Human | Pending |
| Copy review, ICP tuning, reply triage | Shared | Ongoing |
| Answer interested replies, quotes, walkthroughs | Human | Ongoing |
