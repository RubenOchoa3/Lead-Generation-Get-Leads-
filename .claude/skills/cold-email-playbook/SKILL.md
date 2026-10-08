---
name: cold-email-playbook
description: R&S Central Valley Cleaning's cold email playbook — building the offer ($100M Offers value equation and offer stacking), short them-first copy with a give-first gift and soft CTA, one email per person per cycle, and 70/20/10 testing judged by closed revenue. Use whenever writing, reviewing, launching, scaling or analyzing a cold email campaign, building or changing the offer, picking leads for a send, or deciding what to test next.
---

# Cold Email Playbook (lead-to-profit)

Sources: "This Cold Email Strategy is Boring, But It Made $999,750" (owner's PDF guide, Oct 2026);
the owner's NotebookLM manual built from Hormozi, Instantly, Leo Moore, Kirke Männik and Jayden
Leilua → digest in `references/cold-email-manual.md` (rules, frameworks, verbatim examples, reply
scripts, checklist); Alex Hormozi's *$100M Offers* method → `references/100m-offers.md`.
**Read both references before writing or changing any email or offer.**
Living results log: `docs/campaign-learnings.md` — read it first, append to it after every review.

## 1. What "winning" means
- Grade campaigns on **closed annual revenue**, never on reply rate. A polite "looks great" with no
  contract is worth $0 (the lemonade-stand rule).
- Every won deal must trace back to campaign → segment (business type) → copy. In the dashboard:
  lead drawer → **Replied YES / Walkthrough booked / Won $ / Lost**; Campaigns page →
  **Lead-to-profit by segment** and per-campaign Revenue.

## 2. Cadence (never nag)
- **One email per person per cycle.** No 4–5 step follow-up sequences. Each Instantly campaign has
  exactly one step. (Note: the NotebookLM sources recommend 3–5 value-add touches 2–3 days apart.
  That conflicts with this rule; it stays one email until the owner decides otherwise.)
- Same person is never added to the same campaign twice. They can get a *new* email in a *new*
  campaign only after the cooldown (dashboard rule: 45 days; allowed range 30–60).
- Map the whole market (TAM): Getlead searches + New Businesses registry waterfall + call/visit list.
  Reach everyone once per cycle rather than hammering a small list.

## 2b. Who we email
- **Local businesses only** (under 1,000 employees). National chains, big health systems and large
  agencies buy cleaning through corporate contracts — a local manager can't say yes. The dashboard
  enforces this: searches send `employees_max: 1000` and the campaign push blocks 1001+ employee
  companies. Locally-owned franchises (Home Instead, H&R Block offices) are fine.
- Email every available approved target once per cycle; volume is limited only by mailbox caps.

## 3. Copy recipe
**Offer first (≈80% of results).** Build it with `references/100m-offers.md` before touching copy:
value equation, stack of give-first pieces, a guarantee R&S can honor, true scarcity/urgency only,
and dollar values that match R&S's real prices.

Every email must pass:
1. **Them first, only them** — open on their building/role/pain, never "My name is…". If the line
   could go to 1,000 businesses unchanged, rewrite it.
2. **One give-first offer, framed as the outcome** — lead with the single strongest gift (free deep
   clean / free walkthrough + written plan), plus one risk-reversal line (24h re-clean guarantee,
   no long contract). Outcome language ("so that" ladder), not a list of chores.
3. **Honest proof** — local owner who walks every site, fixed written price, guarantee. Real R&S
   clients or results only; never invent names, numbers, testimonials or observations.
4. **One soft CTA** answerable in 3 seconds — "Reply yes and tell me what day works" / "Mind if I
   send it over?". No meeting ask; avoid links in the first email.
5. **Short** — 50–80 words (≤ 120 max), 1–2 sentence paragraphs, plain text; lowercase peer-style
   subject that matches the body (`free deep clean for {{companyName}}`, `janitorial question`).

Plus: no "I researched your LinkedIn" gimmicks or AI flattery, sign as **Ruben Ochoa**, and keep
the CAN-SPAM footer (physical address
5401 Business Park South, Suite 208, Bakersfield, CA 93309 + "reply no thanks and I won't email
again"). Replies of "no thanks"/unsubscribe are auto-suppressed by the Instantly webhook.

**Copy review checklist** (answer each yes/no before any copy goes live):
- [ ] Opener is about them and passes "only them"; no self-intro
- [ ] One give-first offer in the first 2 sentences, outcome-framed, every term true and approved
- [ ] Any dollar value matches R&S's real prices for the building size named
- [ ] Proof is real and attributable (or explicitly marked TODO for the owner)
- [ ] One soft CTA, no meeting ask, no link (or one plain link at most)
- [ ] ≤ 80–120 words, short paragraphs, lowercase subject that matches the body
- [ ] Follow-up steps only if the owner has approved a sequence (default: none)
- [ ] Footer address + opt-out line present; sender name Ruben Ochoa
- [ ] Merge fields have fallbacks (`{{firstName | there}}`)

## 4. Speed to YES
A YES must be answered within minutes during business hours (replies forward to the owner's
inbox; Instantly Unibox also shows them). Interest decays fast — a slow reply loses the deal.

## 5. 70/20/10 testing
Run three Instantly campaigns per cycle, all on the same warmed mailboxes, splitting the daily
new-lead volume:

| Share | Campaign | What goes in it |
|---|---|---|
| 70% | **Control** | Current best email by revenue per 100 emailed |
| 20% | **Iterate** | Small changes to the control: offer value, wording, subject, segment angle |
| 10% | **Experiment** | A genuinely different idea (new offer, new segment, new angle) |

At 90 new leads/day that is 63 / 18 / 9. Add leads to each campaign in that ratio (Campaigns page →
"How many"). Name campaigns `RS · <cycle> · Control|Iterate|Experiment · <short idea>`.

**Promotion rule:** after ≥ 300 emails per arm *and* at least one closed deal in the window,
the arm with the highest **revenue per 100 emailed** becomes the new Control. With no closed deals
yet, use walkthroughs booked per 100 as an interim signal and say it is interim. Retire a Control
whose revenue per 100 drops ~30% below its own trailing 4-week average (fatigue).

**Segments:** shift volume toward business types that close the largest contracts (Campaigns →
Lead-to-profit by segment), not those that reply most.

## 5b. Daily routine (how it runs)
- Before 5 AM the nightly run builds **Today's Send** (/today): 90% local, 10% big-company test,
  topped up from Getlead if the queue is short. The owner reviews people + exact emails and clicks
  **Approve & send**; leads go into the two active campaigns and send 8 AM–12 PM Pacific.
- Weekly ramp is automatic (5→10→15→20→25/mailbox) and holds when bounces ≥ 3% or complaints > 0.

## 6. Volume & deliverability guardrails
- New mailboxes: 5/mailbox/day in week 1, then +5/week while bounce < 3% and spam complaints ≈ 0,
  to a ceiling of 20–25/mailbox/day. Warmup stays on.
- `rscentralvalleycleaning.com` (main domain) is **never** a sender.
- Only approved leads with VALID emails, not suppressed, enter campaigns.
- Make sure the owner can handle the walkthrough load before scaling volume.

## 7. Hard rules for Claude
- Never launch, activate or resume a campaign, or send email, without the owner's explicit
  go-ahead in the current conversation. Drafting, analyzing and preparing paused campaigns is fine.
- Never purchase anything. Never fabricate proof or results.
- Record every review in `docs/campaign-learnings.md` (date, data window, numbers, decision, why).
