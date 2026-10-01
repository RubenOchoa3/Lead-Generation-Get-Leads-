import Link from "next/link";
import { sql } from "@/lib/db";
import { Bars, DbError, Empty, Funnel, Kpi, LineChart, Panel, ScorePill, StatusBadge } from "@/components/ui";

export const dynamic = "force-dynamic";

const money = (n: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n || 0);
const pct = (n: number, d: number) => (d > 0 ? `${((n / d) * 100).toFixed(1)}%` : "—");
const TZ = "America/Los_Angeles";

async function load() {
  const [k] = await sql<Record<string, number>>(`
    select
      (select count(*)::int from organizations) total,
      (select count(*)::int from organizations where (created_at at time zone '${TZ}')::date = (now() at time zone '${TZ}')::date) today,
      (select count(*)::int from organizations where created_at >= now() - interval '7 days') week,
      (select count(*)::int from organizations where lead_score >= 65 and pipeline_status <> 'Suppressed') qualified,
      (select count(distinct organization_id)::int from contacts where email_status = 'VALID') verified,
      (select count(*)::int from approval_queue where status = 'Needs Review') review,
      (select count(*)::int from approval_queue where status = 'Approved') approved,
      (select count(*)::int from outreach_events where event_type = 'sent' and (occurred_at at time zone '${TZ}')::date = (now() at time zone '${TZ}')::date) sent_today,
      (select count(*)::int from outreach_events where event_type = 'sent') sent_total,
      (select count(distinct contact_id)::int from outreach_events where event_type = 'sent') contacted,
      (select count(*)::int from outreach_events where event_type = 'reply') replies,
      (select count(*)::int from outreach_events where event_type = 'reply' and reply_classification = 'Positive') positive,
      (select count(*)::int from outreach_events where event_type = 'meeting_booked') meetings,
      (select count(*)::int from outreach_events where event_type = 'closed_won') closed,
      (select coalesce(sum(revenue),0)::float from outreach_events where event_type = 'closed_won') revenue,
      (select count(*)::int from mailboxes) mailboxes,
      (select count(*)::int from domains where not is_primary_business_domain) domains,
      (select count(*)::int from domains where health = 'Healthy' and not is_primary_business_domain) domains_healthy,
      (select count(*)::int from mailboxes where sequencer is not null) mailboxes_connected,
      (select count(*)::int from campaigns) campaigns`);

  const [series, bySource, byCity, byType, scoreDist, queue, highScore, replies, runs] = await Promise.all([
    sql<{ d: string; found: number; contacted: number; replied: number; positive: number; booked: number; closed: number }>(`
      with days as (select generate_series((now() at time zone '${TZ}')::date - 29, (now() at time zone '${TZ}')::date, '1 day')::date d)
      select to_char(d, 'MM/DD') d,
        (select count(*)::int from organizations o where (o.created_at at time zone '${TZ}')::date = days.d) found,
        (select count(*)::int from outreach_events e where e.event_type = 'sent' and e.step = 1 and (e.occurred_at at time zone '${TZ}')::date = days.d) contacted,
        (select count(*)::int from outreach_events e where e.event_type = 'reply' and (e.occurred_at at time zone '${TZ}')::date = days.d) replied,
        (select count(*)::int from outreach_events e where e.event_type = 'reply' and e.reply_classification = 'Positive' and (e.occurred_at at time zone '${TZ}')::date = days.d) positive,
        (select count(*)::int from outreach_events e where e.event_type = 'meeting_booked' and (e.occurred_at at time zone '${TZ}')::date = days.d) booked,
        (select count(*)::int from outreach_events e where e.event_type = 'closed_won' and (e.occurred_at at time zone '${TZ}')::date = days.d) closed
      from days order by days.d`),
    sql<{ label: string; value: number }>(`select source label, count(*)::int value from organizations group by 1 order by 2 desc limit 6`),
    sql<{ label: string; value: number }>(`select coalesce(city,'Unknown') label, count(*)::int value from organizations group by 1 order by 2 desc limit 7`),
    sql<{ label: string; value: number }>(`select coalesce(business_type,'Unclassified') label, count(*)::int value from organizations group by 1 order by 2 desc limit 8`),
    sql<{ label: string; value: number }>(`select score_band label, count(*)::int value from organizations group by 1 order by case score_band when 'Priority' then 1 when 'Good' then 2 when 'Review' then 3 else 4 end`),
    sql<Record<string, any>>(`select o.id, o.company_name, o.city, o.business_type, o.lead_score, c.full_name, c.title
       from approval_queue q join organizations o on o.id = q.organization_id left join contacts c on c.id = q.contact_id
       where q.status = 'Needs Review' order by o.lead_score desc, q.queued_at desc limit 6`),
    sql<Record<string, any>>(`select o.id, o.company_name, o.city, o.business_type, o.lead_score, o.created_at from organizations o
       where o.lead_score >= 80 and o.pipeline_status <> 'Suppressed' order by o.created_at desc limit 6`),
    sql<Record<string, any>>(`select e.occurred_at, e.reply_classification, e.reply_preview, o.company_name from outreach_events e
       left join organizations o on o.id = e.organization_id where e.event_type = 'reply' order by e.occurred_at desc limit 5`),
    sql<Record<string, any>>(`select automation_type, status, started_at, finished_at, unique_businesses, queued from automation_runs order by started_at desc limit 1`),
  ]);
  return { k, series, bySource, byCity, byType, scoreDist, queue, highScore, replies, lastRun: runs[0] };
}

