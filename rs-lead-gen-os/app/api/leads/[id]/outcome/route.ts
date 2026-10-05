import { NextResponse } from "next/server";
import { z } from "zod";
import { one, sql } from "@/lib/db";

export const dynamic = "force-dynamic";

const body = z.object({
  type: z.enum(["reply_yes", "meeting_booked", "closed_won", "closed_lost"]),
  revenue: z.number().min(0).max(10_000_000).optional(), // annual contract value for closed_won
});

/**
 * Lead-to-profit attribution: record what a lead turned into (YES reply, meeting, won with annual
 * value, lost) against the campaign that last emailed them, so revenue traces back to the campaign,
 * segment and copy that produced it.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let b: z.infer<typeof body>;
  try { b = body.parse(await req.json()); } catch (e) { return NextResponse.json({ error: String(e) }, { status: 400 }); }
  const lead = await one<{ contact_id: string | null; campaign_id: string | null }>(
    `select c.id contact_id,
            (select cc.campaign_id from campaign_contacts cc join contacts x on x.id = cc.contact_id
              where x.organization_id = o.id order by cc.added_at desc limit 1) campaign_id
       from organizations o left join contacts c on c.organization_id = o.id and c.is_primary
      where o.id = $1`, [id]);
  if (!lead) return NextResponse.json({ error: "Lead not found" }, { status: 404 });
  const eventType = b.type === "reply_yes" ? "reply" : b.type;
  await sql(
    `insert into outreach_events (organization_id, contact_id, campaign_id, event_type, reply_classification, revenue, provider)
     values ($1, $2, $3, $4, $5, $6, 'manual')`,
    [id, lead.contact_id, lead.campaign_id, eventType, b.type === "reply_yes" ? "Positive" : null, b.type === "closed_won" ? b.revenue ?? 0 : 0],
  );
  const pipeline = { reply_yes: "Replied", meeting_booked: "Meeting", closed_won: "Customer", closed_lost: "Closed Lost" }[b.type];
  await sql(`update organizations set pipeline_status = $2, updated_at = now() where id = $1`, [id, pipeline]);
  return NextResponse.json({ ok: true, attributedTo: lead.campaign_id });
}
