import type { Db } from "./db";
import type { ProspectInput } from "./types";
import { classifyBusiness, type BusinessType } from "./classify";
import { normalizeAddress, normalizeCompanyName, normalizeDomain, normalizeEmail, normalizeLinkedin, normalizePhone, FREE_MAIL } from "./dedupe";
import { scoreBand, scoreProspect, titleRank, isEligibleDecisionMaker } from "./scoring";
import { checkSuppression } from "./suppression";

export type IngestOptions = {
  queueThreshold: number;           // min score to enter Approval Queue
  requireVerifiedEmail: boolean;    // only queue contacts with VALID email
  runId?: string | null;
  query?: unknown;
};

export type IngestSummary = {
  received: number;
  businesses_found: number;
  unique_businesses: number;
  duplicates_removed: number;
  new_contacts: number;
  decision_makers: number;
  verified_emails: number;
  phones: number;
  linkedin_profiles: number;
  priority: number;
  good: number;
  review: number;
  hold: number;
  queued: number;
  suppressed: number;
  skipped_invalid: number;
  errors: string[];
};

export const emptySummary = (): IngestSummary => ({
  received: 0, businesses_found: 0, unique_businesses: 0, duplicates_removed: 0, new_contacts: 0, decision_makers: 0,
  verified_emails: 0, phones: 0, linkedin_profiles: 0, priority: 0, good: 0, review: 0, hold: 0, queued: 0,
  suppressed: 0, skipped_invalid: 0, errors: [],
});

/** Find an existing organization by the spec's dedupe order: provider id → domain → name+address → phone. */
export async function findOrganization(db: Db, p: ProspectInput): Promise<string | null> {
  const c = p.company;
  const domain = normalizeDomain(c.domain || c.website);
  const usableDomain = domain && !FREE_MAIL.has(domain) ? domain : "";
  const nameNorm = normalizeCompanyName(c.name);
  const addrNorm = normalizeAddress(c.street, c.postalCode);
  const phone = normalizePhone(c.phone);
  const { rows } = await db.query<{ id: string; rank: number }>(
    `select id, case
        when $1::text is not null and source = $2 and external_id = $1 then 1
        when $3 <> '' and lower(domain) = $3 then 2
        when $5 <> '' and normalized_company_name = $4 and normalized_address = $5 then 3
        when $6 <> '' and regexp_replace(coalesce(main_phone,''), '\\D', '', 'g') in ($6, '1' || $6) and normalized_company_name = $4 then 4
        else 9 end as rank
      from organizations
      where ($1::text is not null and source = $2 and external_id = $1)
         or ($3 <> '' and lower(domain) = $3)
         or ($5 <> '' and normalized_company_name = $4 and normalized_address = $5)
         or ($6 <> '' and normalized_company_name = $4 and regexp_replace(coalesce(main_phone,''), '\\D', '', 'g') in ($6, '1' || $6))
      order by rank limit 1`,
    [c.externalId ?? null, p.source, usableDomain, nameNorm, addrNorm, phone],
  );
  return rows[0]?.id ?? null;
}

async function findContact(db: Db, orgId: string, p: ProspectInput): Promise<string | null> {
  const ct = p.contact;
  if (!ct) return null;
  const email = normalizeEmail(ct.email);
  const li = normalizeLinkedin(ct.linkedinUrl);
  const name = (ct.fullName || "").trim().toLowerCase();
  const { rows } = await db.query<{ id: string }>(
    `select id from contacts
      where ($1 <> '' and lower(email) = $1)
         or ($2::text is not null and source = $3 and external_id = $2)
         or ($4 <> '' and lower(linkedin_url) = $4)
         or ($6 <> '' and organization_id = $5 and lower(full_name) = $6)
      limit 1`,
    [email, ct.externalId ?? null, p.source, li, orgId, name],
  );
  return rows[0]?.id ?? null;
}

