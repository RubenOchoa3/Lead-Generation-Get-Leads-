import { sql } from "@/lib/db";
import { DbError, Empty, Kpi, Panel, StatusBadge } from "@/components/ui";

export const dynamic = "force-dynamic";
const yes = (v: boolean | null) => (v === null ? <span className="faint">—</span> : v ? <span className="badge ok">Pass</span> : <span className="badge warn">Missing</span>);

export default async function Domains() {
  try {
    const rows = await sql(`select * from domains order by is_primary_business_domain desc, health, domain`);
    const sending = rows.filter((d: any) => !d.is_primary_business_domain);
    return (
      <>
        <div className="page-head"><div><h1>Domains</h1><p className="muted">Sending domains from InboxKit. The main R&amp;S domain is protected from cold outreach.</p></div></div>
        <section className="kpis" style={{ gridTemplateColumns: "repeat(4, minmax(0,1fr))" }}>
          <Kpi label="Sending domains" value={sending.length} />
          <Kpi label="DNS healthy (SPF+DKIM+DMARC)" value={sending.filter((d: any) => d.health === "Healthy").length} />
          <Kpi label="Pending DNS" value={sending.filter((d: any) => d.health === "Pending").length} />
          <Kpi label="With mailboxes" value={sending.filter((d: any) => (d.mailbox_count ?? 0) > 0).length} />
        </section>
        <Panel title="All domains" pad={false}>
          {rows.length === 0 ? <Empty title="No domains synced" /> : (
            <div className="table-wrap"><table>
              <thead><tr><th>Domain</th><th>Provider</th><th>Status</th><th>DNS</th><th>SPF</th><th>DKIM</th><th>DMARC</th><th>Mailboxes</th><th>Health</th><th>Created</th><th>Last sync</th></tr></thead>
              <tbody>{rows.map((d: any) => (
                <tr key={d.id}><td className="cell-main">{d.domain}{d.is_primary_business_domain && <> <span className="badge bad">Main domain — never cold email</span></>}</td>
                  <td>{d.provider}</td><td><StatusBadge value={d.status} /></td><td><StatusBadge value={d.dns_status} /></td>
                  <td>{yes(d.spf_ok)}</td><td>{yes(d.dkim_ok)}</td><td>{yes(d.dmarc_ok)}</td><td className="num">{d.mailbox_count ?? 0}</td>
                  <td><StatusBadge value={d.health} /></td><td className="num">{d.created_on_provider ? new Date(d.created_on_provider).toLocaleDateString() : "—"}</td>
                  <td className="num">{d.last_sync_at ? new Date(d.last_sync_at).toLocaleDateString() : "—"}</td></tr>))}</tbody>
            </table></div>)}
        </Panel>
      </>
    );
  } catch (e) { return <><h1>Domains</h1><DbError error={e} /></>; }
}
