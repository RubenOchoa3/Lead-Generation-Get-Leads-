import { createHash } from "node:crypto";
import type { Db } from "@/lib/db";
import { notifyOwner } from "@/lib/notify";
import { autoReplyDelayMs, claimAutoReply, pickAutoReply, sendAutoReply, type AutoReplyJob } from "@/lib/autoReply";

/** "no thanks" / unsubscribe-style replies honour the opt-out line in every email. */
export const OPT_OUT = /\b(no thanks|no thank you|not interested|unsubscribe|remove me|stop emailing|take me off|do not (contact|email))\b/i;
const YES = /^\s*(yes|yes please|yep|yeah|sure|interested|sounds good)\b/i;

export type InstantlyEvent = Record<string, unknown>;

const s = (v: unknown) => (v === null || v === undefined ? null : String(v));

/** Instantly webhook event → our event type (null = ignore). */
export function mapEventType(t: string): string | null {
  const x = t.toLowerCase();
  // "campaign_completed_for_lead_without_reply" etc. mean the sequence ended, not that anyone replied.
  if (x.startsWith("campaign_completed")) return null;
  if (x.includes("sent")) return "sent";
  if (x.includes("bounce")) return "bounce";
  if (x.includes("unsubscribe")) return "unsubscribe";
  if (x.includes("meeting")) return "meeting_booked";
  if (x.includes("reply") || x.includes("interested")) return "reply";
  return null;
}

export function classifyReply(eventType: string, text: string | null) {
  const t = eventType.toLowerCase();
  if (t.includes("not_interested")) return "Not Interested";
  if (text && OPT_OUT.test(text)) return "Unsubscribe";
  if (t.includes("interested") || (text && YES.test(text))) return "Positive";
  if (t.includes("out_of_office") || (text && /out of (the )?office|on vacation|away until/i.test(text))) return "Out of Office";
  return "Other";
}

/**
 * Record one Instantly webhook event against the contact and campaign. Bounces, unsubscribes and
 * opt-out replies go on the suppression list so the contact is never emailed again.
 */