/** Recompute score from what is stored (single source of truth) and pick the primary contact. */
export async function rescoreOrganization(db: Db, orgId: string) {
  const { rows: orgs } = await db.query<Record<string, any>>(`select * from organizations where id = $1`, [orgId]);
  const o = orgs[0];
  if (!o) return null;
  const { rows: contacts } = await db.query<Record<string, any>>(`select * from contacts where organization_id = $1`, [orgId]);
  // Primary = verified + best title rank, then any best title rank.
  const ranked = contacts
    .map((c) => ({ c, rank: titleRank(c.title), verified: (c.email_status || "").toUpperCase() === "VALID" }))
    .sort((a, b) => Number(b.verified) - Number(a.verified) || a.rank - b.rank);
  const primary = ranked[0]?.c ?? null;
  if (primary) {
    await db.query(`update contacts set is_primary = (id = $2) where organization_id = $1`, [orgId, primary.id]);
  }
  const input: ProspectInput = {
    source: o.source,
    company: {
      name: o.company_name, domain: o.domain, website: o.website, phone: o.main_phone, linkedinUrl: o.linkedin_url,
      industry: o.industry, naicsCodes: o.naics_code ? String(o.naics_code).split(";") : [], employeeRange: o.employee_range,
      street: o.address, city: o.city, state: o.state, postalCode: o.postal_code,
      locationCount: o.score_breakdown?.inputs?.locationCount ?? null,
      foundedYear: o.score_breakdown?.inputs?.foundedYear ?? null,
      websiteActive: o.score_breakdown?.inputs?.websiteActive ?? null,
    },
    contact: primary
      ? { fullName: primary.full_name, title: primary.title, email: primary.email, emailStatus: primary.email_status,
          emailVerifiedAt: primary.email_verified_at ? new Date(primary.email_verified_at).toISOString() : null,
          phone: primary.phone, linkedinUrl: primary.linkedin_url }
      : null,
  };
  const score = scoreProspect(input, (o.business_type || "Other / Unclassified") as BusinessType);
  const band = scoreBand(score.total);
  await db.query(
    `update organizations set lead_score = $2, score_band = $3,
        score_breakdown = jsonb_build_object('fit',$4::int,'contact',$5::int,'dataQuality',$6::int,'opportunity',$7::int,'reasons',$8::jsonb,'inputs',coalesce(score_breakdown->'inputs','{}'::jsonb)),
        updated_at = now()
      where id = $1`,
    [orgId, score.total, band, score.fit, score.contact, score.dataQuality, score.opportunity, JSON.stringify(score.reasons)],
  );
  return { score, band, primary };
}

