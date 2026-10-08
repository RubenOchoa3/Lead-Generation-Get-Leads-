import type { Db } from "./db";
import { outreachBlockers } from "./suppression";
import { INSTANTLY_STATUS, type InstantlyLead, type SenderClient } from "./providers/instantly";

export type PushResult = {
  campaign: { externalId: string; name: string; status: string };
  dryRun: boolean;
  ready: { contactId: string; company: string; email: string }[];
  blocked: { contactId: string; company: string; email: string | null; reasons: string[] }[];
  added: number;
  skippedBySender: number;
};

/**
 * Local-business focus: companies with 1,000+ employees (national chains, big health systems,
 * public agencies of that size) buy cleaning through corporate contracts, so a local manager
 * can't say yes. Their LinkedIn size band starts at 1001 or more.
 */
export const LOCAL_MAX_EMPLOYEES = 1000;
export function isLargeCompany(employeeRange?: string | null) {
  const min = parseInt((employeeRange || "").replace(/,/g, "").replace(/[^0-9 ]/g, " ").trim().split(/\s+/)[0] || "0", 10);
  return min > LOCAL_MAX_EMPLOYEES;
}

type Candidate = {
  contact_id: string; organization_id: string; email: string | null; first_name: string | null; last_name: string | null;
  full_name: string | null; company_name: string; website: string | null; phone: string | null; main_phone: string | null;
  personalization_note: string | null;
  employee_range: string | null;
};

/**
 * Add owner-approved contacts to a sender campaign. Every contact passes outreachBlockers() first
 * (approved, VALID email, not suppressed, no prior bounce/unsubscribe). Nobody is ever added to
 * the same campaign twice, and nobody is added to another campaign within `cooldownDays` (default
 * 45) of their last one — one email per person per 30–60 day cycle. `limit` takes the best-scored N.
 * Never launches the campaign.
 */
export const DEFAULT_COOLDOWN_DAYS = 45;

export async function pushApprovedToCampaign(db: Db, sender: SenderClient, externalCampaignId: string, opts: { dryRun?: boolean; limit?: number; cooldownDays?: number; contactIds?: string[]; allowLarge?: boolean } = {}): Promise<PushResult> {
  const dryRun = opts.dryRun ?? true;
  const remote = (await sender.listCampaigns()).find((c) => c.id === externalCampaignId);
  if (!remote) throw new Error("That campaign was not found in Instantly.");
  const status = INSTANTLY_STATUS[remote.status] ?? String(remote.status);

  const { rows: candidates } = await db.query<Candidate>(
    `select c.id contact_id, c.organization_id, c.email, c.first_name, c.last_name, c.full_name, o.company_name, o.website, c.phone, o.main_phone, o.employee_range,
            (select r.personalization_note from research r where r.organization_id = o.id order by r.researched_at desc limit 1) personalization_note
       from approval_queue q
       join organizations o on o.id = q.organization_id
       join contacts c on c.id = q.contact_id
      where q.status = 'Approved'
        and not exists (
          select 1 from campaign_contacts cc join campaigns k on k.id = cc.campaign_id
           where cc.contact_id = c.id and k.provider = 'Instantly'
             and (k.external_id = $1 or cc.added_at > now() - make_interval(days => $2)))
        and ($3::uuid[] is null or c.id = any($3::uuid[]))
      order by o.lead_score desc nulls last`,
    [externalCampaignId, opts.cooldownDays ?? DEFAULT_COOLDOWN_DAYS, opts.contactIds ?? null],
  );

  const ready: PushResult["ready"] = [];
  const blocked: PushResult["blocked"] = [];
  const leads: InstantlyLead[] = [];
  for (const c of candidates) {
    if (opts.limit && ready.length >= opts.limit) break;
    const reasons = await outreachBlockers(db, c.contact_id);
    if (!opts.allowLarge && isLargeCompany(c.employee_range)) reasons.push(`national/large company (${c.employee_range}) — buys cleaning through corporate`);
    if (reasons.length) { blocked.push({ contactId: c.contact_id, company: c.company_name, email: c.email, reasons }); continue; }
    const [first, ...rest] = (c.full_name || "").split(" ");
    const lead: InstantlyLead = {
      email: c.email!,
      first_name: c.first_name || first || undefined,
      last_name: c.last_name || rest.join(" ") || undefined,
      company_name: c.company_name,
      website: c.website || undefined,
      phone: c.phone || c.main_phone || undefined,
    };
    // Only real research fills the campaign's {{rs_opener}} slot; otherwise Instantly uses the template fallback.
    if (c.personalization_note) lead.custom_variables = { rs_opener: c.personalization_note };
    leads.push(lead);
    ready.push({ contactId: c.contact_id, company: c.company_name, email: c.email! });
  }

  const result: PushResult = { campaign: { externalId: remote.id, name: remote.name, status }, dryRun, ready, blocked, added: 0, skippedBySender: 0 };
  if (dryRun || leads.length === 0) return result;

  const sent = await sender.addLeads(remote.id, leads);
  result.added = sent.uploaded;
  result.skippedBySender = sent.skipped;

  const { rows: [camp] } = await db.query<{ id: string }>(
    `insert into campaigns (name, provider, external_id, status) values ($1, 'Instantly', $2, $3)
     on conflict (provider, external_id) where external_id is not null do update set name = excluded.name, status = excluded.status, updated_at = now()
     returning id`,
    [remote.name, remote.id, status],
  );
  for (const r of ready) {
    await db.query(`insert into campaign_contacts (campaign_id, contact_id) values ($1, $2) on conflict do nothing`, [camp.id, r.contactId]);
    await db.query(`update organizations set pipeline_status = 'In Campaign', updated_at = now() where id = (select organization_id from contacts where id = $1)`, [r.contactId]);
  }
  return result;
}