export default async function Dashboard() {
  let d: Awaited<ReturnType<typeof load>>;
  try { d = await load(); } catch (e) { return <><Head /><DbError error={e} /></>; }
  const { k } = d;
  const senderConnected = k.sent_total > 0 || k.campaigns > 0;

  return (
    <>
      <Head />

      {!senderConnected && (
        <div className="notice info"><div><b>Outreach is not connected yet.</b>Sent, reply, meeting and revenue figures stay blank until a sender is connected and approved campaigns run. No numbers on this page are estimated.</div></div>
      )}

      <section className="kpis" aria-label="Key metrics">
        <Kpi label="Total Leads" value={k.total.toLocaleString()} sub={`${k.week} in last 7 days`} href="/leads" />
        <Kpi label="Leads Found Today" value={k.today.toLocaleString()} href="/leads?found=today" />
        <Kpi label="Qualified Leads" value={k.qualified.toLocaleString()} sub={`score ≥ 65 · ${pct(k.qualified, k.total)}`} href="/leads?min=65" />
        <Kpi label="Verified Contacts" value={k.verified.toLocaleString()} sub={`${pct(k.verified, k.total)} of companies`} href="/leads?verified=1" />
        <Kpi label="Needs Approval" value={k.review.toLocaleString()} sub="morning review" href="/approval" />
        <Kpi label="Approved" value={k.approved.toLocaleString()} sub="ready for a campaign" href="/leads?approval=Approved" />
        <Kpi label="Emails Sent Today" value={senderConnected ? k.sent_today.toLocaleString() : "Not connected"} na={!senderConnected} />
        <Kpi label="Replies" value={senderConnected ? k.replies.toLocaleString() : "—"} na={!senderConnected} sub={senderConnected ? `${pct(k.replies, k.contacted)} reply rate` : undefined} href="/replies" />
        <Kpi label="Positive Replies" value={senderConnected ? k.positive.toLocaleString() : "—"} na={!senderConnected} />
        <Kpi label="Meetings Booked" value={senderConnected ? k.meetings.toLocaleString() : "—"} na={!senderConnected} />
        <Kpi label="Closed Clients" value={senderConnected ? k.closed.toLocaleString() : "—"} na={!senderConnected} />
        <Kpi label="Revenue" value={senderConnected ? money(k.revenue) : "—"} na={!senderConnected} />
      </section>

      <section className="panel outcomes" aria-label="Outcomes">
        <Outcome icon="reply" label="Positive Reply Rate" value={senderConnected ? pct(k.positive, k.contacted) : "—"} />
        <Outcome icon="cal" label="Meetings Booked" value={senderConnected ? String(k.meetings) : "—"} />
        <Outcome icon="check" label="Closed Clients" value={senderConnected ? String(k.closed) : "—"} />
        <Outcome icon="usd" label="Revenue" value={senderConnected ? money(k.revenue) : "—"} />
      </section>

      <div className="grid g-main">
        <Panel title="Pipeline over time" sub="Last 30 days · leads found, and outreach outcomes once a sender is connected">
          <LineChart
            labels={d.series.map((s) => s.d)}
            series={[
              { name: "Leads found", color: "var(--series-5)", values: d.series.map((s) => s.found) },
              { name: "Contacted", color: "var(--series-1)", values: d.series.map((s) => s.contacted) },
              { name: "Replied", color: "var(--series-4)", values: d.series.map((s) => s.replied) },
              { name: "Positive", color: "var(--series-2)", values: d.series.map((s) => s.positive) },
              { name: "Booked", color: "var(--series-3)", values: d.series.map((s) => s.booked) },
            ]}
          />
        </Panel>
        <Panel title="Lead funnel" sub="Every stage is counted from the database">
          <Funnel steps={[
            { label: "Found", value: k.total }, { label: "Qualified", value: k.qualified }, { label: "Verified", value: k.verified },
            { label: "Approved", value: k.approved }, { label: "Contacted", value: k.contacted }, { label: "Replied", value: k.replies },
            { label: "Meeting", value: k.meetings }, { label: "Customer", value: k.closed },
          ]} />
        </Panel>
      </div>

      <div className="grid g-2">
        <Panel title="Morning Approval Queue" sub="Highest scores first" action={<Link className="link small" href="/approval">Review all →</Link>}>
          {d.queue.length === 0 ? <Empty title="Nothing waiting for review">New qualified leads land here after each Getlead run.</Empty> :
            <div className="list">{d.queue.map((q) => (
              <Link className="list-row" key={q.id} href={`/approval#${q.id}`}>
                <div><div className="cell-main">{q.company_name}</div><div className="cell-sub">{[q.full_name, q.title].filter(Boolean).join(" · ") || "No contact"} · {q.city || "—"} · {q.business_type}</div></div>
                <ScorePill score={q.lead_score} />
              </Link>))}
            </div>}
        </Panel>
        <Panel title="Mailbox & Domain Health" sub="From the last InboxKit sync" action={<Link className="link small" href="/mailboxes">Details →</Link>}>
          {k.mailboxes === 0 && k.domains === 0 ? <Empty title="No infrastructure synced yet">Run an InboxKit sync to show real domain and mailbox status.</Empty> : (
            <dl className="kv">
              <dt>Sending domains</dt><dd><b>{k.domains}</b> · {k.domains_healthy} DNS-healthy</dd>
              <dt>Mailboxes</dt><dd><b>{k.mailboxes}</b> · {k.mailboxes_connected} connected to a sender</dd>
              <dt>Warmup</dt><dd>{k.mailboxes_connected === 0 ? <StatusBadge value="Not started" /> : "See Mailboxes"}</dd>
              <dt>Sending capacity</dt><dd>{k.mailboxes_connected === 0 ? "0 / day — no mailbox can send yet" : "See Mailboxes"}</dd>
            </dl>)}
        </Panel>
      </div>

      <div className="grid g-3">
        <Panel title="Leads by business type"><Bars items={d.byType} /></Panel>
        <Panel title="Leads by city"><Bars items={d.byCity} /></Panel>
        <Panel title="Score distribution" sub="Priority 80+ · Good 65–79 · Review 50–64 · Hold <50"><Bars items={d.scoreDist} /></Panel>
      </div>

      <div className="grid g-3">
        <Panel title="Recent high-score leads" action={<Link className="link small" href="/leads?min=80">All →</Link>}>
          {d.highScore.length === 0 ? <Empty title="No Priority leads yet" /> :
            <div className="list">{d.highScore.map((o) => (
              <Link className="list-row" key={o.id} href={`/leads?open=${o.id}`}><div><div className="cell-main">{o.company_name}</div><div className="cell-sub">{o.city} · {o.business_type}</div></div><ScorePill score={o.lead_score} /></Link>))}</div>}
        </Panel>
        <Panel title="Recent replies" action={<Link className="link small" href="/replies">All →</Link>}>
          {d.replies.length === 0 ? <Empty title="No replies yet">Replies appear once a sender is connected and syncing.</Empty> :
            <div className="list">{d.replies.map((r, i) => (<div className="list-row" key={i}><div><div className="cell-main">{r.company_name}</div><div className="cell-sub">{r.reply_preview}</div></div><StatusBadge value={r.reply_classification} /></div>))}</div>}
        </Panel>
        <Panel title="Automation" action={<Link className="link small" href="/automations">Runs →</Link>}>
          <dl className="kv">
            <dt>Last run</dt><dd>{d.lastRun ? <>{d.lastRun.automation_type.replace(/_/g, " ")} · <StatusBadge value={d.lastRun.status} /> · {new Date(d.lastRun.started_at).toLocaleString("en-US", { timeZone: TZ })}</> : "No runs yet"}</dd>
            <dt>Last run added</dt><dd>{d.lastRun ? `${d.lastRun.unique_businesses} new · ${d.lastRun.queued} queued` : "—"}</dd>
            <dt>Next run</dt><dd>Daily engine off (enable in Settings after the 100-lead pilot)</dd>
            <dt>Sources</dt><dd>{d.bySource.length ? d.bySource.map((s) => `${s.label} ${s.value}`).join(" · ") : "—"}</dd>
          </dl>
        </Panel>
      </div>

      <Panel title="Claude recommendations" sub="Evidence-based only — generated from real outcomes">
        <Empty title="Not enough outcome data yet">Recommendations need sends, replies and meetings by segment. Until then, review lead quality on Analytics.</Empty>
      </Panel>
    </>
  );
}