export async function ingestProspect(db: Db, p: ProspectInput, opts: IngestOptions, sum: IngestSummary, touched: Set<string> = new Set()) {
  sum.received++;
  if (!p.company?.name) { sum.skipped_invalid++; return; }
  const c = p.company;
  const businessType = classifyBusiness(c.naicsCodes, c.industry);
  const domain = normalizeDomain(c.domain || c.website);
  const inputs = { locationCount: c.locationCount ?? null, foundedYear: c.foundedYear ?? null, websiteActive: c.websiteActive ?? null };

  let orgId = await findOrganization(db, p);
  const isNewOrg = !orgId;
  if (isNewOrg) {
    const { rows } = await db.query<{ id: string }>(
      `insert into organizations (company_name, normalized_company_name, business_type, industry, naics_code, employee_range,
          address, normalized_address, city, state, postal_code, website, domain, linkedin_url, main_phone, source, external_id,
          score_breakdown, last_enriched_at)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17, jsonb_build_object('inputs',$18::jsonb), now())
       returning id`,
      [c.name, normalizeCompanyName(c.name), businessType, c.industry ?? null, (c.naicsCodes || []).join(";") || null,
        c.employeeRange ?? null, c.street ?? null, normalizeAddress(c.street, c.postalCode) || null, c.city ?? null,
        stateCode(c.state), c.postalCode ?? null, c.website ?? null, domain && !FREE_MAIL.has(domain) ? domain : null,
        c.linkedinUrl ?? null, c.phone ?? null, p.source, c.externalId ?? null, JSON.stringify(inputs)],
    );
    orgId = rows[0].id;
    sum.unique_businesses++;
  } else {
    sum.duplicates_removed++;
    // Fill blanks only — never overwrite owner-edited data.
    await db.query(
      `update organizations set
          website = coalesce(website, $2), main_phone = coalesce(main_phone, $3), address = coalesce(address, $4),
          postal_code = coalesce(postal_code, $5), linkedin_url = coalesce(linkedin_url, $6), last_enriched_at = now(), updated_at = now()
        where id = $1`,
      [orgId, c.website ?? null, c.phone ?? null, c.street ?? null, c.postalCode ?? null, c.linkedinUrl ?? null],
    );
  }
  sum.businesses_found++;

  await db.query(
    `insert into discovery_events (organization_id, run_id, source, query, was_duplicate) values ($1,$2,$3,$4,$5)`,
    [orgId, opts.runId ?? null, p.source, opts.query ? JSON.stringify(opts.query) : null, !isNewOrg],
  );

  // Contact
  const ct = p.contact;
  if (ct && (ct.email || ct.fullName)) {
    const existing = await findContact(db, orgId!, p);
    const email = normalizeEmail(ct.email) || null;
    const status = (ct.emailStatus || "").toUpperCase() || null;
    if (!existing) {
      await db.query(
        `insert into contacts (organization_id, first_name, last_name, full_name, title, title_priority, seniority, email, email_status,
            email_verified_at, phone, linkedin_url, source, external_id)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
        [orgId, ct.firstName ?? null, ct.lastName ?? null, ct.fullName ?? null, ct.title ?? null,
          titleRank(ct.title) === 999 ? null : titleRank(ct.title), ct.seniority ?? null, email, status, ct.emailVerifiedAt ?? null,
          ct.phone ?? null, ct.linkedinUrl ?? null, p.source, ct.externalId ?? null],
      );
      sum.new_contacts++;
    } else {
      await db.query(
        `update contacts set title = coalesce($2, title), email = coalesce(email, $3),
            email_status = case when $4::text = 'VALID' then 'VALID' else coalesce(email_status, $4) end,
            email_verified_at = greatest(email_verified_at, $5::timestamptz), phone = coalesce(phone, $6),
            linkedin_url = coalesce(linkedin_url, $7), updated_at = now()
          where id = $1`,
        [existing, ct.title ?? null, email, status, ct.emailVerifiedAt ?? null, ct.phone ?? null, ct.linkedinUrl ?? null],
      );
    }
    if (isEligibleDecisionMaker(ct.title)) sum.decision_makers++;
    if (status === "VALID" && email) sum.verified_emails++;
    if (ct.phone) sum.phones++;
    if (ct.linkedinUrl) sum.linkedin_profiles++;
  }

  // Competitors are suppressed, never queued.
  if (businessType === "Janitorial competitor") {
    await db.query(
      `insert into suppression_list (organization_id, domain, suppression_type, reason, source)
       select $1, $2, 'competitor', 'Janitorial / cleaning company', 'auto-classifier'
       where not exists (select 1 from suppression_list where organization_id = $1 and suppression_type = 'competitor')`,
      [orgId, domain || null],
    );
    await db.query(`update organizations set pipeline_status = 'Suppressed' where id = $1`, [orgId]);
    sum.suppressed++;
  }

  const result = await rescoreOrganization(db, orgId!);
  if (!result) return;
  const { score, band, primary } = result;
  void band;
  touched.add(orgId!);

  // Queue rules: threshold + eligible decision maker + verified email (if required) + not suppressed + not already decided.
  if (businessType === "Janitorial competitor") return;
  if (score.total < opts.queueThreshold) return;
  if (!primary || !isEligibleDecisionMaker(primary.title)) return;
  const verified = (primary.email_status || "").toUpperCase() === "VALID" && primary.email;
  if (opts.requireVerifiedEmail && !verified) return;
  const sup = await checkSuppression(db, primary.email, orgId);
  if (sup.suppressed) { sum.suppressed++; return; }

  const why = [`Score ${score.total} (${band})`, primary.title ? `${primary.title}` : null, verified ? "verified email" : null, businessType]
    .filter(Boolean).join(" · ");
  const q = await db.query(
    `insert into approval_queue (organization_id, contact_id, status, why_selected)
     values ($1, $2, 'Needs Review', $3)
     on conflict (organization_id) do update set contact_id = excluded.contact_id, why_selected = excluded.why_selected
       where approval_queue.status = 'Needs Review'
     returning (xmax = 0) as inserted`,
    [orgId, primary.id, why],
  );
  if (q.rows[0] && (q.rows[0] as { inserted: boolean }).inserted) {
    sum.queued++;
    await db.query(`update organizations set pipeline_status = 'Qualified' where id = $1 and pipeline_status = 'New'`, [orgId]);
  }
}

export async function ingestBatch(db: Db, prospects: ProspectInput[], opts: IngestOptions): Promise<IngestSummary> {
  const sum = emptySummary();
  const touched = new Set<string>();
  for (const p of prospects) {
    try {
      await db.query("savepoint ingest_one");
      await ingestProspect(db, p, opts, sum, touched);
      await db.query("release savepoint ingest_one");
    } catch (e) {
      await db.query("rollback to savepoint ingest_one");
      sum.errors.push(`${p.company?.name ?? "unknown"}: ${String((e as Error).message ?? e).slice(0, 200)}`);
    }
  }
  // Score bands are counted once per unique business touched by this batch (after all contacts merged).
  if (touched.size) {
    const { rows } = await db.query<{ score_band: string; n: number }>(
      `select score_band, count(*)::int n from organizations where id = any($1::uuid[]) group by 1`, [`{${[...touched].join(",")}}`]);
    for (const r of rows) {
      if (r.score_band === "Priority") sum.priority += r.n; else if (r.score_band === "Good") sum.good += r.n;
      else if (r.score_band === "Review") sum.review += r.n; else sum.hold += r.n;
    }
  }
  return sum;
}

function stateCode(state?: string | null) {
  if (!state) return null;
  return /^california$/i.test(state.trim()) ? "CA" : state.trim().length === 2 ? state.trim().toUpperCase() : state.trim();
}
