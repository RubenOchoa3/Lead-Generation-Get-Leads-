import { db, sql, tx } from "@/lib/db";
import { normalizeCompanyName } from "@/lib/dedupe";
import { emptySummary, ingestBatch } from "@/lib/ingest";
import { startRun, finishRun, failRun } from "@/lib/runs";
import { titleRank } from "@/lib/scoring";
import { REGISTRY_CITIES } from "@/lib/targets";
import { type RegistryRecord } from "@/lib/registryTypes";
import { casosConfigured, casosKeywordSearch, CASOS_SEARCH_TERMS } from "@/lib/providers/casos";
import { fetchFresnoNewBusinesses } from "@/lib/providers/fresnoBiz";
import { getleadConfigured, getleadSearch, mapGetleadRow } from "@/lib/providers/getlead";

const COMPETITOR = /\b(clean|cleaning|janitor|janitorial|custodial|maid)\b/i;
const HOLDING = /\b(holdings?|investments?|ventures)\b/i;

/** Pilot guardrail: Getlead lookups per pull unless the caller asks for fewer/more. */
export const DEFAULT_ENRICH_LIMIT = 40;

const cityOk = (city?: string | null) => !!city && REGISTRY_CITIES.some((c) => c.toLowerCase() === city.trim().toLowerCase());

/** Same business? Normalized names equal, or a 2+ word name prefixes the other ("Valley Dental" ~ "Valley Dental Group Inc"). */
export function sameBusiness(a: string, b: string) {
  const x = normalizeCompanyName(a), y = normalizeCompanyName(b);
  if (!x || !y) return false;
  if (x === y) return true;
  const [s, l] = x.length <= y.length ? [x, y] : [y, x];
  return s.includes(" ") && l.startsWith(s + " "); // a one-word name ("Valley") is too loose to trust
}

async function saveRecords(records: RegistryRecord[]) {
  let added = 0;
  for (const r of records) {
    const skip = COMPETITOR.test(r.name) ? "Cleaning company (competitor)" : HOLDING.test(r.name) ? "Holding/investment entity" : null;
    const { rows } = await db.query(
      `insert into registry_businesses (source, external_id, name, normalized_name, entity_type, business_type, status, filed_date,
          address, city, state, postal_code, agent_name, raw, enrichment_status, enrichment_note)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
       on conflict (source, external_id) do nothing returning id`,
      [r.source, r.externalId, r.name, normalizeCompanyName(r.name), r.entityType ?? null, r.businessType ?? null, r.status ?? null,
        r.filedDate ?? null, r.address ?? null, r.city ?? null, r.state ?? null, r.postalCode ?? null, r.agentName ?? null,
        JSON.stringify(r.raw ?? null), skip ? "skipped" : "pending", skip],
    );
    added += rows.length;
  }
  return added;
}

/** Step 1: pull newly registered businesses from every free source that is set up. */
export async function pullRegistry(daysBack = 3) {
  const end = new Date();
  const start = new Date(end.getTime() - daysBack * 864e5);
  const ymd = (d: Date) => d.toISOString().slice(0, 10);
  const report: Record<string, unknown> = {};
  let found = 0, added = 0;

  if (casosConfigured()) {
    const byId = new Map<string, RegistryRecord>();
    let noCity = 0, otherCity = 0;
    const errors: string[] = [];
    for (const term of CASOS_SEARCH_TERMS) {
      try {
        for (const r of await casosKeywordSearch(term, ymd(start), ymd(end))) {
          if (!r.city) { noCity++; continue; }
          if (!cityOk(r.city)) { otherCity++; continue; }
          byId.set(r.externalId, r);
        }
      } catch (e) { errors.push(String((e as Error).message ?? e)); if (errors.length >= 3) break; }
    }
    const recs = [...byId.values()];
    const n = await saveRecords(recs);
    found += recs.length; added += n;
    report.ca_sos = { central_valley: recs.length, new: n, outside_area: otherCity, missing_city: noCity, errors };
  } else {
    report.ca_sos = { skipped: "CASOS_API_KEY not set (free key from calicodev.sos.ca.gov)" };
  }

  try {
    const { records, headers } = await fetchFresnoNewBusinesses();
    const n = await saveRecords(records);
    found += records.length; added += n;
    report.fresno = { listed: records.length, new: n, columns: headers };
  } catch (e) {
    report.fresno = { error: String((e as Error).message ?? e) };
  }
  console.log(`[registry] pull ${ymd(start)}..${ymd(end)}: ${JSON.stringify(report)}`);
  return { found, added, report };
}

