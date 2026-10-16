import { sql } from "@/lib/db";
import { DbError } from "@/components/ui";
import LeadsTable from "@/components/LeadsTable";

export const dynamic = "force-dynamic";
const PAGE = 50;
const SORTS: Record<string, string> = {
  score: "o.lead_score desc, o.created_at desc", newest: "o.created_at desc", company: "o.company_name asc", city: "o.city asc nulls last",
};

type SP = Record<string, string | undefined>;

export default async function LeadsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const where: string[] = ["true"]; const p: unknown[] = [];
  const add = (cond: string, v: unknown) => { p.push(v); where.push(cond.replace(/\?/g, `$${p.length}`)); };
  if (sp.q) add(`(o.company_name ilike ? or o.city ilike ? or c.full_name ilike ? or c.email ilike ? or o.domain ilike ?)`, `%${sp.q}%`);
  if (sp.min) add(`o.lead_score >= ?`, Number(sp.min));
  if (sp.type) add(`o.business_type = ?`, sp.type);
  if (sp.city) add(`o.city = ?`, sp.city);
  if (sp.approval) add(`coalesce(q.status, 'Not queued') = ?`, sp.approval);
  if (sp.band) add(`o.score_band = ?`, sp.band);
  if (sp.verified === "1") where.push(`c.email_status = 'VALID'`);
  if (sp.found === "today") where.push(`(o.created_at at time zone 'America/Los_Angeles')::date = (now() at time zone 'America/Los_Angeles')::date`);
  const page = Math.max(1, Number(sp.page || 1));
  const order = SORTS[sp.sort || "score"] ?? SORTS.score;

  try {
    const base = `from organizations o
      left join contacts c on c.organization_id = o.id and c.is_primary
      left join approval_queue q on q.organization_id = o.id
      left join lateral (select 1 as has from research r where r.organization_id = o.id limit 1) r on true
      left join lateral (select max(occurred_at) last_out, bool_or(event_type = 'sent') sent from outreach_events e where e.organization_id = o.id) e on true
      where ${where.join(" and ")}`;
    const [rows, [{ n }], facets] = await Promise.all([
      sql(`select o.id, o.company_name, o.business_type, o.city, o.county, o.website, o.domain, o.source, o.lead_score, o.score_band,
             o.pipeline_status, o.first_found_at, o.updated_at, c.full_name, c.title, c.email, c.email_status, c.phone, c.linkedin_url,
             q.status approval_status, (r.has is not null) researched, e.last_out, e.sent
           ${base} order by ${order} limit ${PAGE} offset ${(page - 1) * PAGE}`, p),
      sql<{ n: number }>(`select count(*)::int n ${base}`, p),
      sql<{ kind: string; v: string; n: number }>(`
        select 'type' kind, business_type v, count(*)::int n from organizations where business_type is not null group by 2
        union all select 'city', city, count(*)::int from organizations where city is not null group by 2
        order by 1, 3 desc`),
    ]);
    return (
      <>
        <div className="page-head">
          <div><h1>Leads</h1><p className="muted">{n.toLocaleString()} companies{sp.q ? ` matching “${sp.q}”` : ""} · click a row to inspect without leaving the list</p></div>
          <div className="actions"><a className="btn" href="/api/export">Export all CSV</a><a className="btn primary" href="/find-leads">+ Find Leads</a></div>
        </div>
        <LeadsTable
          rows={rows as never}
          total={n}
          page={page}
          pageSize={PAGE}
          params={sp as Record<string, string>}
          types={facets.filter((f) => f.kind === "type").map((f) => f.v)}
          cities={facets.filter((f) => f.kind === "city").slice(0, 60).map((f) => f.v)}
        />
      </>
    );
  } catch (e) {
    return <><div className="page-head"><h1>Leads</h1></div><DbError error={e} /></>;
  }
}
