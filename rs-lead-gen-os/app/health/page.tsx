import { sql } from "@/lib/db";
import { DbError, Panel, StatusBadge } from "@/components/ui";
import { getleadConfigured } from "@/lib/providers/getlead";

export const dynamic = "force-dynamic";
const pct = (n: number, d: number) => (d ? `${((n / d) * 100).toFixed(1)}%` : "—");

export default async function Health() {
  let dbOk = true; let m: Record<string, number> = {}; let lastRun: any = null; let migration = "—"; let err: unknown = null;
  try {
    [m] = await sql<Record<string, number>>(`select
      (select count(*)::int from discovery_events) disc, (select count(*)::int from discovery_events where was_duplicate) dup,
      (select count(*)::int from organizations) orgs, (select count(distinct organization_id)::int from contacts where email_status='VALID') verified,
      (select count(*)::int from organizations where lead_score >= 65) qualified, (select count(distinct organization_id)::int from research) researched,
      (select count(*)::int from approval_queue where status in ('Approved','Rejected')) decided, (select count(*)::int from approval_queue where status='Approved') approved,
      (select count(*)::int from outreach_events where event_type='sent') sent, (select count(*)::int from outreach_events where event_type='bounce') bounces,
      (select count(*)::int from outreach_events where event_type='reply' and reply_classification='Positive') positive,
      (select count(*)::int from automation_runs where status='failed' and started_at > now() - interval '7 days') failures`);
    [lastRun] = await sql(`select * from automation_runs where status = 'complete' order by finished_at desc limit 1`);
    migration = (await sql<{ name: string }>(`select name from schema_migrations order by name desc limit 1`).catch(() => [{ name: "unknown" }]))[0]?.name ?? "none";
  } catch (e) { dbOk = false; err = e; }

  const checks: Array<[string, string, string]> = [
    ["Railway web app", "Healthy", "You're looking at it"],
    ["PostgreSQL", dbOk ? "Healthy" : "Critical", dbOk ? `migration ${migration}` : "not reachable"],
    ["Getlead (server API)", getleadConfigured() ? "Configured" : "Not configured", getleadConfigured() ? "live search enabled" : "imports via Claude MCP / CSV"],
    ["Claude research (server API)", process.env.ANTHROPIC_API_KEY ? "Configured" : "Not configured", process.env.ANTHROPIC_API_KEY ? "" : "research added from Claude sessions"],
    ["InboxKit sync", process.env.INBOXKIT_API_KEY ? "Configured" : "Not configured", "snapshots pushed from Claude's InboxKit MCP"],
    ["Sender / campaign sync", "Not connected", "awaiting sender decision"],
    ["Workers / scheduled jobs", "Not configured", "daily engine disabled until pilot reviewed"],
    ["Auth", process.env.APP_PASSWORD ? "Healthy" : "Warning", process.env.APP_PASSWORD ? "Basic auth on" : "APP_PASSWORD missing"],
  ];
  return (
    <>
      <div className="page-head"><div><h1>System Health</h1><p className="muted">Real configuration and pipeline ratios. Nothing here is simulated.</p></div></div>
      {!dbOk && <DbError error={err} />}
      <div className="grid g-2">
        <Panel title="Services">
          <div className="list">{checks.map(([n, s, d]) => <div className="list-row" key={n}><div><div className="cell-main">{n}</div><div className="cell-sub">{d}</div></div><StatusBadge value={s} /></div>)}</div>
        </Panel>
        <Panel title="Pipeline ratios">
          {dbOk ? <dl className="kv">
            <dt>Last successful run</dt><dd>{lastRun ? new Date(lastRun.finished_at).toLocaleString() : "—"}</dd>
            <dt>Provider failures (7d)</dt><dd>{m.failures}</dd>
            <dt>Duplicate %</dt><dd>{pct(m.dup, m.disc)}</dd>
            <dt>Verification %</dt><dd>{pct(m.verified, m.orgs)}</dd>
            <dt>Research completion %</dt><dd>{pct(m.researched, m.qualified)} of qualified</dd>
            <dt>Approval %</dt><dd>{pct(m.approved, m.decided)} of decided</dd>
            <dt>Bounce %</dt><dd>{pct(m.bounces, m.sent)}</dd>
            <dt>Positive reply %</dt><dd>{pct(m.positive, m.sent)}</dd>
          </dl> : "—"}
        </Panel>
      </div>
    </>
  );
}