async function pool<T>(items: T[], size: number, fn: (t: T) => Promise<void>) {
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, async () => { while (i < items.length) await fn(items[i++]); }));
}

/**
 * Step 2: look each pending business up in Getlead by name. A match goes through the normal
 * dedupe → score → approval queue path; no match keeps it as a call / in-person lead.
 */
export async function enrichRegistry(limit = DEFAULT_ENRICH_LIMIT, runId?: string) {
  const sum = emptySummary();
  if (!getleadConfigured()) return { checked: 0, contactFound: 0, callOrVisit: 0, summary: sum };
  const pending = await sql<{ id: string; name: string }>(
    `select id, name from registry_businesses where enrichment_status = 'pending' order by filed_date desc nulls last, first_seen_at desc limit $1`, [limit]);
  let contactFound = 0, callOrVisit = 0;
  await pool(pending, 4, async (b) => {
    try {
      const page = await getleadSearch({ company_name: b.name, states: ["California"] }, 10);
      const prospects = page.contacts.map(mapGetleadRow)
        .filter((p): p is NonNullable<typeof p> => p !== null && sameBusiness(p.company.name, b.name));
      if (!prospects.length) {
        await db.query(`update registry_businesses set enrichment_status = 'call_or_visit', enrichment_note = 'No contact found in Getlead', enriched_at = now() where id = $1`, [b.id]);
        callOrVisit++;
        return;
      }
      const s = await tx((c) => ingestBatch(c, prospects.map((p) => ({ ...p, source: "CA registry → Getlead" })), { queueThreshold: 65, requireVerifiedEmail: true, runId }));
      for (const k of Object.keys(sum) as (keyof typeof sum)[]) if (k !== "errors") (sum[k] as number) += s[k] as number; else sum.errors.push(...s.errors);
      const best = prospects.filter((p) => p.contact).sort((x, y) => titleRank(x.contact!.title) - titleRank(y.contact!.title)
        || Number(y.contact!.emailStatus === "VALID") - Number(x.contact!.emailStatus === "VALID"))[0]?.contact;
      await db.query(
        `update registry_businesses r set enrichment_status = 'contact_found', enrichment_note = null, enriched_at = now(),
            organization_id = (select id from organizations where normalized_company_name = $2 order by first_found_at limit 1),
            contact_name = $3, contact_title = $4, contact_email = $5, contact_phone = $6
          where r.id = $1`,
        [b.id, normalizeCompanyName(prospects[0].company.name), best?.fullName ?? null, best?.title ?? null, best?.email ?? null, best?.phone ?? null],
      );
      contactFound++;
    } catch (e) {
      sum.errors.push(`${b.name}: ${String((e as Error).message ?? e).slice(0, 200)}`); // stays pending; retried next run
    }
  });
  console.log(`[registry] enrich: checked ${pending.length}, contact found ${contactFound}, call/visit ${callOrVisit}, queued ${sum.queued}, errors ${sum.errors.length}`);
  return { checked: pending.length, contactFound, callOrVisit, summary: sum };
}

/** Pull + enrich as one logged run (Automations page). */
export async function runRegistryWaterfall(trigger: string, opts: { daysBack?: number; enrichLimit?: number } = {}) {
  const runId = await startRun(db, "registry_waterfall", trigger, opts);
  try {
    const pulled = await pullRegistry(opts.daysBack ?? 3);
    const enriched = await enrichRegistry(opts.enrichLimit ?? DEFAULT_ENRICH_LIMIT, runId);
    const s = enriched.summary;
    s.received = pulled.found;
    await finishRun(db, runId, s, { matches: pulled.found });
    return { runId, pulled, enriched: { checked: enriched.checked, contactFound: enriched.contactFound, callOrVisit: enriched.callOrVisit, queued: s.queued, errors: s.errors.slice(0, 10) } };
  } catch (e) {
    await failRun(db, runId, String((e as Error).message ?? e));
    throw e;
  }
}
