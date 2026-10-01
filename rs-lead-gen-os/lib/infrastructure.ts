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
