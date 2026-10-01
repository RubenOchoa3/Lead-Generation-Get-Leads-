import { sql } from "@/lib/db";

export const dynamic = "force-dynamic";

function csv(v: unknown) {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const ids = url.searchParams.get("ids")?.split(",").filter(Boolean) ?? [];
  const rows = await sql(
    `select o.company_name, o.business_type, o.city, o.county, o.website, c.full_name, c.title, c.email, c.email_status, c.phone, c.linkedin_url,
            o.source, o.lead_score, o.score_band, coalesce(q.status, '') approval_status, o.pipeline_status, o.first_found_at
       from organizations o
       left join contacts c on c.organization_id = o.id and c.is_primary
       left join approval_queue q on q.organization_id = o.id
      where ($1::uuid[] is null or o.id = any($1::uuid[]))
      order by o.lead_score desc limit 10000`,
    [ids.length ? ids : null],
  );
  const header = Object.keys(rows[0] ?? { company_name: "" });
  const body = [header.join(","), ...rows.map((r) => header.map((h) => csv((r as Record<string, unknown>)[h])).join(","))].join("\n");
  return new Response(body, { headers: { "content-type": "text/csv", "content-disposition": `attachment; filename="rs-leads-${new Date().toISOString().slice(0, 10)}.csv"` } });
}
