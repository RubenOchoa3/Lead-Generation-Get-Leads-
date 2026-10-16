import { sql } from "@/lib/db";
import { DbError, Empty, Panel, ScorePill, StatusBadge } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function Replies() {
  try {
    const rows = await sql(`select e.id, e.occurred_at, e.reply_preview, e.reply_classification, c.full_name, o.company_name, o.lead_score, cp.name campaign
      from outreach_events e left join contacts c on c.id = e.contact_id left join organizations o on o.id = e.organization_id
      left join campaigns cp on cp.id = e.campaign_id where e.event_type = 'reply' order by e.occurred_at desc limit 200`);
    return (
      <>
        <div className="page-head"><div><h1>Replies</h1><p className="muted">Synced from the sender once connected. Classification: Positive · Neutral · Not Interested · Referral · Out of Office · Unsubscribe · Other.</p></div></div>
        <Panel title="Inbox" pad={false}>
          {rows.length === 0 ? <Empty title="No replies synced">This view fills from the connected sender&rsquo;s reply data. It won&rsquo;t show placeholder conversations.</Empty> : (
            <div className="table-wrap"><table>
              <thead><tr><th>Contact</th><th>Company</th><th>Campaign</th><th>Reply</th><th>Class</th><th>Date</th><th>Score</th></tr></thead>
              <tbody>{rows.map((r: any) => (<tr key={r.id}><td>{r.full_name}</td><td className="cell-main">{r.company_name}</td><td>{r.campaign}</td><td className="wrap">{r.reply_preview}</td><td><StatusBadge value={r.reply_classification} /></td><td className="num">{new Date(r.occurred_at).toLocaleDateString()}</td><td><ScorePill score={r.lead_score} /></td></tr>))}</tbody>
            </table></div>)}
        </Panel>
      </>
    );
  } catch (e) { return <><h1>Replies</h1><DbError error={e} /></>; }
}
