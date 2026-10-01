import { sql } from "@/lib/db";
import { DbError, Empty, Panel, StatusBadge } from "@/components/ui";
import { getleadConfigured } from "@/lib/providers/getlead";

export const dynamic = "force-dynamic";

const CARDS = [
  { type: "daily_lead_engine", name: "Daily Lead Engine", note: "Scheduled Getlead search → dedupe → score → queue. Off until the pilot is reviewed and the server Getlead key is added." },
  { type: "getlead_import", name: "Getlead Sync / Import", note: "Imports from Claude's Getlead MCP pulls or CSV exports." },
  { type: "manual_search", name: "Manual Getlead search", note: "Get Leads button on Find Leads (needs server Getlead key)." },
  { type: "inboxkit_sync", name: "InboxKit Sync", note: "Domains + mailboxes snapshot." },
  { type: "claude_research", name: "Claude Research", note: "Qualified leads only." },
  { type: "campaign_sync", name: "Campaign Sync", note: "Waiting on sender decision." },
  { type: "weekly_optimization", name: "Weekly Optimization", note: "Needs outreach outcomes." },
];

export default async function Automations() {
  try {
    const runs = await sql(`select * from automation_runs order by started_at desc limit 50`);
    const last = (t: string) => runs.find((r: any) => r.automation_type === t);
    return (
      <>
        <div className="page-head"><div><h1>Automations</h1><p className="muted">Every run is logged. Only one run of each type can execute at a time. Outreach is never launched automatically.</p></div></div>
        <div className="grid g-3">
          {CARDS.map((c) => {
            const r: any = last(c.type);
            const dur = r?.finished_at ? Math.round((new Date(r.finished_at).getTime() - new Date(r.started_at).getTime()) / 1000) : null;
            return (
              <Panel key={c.type} title={c.name} action={r ? <StatusBadge value={r.status} /> : <span className="badge">{c.type === "manual_search" && !getleadConfigured() ? "Not configured" : "Never run"}</span>}>
                <p className="small muted" style={{ marginBottom: 10 }}>{c.note}</p>
                <dl className="kv small">
                  <dt>Last run</dt><dd>{r ? new Date(r.started_at).toLocaleString() : "—"}</dd>
                  <dt>Next run</dt><dd>{c.type === "daily_lead_engine" ? "Disabled" : "On demand"}</dd>
                  <dt>Duration</dt><dd>{dur !== null ? `${dur}s` : "—"}</dd>
                  <dt>Output</dt><dd>{r ? `${r.unique_businesses} new · ${r.duplicates_removed} dupes · ${r.queued} queued` : "—"}</dd>
                  <dt>Errors</dt><dd>{r?.error_summary ? <span style={{ color: "var(--danger)" }}>{String(r.error_summary).slice(0, 140)}</span> : r ? "None" : "—"}</dd>
                </dl>
              </Panel>
            );
          })}
        </div>
        <Panel title="Run log" pad={false}>
          {runs.length === 0 ? <Empty title="No runs yet" /> : (
            <div className="table-wrap"><table>
              <thead><tr><th>Started</th><th>Type</th><th>Trigger</th><th>Status</th><th>Rows</th><th>New</th><th>Dupes</th><th>Verified</th><th>Priority</th><th>Good</th><th>Queued</th><th>Failures</th></tr></thead>
              <tbody>{runs.map((r: any) => (
                <tr key={r.id}><td className="num">{new Date(r.started_at).toLocaleString()}</td><td>{r.automation_type.replace(/_/g, " ")}</td><td>{r.trigger}</td><td><StatusBadge value={r.status} /></td>
                  {["matches", "unique_businesses", "duplicates_removed", "verified_emails", "priority_count", "good_count", "queued", "failed"].map((k) => <td key={k} className="num">{r[k]}</td>)}</tr>))}</tbody>
            </table></div>)}
        </Panel>
      </>
    );
  } catch (e) { return <><h1>Automations</h1><DbError error={e} /></>; }
}
