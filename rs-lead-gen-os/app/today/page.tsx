import { one, sql } from "@/lib/db";
import { DbError, Kpi, Panel } from "@/components/ui";
import TodayBatch, { type BatchLead } from "@/components/TodayBatch";
import { getOutreachSettings, pacificToday, poolCounts, rampStep } from "@/lib/dailyBatch";
import { getCampaignDetail, instantlyConfigured } from "@/lib/providers/instantly";
import { htmlToText, renderMerge } from "@/lib/emailPreview";

export const dynamic = "force-dynamic";

async function preview(campaignId: string, lead?: BatchLead) {
  if (!instantlyConfigured()) return null;
  try {
    const c = await getCampaignDetail(campaignId);
    const v = c.sequences?.[0]?.steps?.[0]?.variants?.[0];
    if (!v) return null;
    const vars = { firstName: lead?.full_name?.split(" ")[0] ?? null, companyName: lead?.company_name ?? null };
    return { campaign: c.name, status: c.status, subject: renderMerge(v.subject, vars), body: htmlToText(renderMerge(v.body, vars)) };
  } catch (e) { return { campaign: "", status: -1, subject: "", body: `Couldn't load the email from Instantly: ${(e as Error).message}` }; }
}

export default async function Today() {
  try {
    const date = pacificToday();
    const s = await getOutreachSettings();
    const { week, perMailbox } = rampStep(s, date);
    const cap = (s.applied_per_mailbox ?? perMailbox) * s.mailboxes;
    const batch = await one<{ id: string; status: string; target: number; note: string | null; sent_at: string | null; sent_summary: any }>(
      "select * from daily_batches where batch_date = $1", [date]);
    const leads = batch ? await sql<BatchLead>(
      `select i.contact_id, i.arm, o.company_name, c.full_name, c.title, c.email, o.city, o.business_type, o.lead_score, o.employee_range
         from daily_batch_items i join contacts c on c.id = i.contact_id join organizations o on o.id = i.organization_id
        where i.batch_id = $1 order by i.arm desc, o.lead_score desc nulls last`, [batch.id]) : [];
    const [local, big] = await Promise.all([
      preview(s.local_campaign_id, leads.find((l) => l.arm === "local")),
      preview(s.big_campaign_id, leads.find((l) => l.arm === "big")),
    ]);
    const n = (arm: string) => leads.filter((l) => l.arm === arm).length;
    const pool = await poolCounts();
    return (
      <>
        <div className="page-head"><div><h1>Today&rsquo;s Send</h1>
          <p className="muted">{new Date(date + "T12:00:00").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })} · Review the people and the exact email, then approve. Emails go out 8 AM–12 PM Pacific on weekdays, one email per person.</p></div></div>
        <div className="grid g-4">
          <Kpi label="Today's leads" value={leads.length} sub={batch ? `target ${batch.target}` : "not built yet"} />
          <Kpi label="Local businesses" value={n("local")} sub="90% — main email" />
          <Kpi label="Big companies (test)" value={n("big")} sub="10% — experiment email" />
          <Kpi label={`Week ${week} sending cap`} value={cap} sub={`${s.applied_per_mailbox ?? perMailbox}/mailbox × ${s.mailboxes} · raises weekly if healthy`} />
        </div>
        <p className="small muted" style={{ margin: "8px 0" }}>
          <b>{(pool.local + pool.big).toLocaleString()}</b> more leads already in the platform are ready to email ({pool.local.toLocaleString()} local · {pool.big.toLocaleString()} big companies), about {Math.max(1, Math.ceil((pool.local + pool.big) / Math.max(1, cap)))} sending day(s) at the current cap. Each morning&rsquo;s batch uses these first and only searches Getlead when they run out.
        </p>
        {batch?.note && <div className="notice"><div><b>Heads up</b>{batch.note}</div></div>}
        {batch?.status === "sent" && <div className="notice info"><div><b>Approved and sent to Instantly</b>{Object.entries(batch.sent_summary ?? {}).map(([k, v]: any) => `${k === "local" ? "Local" : "Big companies"}: ${v.added} added`).join(" · ")}</div></div>}

        <div className="grid g-2">
          {[["Local businesses email", local], ["Big companies email (10% test)", big]].map(([title, p]: any) => (
            <Panel key={title} title={title} sub={p ? `${p.campaign}${p.status === 1 ? " · Active" : p.status === 0 ? " · Not launched yet" : ""}` : "Instantly not connected"}>
              {p ? <><p><b>Subject:</b> {p.subject}</p><pre style={{ whiteSpace: "pre-wrap", fontFamily: "inherit", margin: 0 }}>{p.body}</pre></> : <p className="muted">—</p>}
            </Panel>
          ))}
        </div>

        <Panel title="Today's people" sub={batch ? (batch.status === "ready" ? "Waiting for your approval" : `Status: ${batch.status}`) : "Built automatically every morning before 5 AM"} pad={false}>
          <div className="panel-body"><TodayBatch batchId={batch?.id ?? null} status={batch?.status ?? null} leads={leads} /></div>
        </Panel>
      </>
    );
  } catch (e) { return <><h1>Today&rsquo;s Send</h1><DbError error={e} /></>; }
}
