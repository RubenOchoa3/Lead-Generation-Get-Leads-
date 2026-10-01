import { sql } from "@/lib/db";
import { DbError, Empty, Kpi, Panel, StatusBadge } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function Mailboxes() {
  try {
    const rows = await sql(`select * from mailboxes order by domain, address`);
    const total = rows.length;
    const active = rows.filter((r: any) => r.status === "active").length;
    const connected = rows.filter((r: any) => r.sequencer).length;
    const warming = rows.filter((r: any) => /warm/i.test(r.warmup_status ?? "")).length;
    const lastSync = rows.reduce((m: string | null, r: any) => (!m || r.last_sync_at > m ? r.last_sync_at : m), null);
    return (
      <>
        <div className="page-head"><div><h1>Mailboxes</h1><p className="muted">InboxKit sending mailboxes. {lastSync ? `Last synced ${new Date(lastSync).toLocaleString()}.` : "Not synced yet."} Passwords are never stored here.</p></div></div>
        {total > 0 && connected === 0 && <div className="notice"><div><b>No mailbox can send yet.</b>None are connected to a sender and none are warming. New Google mailboxes need about 2–3 weeks of warmup, then a gradual ramp, before cold volume. Daily capacity today: 0.</div></div>}
        <section className="kpis" style={{ gridTemplateColumns: "repeat(6, minmax(0,1fr))" }}>
          <Kpi label="Total" value={total} /><Kpi label="Active (provisioned)" value={active} /><Kpi label="Warming" value={warming} />
          <Kpi label="Connected to sender" value={connected} /><Kpi label="Daily capacity" value={connected ? "See sender" : 0} /><Kpi label="Sent today" value={connected ? "—" : 0} />
        </section>
        <Panel title="All mailboxes" pad={false}>
          {total === 0 ? <Empty title="No mailboxes synced">Run an InboxKit sync (System → Automations) to load real mailbox status.</Empty> : (
            <div className="table-wrap"><table>
              <thead><tr><th>Mailbox</th><th>Domain</th><th>Provider</th><th>Status</th><th>Warmup</th><th>Health</th><th>Daily limit</th><th>Sent today</th><th>Bounce</th><th>Sender</th><th>Last sync</th></tr></thead>
              <tbody>{rows.map((m: any) => (
                <tr key={m.id}><td className="cell-main">{m.address}</td><td>{m.domain}</td><td>{m.platform ?? m.provider}</td><td><StatusBadge value={m.status} /></td>
                  <td><StatusBadge value={m.warmup_status ?? "Not started"} /></td><td>{m.health ? <StatusBadge value={m.health} /> : <span className="faint">No data</span>}</td>
                  <td className="num">{m.daily_send_limit ?? "—"}</td><td className="num">{m.sent_today ?? "—"}</td><td className="num">{m.bounce_rate != null ? `${m.bounce_rate}%` : "—"}</td>
                  <td>{m.sequencer ?? <span className="faint">Not connected</span>}</td><td className="num">{m.last_sync_at ? new Date(m.last_sync_at).toLocaleDateString() : "—"}</td></tr>))}</tbody>
            </table></div>)}
        </Panel>
      </>
    );
  } catch (e) { return <><h1>Mailboxes</h1><DbError error={e} /></>; }
}
