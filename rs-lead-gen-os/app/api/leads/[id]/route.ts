import { NextResponse } from "next/server";
import { one, sql } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const org = await one("select * from organizations where id = $1", [id]);
  if (!org) return NextResponse.json({ error: "Lead not found" }, { status: 404 });
  const [contacts, research, queue, discovery, outreach, suppression] = await Promise.all([
    sql("select * from contacts where organization_id = $1 order by is_primary desc, title_priority nulls last", [id]),
    sql("select * from research where organization_id = $1 order by researched_at desc limit 3", [id]),
    one("select * from approval_queue where organization_id = $1", [id]),
    sql("select found_at, source, was_duplicate from discovery_events where organization_id = $1 order by found_at", [id]),
    sql("select event_type, occurred_at, campaign_id, reply_classification, reply_preview from outreach_events where organization_id = $1 order by occurred_at", [id]),
    sql("select suppression_type, reason, created_at from suppression_list where organization_id = $1 or (domain is not null and lower(domain) = lower($2))", [id, (org as { domain?: string }).domain ?? ""]),
  ]);
  return NextResponse.json({ org, contacts, research, queue, discovery, outreach, suppression });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const b = await req.json();
  const allowed = ["company_name", "business_type", "city", "county", "website", "main_phone", "notes"] as const;
  const sets: string[] = []; const vals: unknown[] = [id];
  for (const k of allowed) if (k in b) { vals.push(b[k]); sets.push(`${k} = $${vals.length}`); }
  if (!sets.length) return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  await sql(`update organizations set ${sets.join(", ")}, updated_at = now() where id = $1`, vals);
  return NextResponse.json({ ok: true });
}
