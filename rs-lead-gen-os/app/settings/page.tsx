import { sql } from "@/lib/db";
import { DbError, Panel } from "@/components/ui";
import SettingsForm from "@/components/SettingsForm";

export const dynamic = "force-dynamic";

export default async function Settings() {
  try {
    const rows = await sql<{ key: string; value: unknown; updated_at: string }>(`select key, value, updated_at from settings order by key`);
    const s = Object.fromEntries(rows.map((r) => [r.key, r.value]));
    return (
      <>
        <div className="page-head"><div><h1>Settings</h1><p className="muted">Business rules live here. Secrets (API keys, database URL) live only in Railway variables and are never shown.</p></div></div>
        <SettingsForm initial={s as never} />
        <Panel title="Scoring model (v1, fixed in code)" sub="Fit 40 · Contact 25 · Data quality 20 · Opportunity 15 — every point is listed on the lead">
          <p className="small muted">Bands: Priority 80–100 · Good 65–79 · Review 50–64 · Hold &lt;50. A high score never triggers outreach in v1. Janitorial competitors are auto-suppressed.</p>
        </Panel>
      </>
    );
  } catch (e) { return <><h1>Settings</h1><DbError error={e} /></>; }
}
