import Link from "next/link";
import { sql } from "@/lib/db";
import { DbError, Empty, Panel, Kpi } from "@/components/ui";
import RegistryActions from "@/components/RegistryActions";
import { casosConfigured } from "@/lib/providers/casos";

export const dynamic = "force-dynamic";

const TABS = [
  { key: "call_or_visit", label: "Call / visit" },
  { key: "contact_found", label: "Contact found" },
  { key: "pending", label: "Waiting for lookup" },
  { key: "skipped", label: "Skipped" },
  { key: "all", label: "All" },
];
const STATUS_LABEL: Record<string, string> = { call_or_visit: "Call / visit", contact_found: "Contact found", pending: "Waiting", skipped: "Skipped" };
const SOURCE_LABEL: Record<string, string> = { ca_sos: "CA Secretary of State", fresno_new_business: "Fresno new license" };

export default async function NewBusinesses({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const status = (await searchParams).status || "call_or_visit";
  try {
    const counts = await sql<{ enrichment_status: string; n: number }>(`select enrichment_status, count(*)::int n from registry_businesses group by 1`);
    const c = (k: string) => k === "all" ? counts.reduce((a, r) => a + r.n, 0) : counts.find((r) => r.enrichment_status === k)?.n ?? 0;
    const rows = await sql(
      `select r.*, o.lead_score from registry_businesses r left join organizations o on o.id = r.organization_id
        where ($1 = 'all' or r.enrichment_status = $1) order by r.filed_date desc nulls last, r.first_seen_at desc limit 300`, [status]);
    return (
      <>
        <div className="page-head"><div><h1>New Businesses</h1>
          <p className="muted">Newly registered Central Valley businesses from free public records, looked up in Getlead for a decision maker. No contact found → kept here as a call or in-person lead. Runs every night with the Daily Lead Engine.</p></div></div>

        {!casosConfigured() && (
          <div className="notice info"><div>
            <b>Connect the free California Secretary of State feed</b>
            Fresno new business licenses are already on. To add every new LLC and corporation filed in the Central Valley, create a free account at calicodev.sos.ca.gov → Products → <i>BE Public Search</i> → Subscribe, then add the key in Railway → web → Variables as <code>CASOS_API_KEY</code>.
          </div></div>
        )}

        <div className="grid g-4">
          <Kpi label="Call / visit leads" value={c("call_or_visit")} />
          <Kpi label="Contact found" value={c("contact_found")} sub="sent to scoring + Approval Queue" />
          <Kpi label="Waiting for lookup" value={c("pending")} />
          <Kpi label="Total pulled" value={c("all")} />
        </div>

        <Panel title="Pull & export" sub="Pulls the last 7 days and looks up to 40 businesses in Getlead per click."><RegistryActions /></Panel>

        <div className="chips" style={{ margin: "4px 0 10px" }}>
          {TABS.map((t) => <Link key={t.key} className="chip" aria-pressed={status === t.key} href={`/new-businesses?status=${t.key}`}>{t.label} · {c(t.key)}</Link>)}
        </div>

        <Panel pad={false}>
          {rows.length === 0 ? <Empty title="Nothing here yet">Click “Pull new businesses now”, or wait for tonight’s run.</Empty> : (
            <div className="table-wrap"><table>
              <thead><tr><th>Business</th><th>Type</th><th>Registered</th><th>Address</th><th>Contact</th><th>Status</th><th>Source</th></tr></thead>
              <tbody>{rows.map((r: any) => (
                <tr key={r.id}>
                  <td><b>{r.name}</b>{r.agent_name && <div className="small faint">Agent: {r.agent_name}</div>}</td>
                  <td className="small">{r.business_type || r.entity_type || "—"}</td>
                  <td className="num">{r.filed_date ? new Date(r.filed_date).toLocaleDateString() : "—"}</td>
                  <td className="small">{[r.address, r.city, r.postal_code].filter(Boolean).join(", ") || "—"}</td>
                  <td className="small">{r.contact_name ? <>{r.contact_name}{r.contact_title && <> · {r.contact_title}</>}{r.contact_email && <div>{r.contact_email}</div>}{r.contact_phone && <div>{r.contact_phone}</div>}</> : "—"}</td>
                  <td className="small">{r.organization_id ? <Link href={`/leads?q=${encodeURIComponent(r.name)}`}>{STATUS_LABEL[r.enrichment_status]}</Link> : STATUS_LABEL[r.enrichment_status]}{r.enrichment_note && <div className="faint">{r.enrichment_note}</div>}</td>
                  <td className="small">{SOURCE_LABEL[r.source] ?? r.source}</td>
                </tr>))}</tbody>
            </table></div>)}
        </Panel>
      </>
    );
  } catch (e) { return <><h1>New Businesses</h1><DbError error={e} /></>; }
}
