import { sql } from "@/lib/db";

export const dynamic = "force-dynamic";

function csv(v: unknown) {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Call / in-person list (default) or any status: ?status=call_or_visit|contact_found|pending|skipped|all */
export async function GET(req: Request) {
  const status = new URL(req.url).searchParams.get("status") || "call_or_visit";
  const rows = await sql(
    `select name as business_name, business_type, entity_type, filed_date, address, city, postal_code, agent_name,
            contact_name, contact_title, contact_email, contact_phone, enrichment_status, source
       from registry_businesses
      where ($1 = 'all' or enrichment_status = $1)
      order by city, filed_date desc nulls last limit 10000`,
    [status],
  );
  const header = ["business_name", "business_type", "entity_type", "filed_date", "address", "city", "postal_code", "agent_name",
    "contact_name", "contact_title", "contact_email", "contact_phone", "enrichment_status", "source"];
  const body = [header.join(","), ...rows.map((r) => header.map((h) => csv((r as Record<string, unknown>)[h])).join(","))].join("\n");
  return new Response(body, { headers: { "content-type": "text/csv", "content-disposition": `attachment; filename="new-businesses-${status}-${new Date().toISOString().slice(0, 10)}.csv"` } });
}