export async function recordInstantlyEvent(db: Db, e: InstantlyEvent) {
  const rawType = s(e.event_type) ?? "";
  const type = mapEventType(rawType);
  if (!type) return { ignored: rawType };
  const email = (s(e.lead_email) ?? s(e.email) ?? s(e.lead) ?? "").toLowerCase().trim();
  const replyText = s(e.reply_text_snippet) ?? s(e.reply_text) ?? s(e.body) ?? null;
  const step = Number(e.step ?? e.email_step ?? 0) || null;
  const when = s(e.timestamp) ?? new Date().toISOString();
  const externalId = createHash("sha1").update([rawType, email, s(e.campaign_id), step, when].join("|")).digest("hex");

  const { rows: [ct] } = await db.query<{ id: string; organization_id: string }>(
    `select id, organization_id from contacts where lower(email) = $1 order by is_primary desc limit 1`, [email]);
  const { rows: [camp] } = await db.query<{ id: string }>(
    `select id from campaigns where provider = 'Instantly' and external_id = $1 limit 1`, [s(e.campaign_id)]);
  const classification = type === "reply" ? classifyReply(rawType, replyText) : null;

  const ins = await db.query(
    `insert into outreach_events (organization_id, contact_id, campaign_id, mailbox, event_type, occurred_at, step, subject,
        reply_preview, reply_classification, external_id, provider)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'Instantly')
     on conflict (provider, external_id) where external_id is not null do nothing returning id`,
    [ct?.organization_id ?? null, ct?.id ?? null, camp?.id ?? null, s(e.email_account), type, when, step, s(e.email_subject),
      replyText?.slice(0, 500) ?? null, classification, externalId],
  );
  if (!ins.rows.length) return { duplicate: true };

  const suppress = type === "bounce" ? "hard_bounce" : type === "unsubscribe" || classification === "Unsubscribe" ? "opt_out" : null;
  if (suppress && email) {
    await db.query(
      `insert into suppression_list (organization_id, email, suppression_type, reason, source)
       select $1, $2, $3, $4, 'instantly-webhook'
       where not exists (select 1 from suppression_list where lower(email) = $2 and suppression_type = $3)`,
      [ct?.organization_id ?? null, email, suppress, suppress === "opt_out" ? "Asked not to be emailed" : "Email bounced"],
    );
  }
  // Every real reply: answer it within ~1 minute (once per lead) and ping the owner's phone.
  const isAuto = /auto_reply|out_of_office/i.test(rawType) || classification === "Out of Office";
  let auto: "scheduled" | "sent" | "failed" | "already answered" | "not auto-answered" | null = null;
  if ((type === "reply" && !isAuto) || type === "meeting_booked") {
    const { rows: [who] } = await db.query<{ company_name: string | null; full_name: string | null; first_name: string | null; phone: string | null }>(
      `select o.company_name, c.full_name, c.first_name, coalesce(c.phone, o.main_phone) phone from contacts c join organizations o on o.id = c.organization_id where c.id = $1`,
      [ct?.id ?? null]);
    const firstName = who?.first_name ?? s(e.firstName) ?? who?.full_name?.split(" ")[0] ?? null;
    const name = firstName ?? email.split("@")[0];
    const company = who?.company_name ?? s(e.companyName) ?? s(e.company_name) ?? email.split("@")[1] ?? "";
    const phone = who?.phone ?? s(e.phone);

    if (type === "reply") {
      const kind = pickAutoReply(rawType, classification, replyText);
      const replyEmailId = s(e.email_id), eaccount = s(e.email_account);
      if (!kind || !replyEmailId || !eaccount || !email) auto = "not auto-answered";
      else {
        const job: AutoReplyJob = { leadEmail: email, campaignId: s(e.campaign_id) ?? "", replyEmailId, eaccount,
          subject: s(e.reply_subject) ?? s(e.email_subject) ?? "Re: your building", firstName, kind };
        if (!(await claimAutoReply(db, job))) auto = "already answered";
        else {
          const run = async () => {
            const r = await sendAutoReply(db, job);
            if (!r.ok) await notifyOwner("Auto-reply failed - answer this one yourself", `${name} at ${company}${phone ? ` - ${phone}` : ""}. ${r.error}`, { priority: 5, tags: "warning" });
            return r.ok;
          };
          const delay = autoReplyDelayMs();
          if (delay === 0) auto = (await run()) ? "sent" : "failed";
          else { auto = "scheduled"; setTimeout(() => { void run(); }, delay); }
        }
      }
    }

    const hot = classification === "Positive" || type === "meeting_booked";
    const cold = classification === "Unsubscribe" || classification === "Not Interested";
    const snippet = (replyText ?? "").replace(/\s+/g, " ").trim().slice(0, 140);
    const autoNote = auto === "scheduled" || auto === "sent" ? "Auto-reply sent within ~1 min." : auto === "already answered" ? "Already auto-answered earlier." : cold ? "Not auto-answered (opted out)." : "Not auto-answered - reply yourself.";
    await notifyOwner(
      type === "meeting_booked" ? "Walkthrough booked!" : hot ? "Hot lead replied!" : cold ? "Reply: not interested" : "New reply from a lead",
      `${name} at ${company}${phone ? ` - ${phone}` : ""}${snippet ? `: "${snippet}"` : ""}. ${type === "meeting_booked" ? "" : autoNote}`.trim(),
      { priority: hot ? 5 : cold ? 3 : 4, tags: hot ? "fire" : cold ? "no_entry" : "email",
        click: process.env.APP_URL ? `${process.env.APP_URL.replace(/\/$/, "")}/replies` : undefined },
    );
  }
  if (ct && type === "reply") await db.query(`update organizations set pipeline_status = 'Replied', updated_at = now() where id = $1 and pipeline_status in ('New','Qualified','Approved','In Campaign')`, [ct.organization_id]);
  return { recorded: type, classification, matchedContact: !!ct, matchedCampaign: !!camp, suppressed: suppress, autoReply: auto };
}
