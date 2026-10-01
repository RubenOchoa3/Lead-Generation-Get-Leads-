import { sql } from "@/lib/db";
import { DbError, Empty, Panel } from "@/components/ui";

export const dynamic = "force-dynamic";

const DIMS: Record<string, { label: string; expr: string }> = {
  business_type: { label: "Business type", expr: "coalesce(o.business_type,'Unclassified')" },
  city: { label: "City", expr: "coalesce(o.city,'Unknown')" },
  title: { label: "Decision-maker title", expr: "coalesce(c.title,'No contact')" },
  band: { label: "Score band", expr: "o.score_band" },
  source: { label: "Source", expr: "o.source" },
};

type Row = { seg: string; leads: number; qualified: number; verified: number; approved: number; rejected: number; contacted: number; replies: number; positive: number; meetings: number; closed: number };
const pct = (n: number, d: number) => (d ? `${Math.round((n / d) * 100)}%` : "—");

export default async function Analytics({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const dimKey = DIMS[sp.dim ?? ""] ? sp.dim! : "business_type";
  const dim = DIMS[dimKey];
  try {
    const rows = await sql<Row>(`
      select ${dim.expr} seg, count(distinct o.id)::int leads,
        count(distinct o.id) filter (where o.lead_score >= 65)::int qualified,
        count(distinct o.id) filter (where c.email_status = 'VALID')::int verified,
        count(distinct o.id) filter (where q.status = 'Approved')::int approved,
        count(distinct o.id) filter (where q.status = 'Rejected')::int rejected,
        count(distinct e.contact_id) filter (where e.event_type = 'sent')::int contacted,
        count(*) filter (where e.event_type = 'reply')::int replies,
        count(*) filter (where e.event_type = 'reply' and e.reply_classification = 'Positive')::int positive,
        count(*) filter (where e.event_type = 'meeting_booked')::int meetings,
        count(*) filter (where e.event_type = 'closed_won')::int closed
      from organizations o
      left join contacts c on c.organization_id = o.id and c.is_primary
      left join approval_queue q on q.organization_id = o.id
      left join outreach_events e on e.organization_id = o.id
      group by 1 order by 2 desc limit 40`);
    const a = rows.find((r) => r.seg === sp.a) ?? rows[0];
    const b = rows.find((r) => r.seg === sp.b) ?? rows[1];
    const metrics: Array<[string, (r: Row) => string]> = [
      ["Leads", (r) => r.leads.toLocaleString()], ["Qualified rate", (r) => pct(r.qualified, r.leads)], ["Verified contact rate", (r) => pct(r.verified, r.leads)],
      ["Approval rate (of decided)", (r) => pct(r.approved, r.approved + r.rejected)], ["Reply rate", (r) => pct(r.replies, r.contacted)],
      ["Positive reply rate", (r) => pct(r.positive, r.contacted)], ["Meeting rate", (r) => pct(r.meetings, r.contacted)], ["Close rate", (r) => pct(r.closed, r.contacted)],
    ];
    return (
      <>
        <div className="page-head">
          <div><h1>Analytics</h1><p className="muted">Segment performance from the database. Outreach rates show “—” until there are sends.</p></div>
          <form className="actions" method="get">
            <select name="dim" defaultValue={dimKey} aria-label="Segment by">{Object.entries(DIMS).map(([k, d]) => <option key={k} value={k}>By {d.label.toLowerCase()}</option>)}</select>
            <button className="btn" type="submit">Apply</button>
          </form>
        </div>
        {rows.length === 0 ? <Empty title="No leads yet" /> : (
          <>
            {a && b && (
              <Panel title="Side-by-side" sub={`Compare two ${dim.label.toLowerCase()} segments`}>
                <form method="get" className="actions" style={{ marginBottom: 12 }}>
                  <input type="hidden" name="dim" value={dimKey} />
                  <select name="a" defaultValue={a.seg} aria-label="Segment A">{rows.map((r) => <option key={r.seg}>{r.seg}</option>)}</select>
                  <span className="muted" style={{ alignSelf: "center" }}>vs</span>
                  <select name="b" defaultValue={b.seg} aria-label="Segment B">{rows.map((r) => <option key={r.seg}>{r.seg}</option>)}</select>
                  <button className="btn sm" type="submit">Compare</button>
                </form>
                <div className="table-wrap"><table>
                  <thead><tr><th>Metric</th><th>{a.seg}</th><th>{b.seg}</th></tr></thead>
                  <tbody>{metrics.map(([l, f]) => <tr key={l}><td>{l}</td><td className="num">{f(a)}</td><td className="num">{f(b)}</td></tr>)}</tbody>
                </table></div>
              </Panel>
            )}
            <Panel title={`All segments by ${dim.label.toLowerCase()}`} pad={false}>
              <div className="table-wrap"><table>
                <thead><tr><th>{dim.label}</th>{metrics.map(([l]) => <th key={l}>{l}</th>)}</tr></thead>
                <tbody>{rows.map((r) => <tr key={r.seg}><td className="cell-main">{r.seg}</td>{metrics.map(([l, f]) => <td key={l} className="num">{f(r)}</td>)}</tr>)}</tbody>
              </table></div>
            </Panel>
            <Panel title="Cost metrics" sub="Cost per qualified lead / verified contact / positive reply / meeting / customer">
              <Empty title="Not calculated yet">Needs provider cost inputs in Settings and outreach outcomes. Getlead is on an unlimited plan, so per-lead data cost is effectively the plan fee ÷ leads used.</Empty>
            </Panel>
          </>
        )}
      </>
    );
  } catch (e) { return <><h1>Analytics</h1><DbError error={e} /></>; }
}
