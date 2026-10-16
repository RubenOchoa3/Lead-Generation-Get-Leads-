import { sql } from "@/lib/db";
import { DbError, Empty, Panel } from "@/components/ui";

export const dynamic = "force-dynamic";

/** Deterministic, evidence-backed observations only. Each states its sample size. */
export default async function Insights() {
  try {
    const [types, [q]] = await Promise.all([
      sql<{ seg: string; n: number; verified: number; qualified: number }>(`
        select coalesce(o.business_type,'Unclassified') seg, count(*)::int n,
          count(*) filter (where c.email_status = 'VALID')::int verified, count(*) filter (where o.lead_score >= 65)::int qualified
        from organizations o left join contacts c on c.organization_id = o.id and c.is_primary group by 1 having count(*) >= 10 order by 2 desc`),
      sql<{ dup: number; total: number; sent: number }>(`select (select count(*)::int from discovery_events where was_duplicate) dup, (select count(*)::int from discovery_events) total, (select count(*)::int from outreach_events where event_type='sent') sent`),
    ]);
    const obs: string[] = [];
    if (q.total >= 20) obs.push(`Duplicate rate across Getlead pulls: ${Math.round((q.dup / q.total) * 100)}% (${q.dup} of ${q.total} records).`);
    const ranked = [...types].sort((a, b) => b.qualified / b.n - a.qualified / a.n);
    if (ranked.length >= 2) {
      const top = ranked[0], low = ranked[ranked.length - 1];
      obs.push(`${top.seg} has the highest qualified rate (${Math.round((top.qualified / top.n) * 100)}% of ${top.n}); ${low.seg} the lowest (${Math.round((low.qualified / low.n) * 100)}% of ${low.n}).`);
    }
    return (
      <>
        <div className="page-head"><div><h1>Claude Insights</h1><p className="muted">Recommendations appear only when the data supports them. Segments under 10 leads are ignored.</p></div></div>
        <Panel title="Lead-quality observations">
          {obs.length === 0 ? <Empty title="Not enough data yet">Needs at least ~20 imported records and 10+ per segment.</Empty> : <ul style={{ margin: 0, paddingLeft: 18 }}>{obs.map((o) => <li key={o} style={{ marginBottom: 6 }}>{o}</li>)}</ul>}
        </Panel>
        <Panel title="Outreach recommendations">
          {q.sent === 0 ? <Empty title="Waiting on outreach outcomes">Reply, meeting and close rates by segment drive these. None yet.</Empty> : <Empty title="Weekly optimization runs in Phase 7" />}
        </Panel>
      </>
    );
  } catch (e) { return <><h1>Claude Insights</h1><DbError error={e} /></>; }
}
