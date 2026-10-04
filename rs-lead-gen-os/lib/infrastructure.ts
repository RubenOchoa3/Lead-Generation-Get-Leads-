import type { Db } from "./db";
import { ALWAYS_SUPPRESSED_DOMAINS } from "./suppression";

type Rec = Record<string, any>;

function recordOk(records: Rec[] | undefined, pred: (r: Rec) => boolean) {
  if (!records) return null;
  const r = records.find(pred);
  return r ? r.status === "propagated" : false;
}

/** Upsert an InboxKit snapshot. Field names are InboxKit's list_domains / list_mailboxes response fields. */
export async function upsertInfrastructure(db: Db, domains: Rec[], mailboxes: Rec[]) {
  let d = 0, m = 0;
  for (const x of domains) {
    const name = String(x.name || x.domain || "").toLowerCase();
    if (!name) continue;
    const recs: Rec[] | undefined = x.dns?.records;
    const spf = recordOk(recs, (r) => r.type === "TXT" && String(r.value).startsWith("v=spf1"));
    const dkim = recordOk(recs, (r) => r.type === "TXT" && String(r.host).includes("_domainkey"));
    const dmarc = recordOk(recs, (r) => r.type === "TXT" && String(r.host).startsWith("_dmarc"));
    const dnsStatus = x.dns_propagation_status ?? null;
    const health = x.status !== "active" ? "Issue" : dnsStatus === "propagated" && spf && dkim && dmarc ? "Healthy" : "Pending";
    await db.query(
      `insert into domains (domain, provider, external_id, status, dns_status, spf_ok, dkim_ok, dmarc_ok, mailbox_count, health, is_primary_business_domain, created_on_provider, last_sync_at)
       values ($1,'InboxKit',$2,$3,$4,$5,$6,$7,$8,$9,$10,$11, now())
       on conflict (domain) do update set external_id = excluded.external_id, status = excluded.status, dns_status = excluded.dns_status,
         spf_ok = excluded.spf_ok, dkim_ok = excluded.dkim_ok, dmarc_ok = excluded.dmarc_ok, mailbox_count = excluded.mailbox_count,
         health = excluded.health, is_primary_business_domain = excluded.is_primary_business_domain,
         created_on_provider = excluded.created_on_provider, last_sync_at = now()`,
      [name, x.uid ?? null, x.status ?? null, dnsStatus, spf, dkim, dmarc, x.assigned_mailboxes ?? null, health,
        ALWAYS_SUPPRESSED_DOMAINS.includes(name), x.createdAt ?? null],
    );
    d++;
  }
  for (const x of mailboxes) {
    const domain = String(x.domain_name || x.domain || "").toLowerCase();
    const address = String(x.email || (x.username && domain ? `${x.username}@${domain}` : "")).toLowerCase();
    if (!address) continue;
    const sequencers: Rec[] = Array.isArray(x.sequencers) ? x.sequencers : [];
    await db.query(
      `insert into mailboxes (address, domain, provider, platform, external_id, status, warmup_status, health, sequencer, last_sync_at)
       values ($1,$2,'InboxKit',$3,$4,$5,$6,$7,$8, now())
       on conflict (address) do update set domain = excluded.domain, platform = excluded.platform, external_id = excluded.external_id,
         status = excluded.status, warmup_status = coalesce(excluded.warmup_status, mailboxes.warmup_status),
         health = coalesce(excluded.health, mailboxes.health), sequencer = excluded.sequencer, last_sync_at = now()`,
      [address, domain, x.platform ?? null, x.uid ?? null, x.status ?? null, x.warmup_status ?? null, x.health ?? null,
        sequencers.length ? sequencers.map((s) => s.platform || s.name).join(", ") : null],
    );
    m++;
  }
  return { domains: d, mailboxes: m };
}

/** Instantly account status / warmup codes → labels shown on the Mailboxes page. */
const ACCOUNT_STATUS: Record<number, string> = { 1: "active", 2: "paused", [-1]: "connection error", [-2]: "soft bounce error", [-3]: "sending error" };
const WARMUP_STATUS: Record<number, string> = { 0: "Not warming", 1: "Warming", [-1]: "Warmup banned", [-2]: "Warmup spam folder", [-3]: "Warmup suspended" };

type SenderAccount = { email: string; status: number; warmup_status: number; daily_limit?: number; stat_warmup_score?: number };
type SenderCampaign = { name: string; email_list?: string[] };

/**
 * Refresh mailboxes from the sender (Instantly). The protected primary business domain is never
 * listed as a sending mailbox. Domains get a row with their mailbox count; DNS fields are left
 * untouched (they come only from an InboxKit snapshot).
 */
export async function syncMailboxesFromSender(db: Db, accounts: SenderAccount[], campaigns: SenderCampaign[]) {
  let m = 0;
  const perDomain = new Map<string, number>();
  for (const a of accounts) {
    const address = a.email.toLowerCase();
    const domain = address.split("@")[1] ?? "";
    if (!domain || ALWAYS_SUPPRESSED_DOMAINS.includes(domain)) continue;
    const inCampaigns = campaigns.filter((c) => (c.email_list ?? []).map((e) => e.toLowerCase()).includes(address)).map((c) => c.name);
    const score = a.stat_warmup_score;
    const health = a.status !== 1 ? "Issue" : score == null || a.warmup_status !== 1 ? null : score >= 80 ? "Healthy" : "Warming up";
    const warmup = WARMUP_STATUS[a.warmup_status] ?? String(a.warmup_status);
    await db.query(
      `insert into mailboxes (address, domain, provider, platform, status, warmup_status, health, daily_send_limit, sequencer, campaign, last_sync_at)
       values ($1,$2,'InboxKit','GOOGLE',$3,$4,$5,$6,'Instantly',$7, now())
       on conflict (address) do update set domain = excluded.domain, status = excluded.status, warmup_status = excluded.warmup_status,
         health = excluded.health, daily_send_limit = excluded.daily_send_limit, sequencer = 'Instantly', campaign = excluded.campaign, last_sync_at = now()`,
      [address, domain, ACCOUNT_STATUS[a.status] ?? String(a.status), score != null && a.warmup_status === 1 ? `${warmup} (score ${score})` : warmup,
        health, a.daily_limit ?? null, inCampaigns.join(", ") || null],
    );
    perDomain.set(domain, (perDomain.get(domain) ?? 0) + 1);
    m++;
  }
  for (const [domain, count] of perDomain) {
    await db.query(
      `insert into domains (domain, provider, status, mailbox_count, last_sync_at) values ($1, 'InboxKit', 'active', $2, now())
       on conflict (domain) do update set mailbox_count = excluded.mailbox_count, last_sync_at = now()`,
      [domain, count],
    );
  }
  return { mailboxes: m, domains: perDomain.size };
}
