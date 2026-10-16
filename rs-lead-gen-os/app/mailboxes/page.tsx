import { sql, tx } from "@/lib/db";
import { syncMailboxesFromSender } from "@/lib/infrastructure";
import { instantly, instantlyConfigured } from "@/lib/providers/instantly";

/** Pull live mailbox status from Instantly on every page view (18 accounts — a fast call). */
async function refreshFromSender(): Promise<string | null> {
  if (!instantlyConfigured()) return null;
  try {
    const [accounts, campaigns] = await Promise.all([instantly.listAccounts(), instantly.listCampaigns()]);
    await tx((c) => syncMailboxesFromSender(c, accounts, campaigns));
    return null;
  } catch (e) { return (e as Error).message; }
}
import { DbError, Empty, Kpi, Panel, StatusBadge } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function Mailboxes() {
  try {
    const syncError = await refreshFromSender();
    const rows = await sql(`select * from mailboxes order by domain, address`);
    const total = rows.length;
    const active = rows.filter((r: any) => r.status === "active").length;
    const connected = rows.filter((r: any) => r.sequencer).length;
    const warming = rows.filter((r: any) => /^warming/i.test(r.warmup_status ?? "")).length;
    const capacity = rows.filter((r: any) => r.sequencer && r.status === "active").reduce((n: number, r: any) => n + (r.daily_send_limit ?? 0), 0);
    const lastSync = rows.reduce((m: string | null, r: any) => (!m || r.last_sync_at > m ? r.last_sync_at : m), null);
    return (
      <>
        <div className="page-head"><div><h1>Mailboxes</h1><p className="muted">Sending mailboxes (created in InboxKit, sending through Instantly). {lastSync ? `Last synced ${new Date(lastSync).toLocaleString()}.` : "Not synced yet."} Passwords are never stored here.</p></div></div>
        {syncError && <div className="notice bad"><div><b>Couldn&rsquo;t refresh from Instantly</b>{syncError}</div></div>}
        {total > 0 && connected === 0 && <div className="notice"><div><b>No mailbox can send yet.</b>None are connected to a sender and none are warming. New Google mailboxes need about 2–3 weeks of warmup, then a gradual ramp, before cold volume. Daily capacity today: 0.</div></div>}
        <section className="kpis" style={{ gridTemplateColumns: "repeat(6, minmax(0,1fr))" }}>
          <Kpi label="Total" value={total} /><Kpi label="Active (provisioned)" value={active} /><Kpi label="Warming" value={warming} />
          <Kpi label="Connected to sender" value={connected} /><Kpi label="Daily limit (set in Instantly)" value={capacity} /><Kpi label="Sent today" value="See Instantly" />
        </section>
        <Panel title="All mailboxes" pad={false}>
          {total === 0 ? <Empty title="No mailboxes synced">{instantlyConfigured() ? "Instantly returned no sending mailboxes." : "Connect Instantly (INSTANTLY_API_KEY) to load live mailbox status."}</Empty> : (
            <div className="table-wrap"><table>
              <thead><tr><th>Mailbox</th><th>Domain</th><th>Provider</th><th>Status</th><th>Warmup</th><th>Health</th><th>Daily limit</th><th>Sent today</th><th>Bounce</th><th>Sender</th><th>Campaign</th><th>Last sync</th></tr></thead>
              <tbody>{rows.map((m: any) => (
                <tr key={m.id}><td className="cell-main">{m.address}</td><td>{m.domain}</td><td>{m.platform ?? m.provider}</td><td><StatusBadge value={m.status} /></td>
                  <td><StatusBadge value={m.warmup_status ?? "Not started"} /></td><td>{m.health ? <StatusBadge value={m.health} /> : <span className="faint">No data</span>}</td>
                  <td className="num">{m.daily_send_limit ?? "—"}</td><td className="num">{m.sent_today ?? "—"}</td><td className="num">{m.bounce_rate != null ? `${m.bounce_rate}%` : "—"}</td>
                  <td>{m.sequencer ?? <span className="faint">Not connected</span>}</td><td>{m.campaign ?? <span className="faint">None</span>}</td><td className="num">{m.last_sync_at ? new Date(m.last_sync_at).toLocaleDateString() : "—"}</td></tr>))}</tbody>
            </table></div>)}
        </Panel>
      </>
    );
  } catch (e) { return <><h1>Mailboxes</h1><DbError error={e} /></>; }
}
