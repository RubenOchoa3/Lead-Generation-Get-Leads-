import type { Db } from "@/lib/db";
import { replyToEmail } from "@/lib/providers/instantly";

/**
 * First answer to a cold-email reply, sent from the same mailbox in the same thread ~1 minute
 * after it arrives (fast, but not robotic). Speed-to-lead: interest fades within minutes.
 * One auto-reply per lead per campaign; never to auto-replies, opt-outs or "not interested".
 * Ruben still follows up personally — his phone gets every reply.
 */
export type AutoReplyKind = "book" | "ack";

const PHONE = "(661) 998-1437";
const calendly = () => process.env.CALENDLY_URL || "https://calendly.com/rubenochoa-rscentralvalleycleaning/30min";
const BOOKING_WORDS = /\b(yes|yeah|yep|sure|interested|sounds good|fix it|let'?s do it|come by|schedule|book|available|when can you|walk ?through)\b/i;

/** Which answer (if any) a reply gets. */
export function pickAutoReply(eventType: string, classification: string | null, text: string | null): AutoReplyKind | null {
  const t = eventType.toLowerCase();
  if (t.includes("auto_reply") || t.includes("out_of_office")) return null;
  if (classification === "Unsubscribe" || classification === "Not Interested" || classification === "Out of Office") return null;
  const body = (text ?? "").trim();
  if (!body && !t.includes("interested")) return null;
  if (classification === "Positive" || BOOKING_WORDS.test(body.slice(0, 300))) return "book";
  return "ack";
}

/** Next two weekdays after `now`, in Pacific time, as "Thursday" / "Friday". */
export function nextTwoWeekdays(now = new Date()) {
  const days: string[] = [];
  const fmt = new Intl.DateTimeFormat("en-US", { timeZone: "America/Los_Angeles", weekday: "long" });
  for (let i = 1; days.length < 2 && i < 8; i++) {
    const d = new Date(now.getTime() + i * 86_400_000);
    const name = fmt.format(d);
    if (name !== "Saturday" && name !== "Sunday") days.push(name);
  }
  return days as [string, string];
}

export function autoReplyText(kind: AutoReplyKind, firstName: string | null, now = new Date()) {
  const hi = `Hi ${firstName?.trim() || "there"},`;
  if (kind === "book") {
    const [d1, d2] = nextTwoWeekdays(now);
    return `${hi}

Thanks for getting back to me! I'd be glad to come take a look.

Would ${d1} at 10am or ${d2} at 2pm work for a quick 20-minute walkthrough? If another time is easier, grab any slot here: ${calendly()}

Or call/text me anytime at ${PHONE}.

Ruben Ochoa, Owner
R&S Central Valley Cleaning`;
  }
  return `${hi}

Thanks for the reply. I got your message and I'll get back to you personally shortly.

If it's easier, call or text me anytime at ${PHONE}.

Ruben Ochoa, Owner
R&S Central Valley Cleaning`;
}

export type AutoReplyJob = {
  leadEmail: string; campaignId: string; replyEmailId: string; eaccount: string;
  subject: string; firstName: string | null; kind: AutoReplyKind;
};

/** Claim the one auto-reply slot for this lead+campaign. Returns false if one already exists. */
export async function claimAutoReply(db: Db, job: AutoReplyJob) {
  const r = await db.query(
    `insert into auto_replies (lead_email, campaign_external_id, reply_email_id, template) values ($1,$2,$3,$4)
     on conflict (lead_email, campaign_external_id) do nothing returning id`,
    [job.leadEmail, job.campaignId, job.replyEmailId, job.kind]);
  return r.rows.length > 0;
}

export async function sendAutoReply(db: Db, job: AutoReplyJob) {
  try {
    const subject = /^re:/i.test(job.subject) ? job.subject : `Re: ${job.subject}`;
    await replyToEmail({ replyToUuid: job.replyEmailId, eaccount: job.eaccount, subject, text: autoReplyText(job.kind, job.firstName) });
    await db.query(`update auto_replies set status = 'sent', sent_at = now() where lead_email = $1 and campaign_external_id = $2`, [job.leadEmail, job.campaignId]);
    return { ok: true as const };
  } catch (e) {
    const msg = (e as Error).message.slice(0, 300);
    await db.query(`update auto_replies set status = 'failed', error = $3 where lead_email = $1 and campaign_external_id = $2`, [job.leadEmail, job.campaignId, msg]);
    return { ok: false as const, error: msg };
  }
}

/** Delay before the auto-reply goes out (default ~75s; set AUTO_REPLY_DELAY_MS, 0 in tests). */
export const autoReplyDelayMs = () => Math.max(0, Number(process.env.AUTO_REPLY_DELAY_MS ?? 75_000));
