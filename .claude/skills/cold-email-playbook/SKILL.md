---
name: cold-email-playbook
description: R&S Central Valley Cleaning's "boring" lead-to-profit cold email playbook — one email per person per 30–60 day cycle, the 3-part offer/proof/reply-YES copy recipe, and 70/20/10 testing judged by closed revenue. Use whenever writing, reviewing, launching, scaling or analyzing a cold email campaign, picking leads for a send, or deciding what to test next.
---

# Cold Email Playbook (lead-to-profit)

Source: "This Cold Email Strategy is Boring, But It Made $999,750" (owner's PDF guide, Oct 2026).
Living results log: `docs/campaign-learnings.md` — read it first, append to it after every review.

## 1. What "winning" means
- Grade campaigns on **closed annual revenue**, never on reply rate. A polite "looks great" with no
  contract is worth $0 (the lemonade-stand rule).
- Every won deal must trace back to campaign → segment (business type) → copy. In the dashboard:
  lead drawer → **Replied YES / Walkthrough booked / Won $ / Lost**; Campaigns page →
  **Lead-to-profit by segment** and per-campaign Revenue.

## 2. Cadence (never nag)
- **One email per person per cycle.** No 4–5 step follow-up sequences. Each Instantly campaign has
  exactly one step.
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

## 3. Copy recipe (every email must pass all three)
1. **Clear value offer / incentive** in the first lines — what R&S does + a concrete reason to talk
   (e.g. free walkthrough with a written room-by-room cleaning scope they keep either way).
2. **Social proof** — real R&S clients or results only. Never invent client names, logos, numbers
   or testimonials. If the owner hasn't supplied proof, say so and leave a placeholder for him.
3. **Frictionless CTA** — "Just reply YES and I'll send times for the walkthrough." One ask, no links.

Plus: plain text, short (under ~120 words), no "I researched your LinkedIn" gimmicks or AI
flattery, sign as **Ruben Ochoa**, and keep the CAN-SPAM footer (physical address
5401 Business Park South, Suite 208, Bakersfield, CA 93309 + "reply no thanks and I won't email
again"). Replies of "no thanks"/unsubscribe are auto-suppressed by the Instantly webhook.

**Making the offer irresistible ($100M Offers value equation)** —
Value = (Dream outcome × Perceived likelihood) ÷ (Time delay × Effort & sacrifice). For a facility
manager: dream outcome = a building that's always clean without chasing the janitor; likelihood =
real local proof + a guarantee; time delay = walkthrough this week, can start within days; effort =
we write the scope, fixed monthly price, one reply to start. Stack bonuses the buyer values (free
written room-by-room scope they keep; first-month extras) and offer a guarantee R&S can actually
honor (e.g. missed item re-cleaned within 24 hours). Only claim scarcity/urgency that is true.

**Copy review checklist** (answer each yes/no before any copy goes live):
- [ ] Offer is stated in the first 2 sentences and is specific
- [ ] Proof is real and attributable (or explicitly marked TODO for the owner)
- [ ] CTA is "reply YES" (or equally effortless) and there is only one
- [ ] No follow-up steps in the campaign
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