function Head() {
  return (
    <div className="page-head">
      <div><h1>Dashboard</h1><p className="muted">What happened, what needs attention, and what to do next.</p></div>
      <div className="actions">
        <Link className="btn primary" href="/find-leads">+ Find Leads</Link>
        <Link className="btn" href="/approval">Review Leads</Link>
        <Link className="btn" href="/campaigns">Create Campaign</Link>
        <Link className="btn" href="/automations">Run Lead Engine</Link>
      </div>
    </div>
  );
}

const ICONS: Record<string, string> = {
  reply: "M4 12l6-6v4c6 0 10 3 10 9-2-4-5-5-10-5v4z",
  cal: "M5 7h14v12H5zM5 11h14M9 4v4M15 4v4",
  check: "M5 12.5l4.5 4.5L19 7.5",
  usd: "M12 4v16M16 7.5c-1-1.2-2.3-1.7-4-1.7-2.2 0-3.7 1.1-3.7 2.8 0 4 7.9 2 7.9 6.3 0 1.8-1.6 3-4.1 3-1.8 0-3.3-.6-4.3-1.9",
};
function Outcome({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <div className="outcome">
      <span className="outcome-icon" aria-hidden="true"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d={ICONS[icon]} /></svg></span>
      <div><b className="num">{value}</b><span>{label}</span></div>
    </div>
  );
}
