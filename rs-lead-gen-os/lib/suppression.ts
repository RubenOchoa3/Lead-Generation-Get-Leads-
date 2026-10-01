import type { Db } from "./db";
import { normalizeDomain, normalizeEmail } from "./dedupe";

export type SuppressionHit = { suppressed: true; type: string; reason: string | null } | { suppressed: false };

/** Domains that must never receive cold outreach regardless of DB state. */
export const ALWAYS_SUPPRESSED_DOMAINS = ["rscentralvalleycleaning.com"];

export async function checkSuppression(db: Db, email?: string | null, organizationId?: string | null): Promise<SuppressionHit> {
  const e = normalizeEmail(email);
  const domain = e.includes("@") ? normalizeDomain(e.split("@")[1]) : "";
  if (domain && ALWAYS_SUPPRESSED_DOMAINS.includes(domain)) return { suppressed: true, type: "primary_domain", reason: "R&S business domain" };
  const { rows } = await db.query<{ suppression_type: string; reason: string | null }>(
    `select suppression_type, reason from suppression_list
      where ($1 <> '' and lower(email) = $1)
         or ($2 <> '' and lower(domain) = $2)
         or ($3::uuid is not null and organization_id = $3::uuid)
      limit 1`,
    [e, domain, organizationId ?? null],
  );
  if (rows[0]) return { suppressed: true, type: rows[0].suppression_type, reason: rows[0].reason };
  return { suppressed: false };
}

/**
 * Final gate before any contact can be added to a campaign.
 * Returns the list of reasons a contact is blocked (empty = allowed).
 */
export async function outreachBlockers(db: Db, contactId: string): Promise<string[]> {
  const { rows } = await db.query<{ email: string | null; email_status: string | null; organization_id: string; queue_status: string | null }>(
    `select c.email, c.email_status, c.organization_id, q.status as queue_status
       from contacts c left join approval_queue q on q.organization_id = c.organization_id
      where c.id = $1`,
    [contactId],
  );
  const c = rows[0];
  if (!c) return ["contact not found"];
  const reasons: string[] = [];
  if (!c.email) reasons.push("no email");
  if ((c.email_status || "").toUpperCase() !== "VALID") reasons.push(`email not verified (${c.email_status || "unknown"})`);
  if (c.queue_status !== "Approved") reasons.push(`not approved (${c.queue_status || "not in queue"})`);
  const hit = await checkSuppression(db, c.email, c.organization_id);
  if (hit.suppressed) reasons.push(`suppressed: ${hit.type}`);
  const bounced = await db.query(
    `select 1 from outreach_events where contact_id = $1 and event_type in ('bounce','complaint','unsubscribe') limit 1`,
    [contactId],
  );
  if (bounced.rows.length) reasons.push("prior bounce/complaint/unsubscribe");
  return reasons;
}
