import { sql } from "@/lib/db";
import { DbError, Empty, Panel, StatusBadge } from "@/components/ui";
import CampaignPush from "@/components/CampaignPush";
import { instantly, instantlyConfigured, INSTANTLY_STATUS } from "@/lib/providers/instantly";

async function loadInstantly() {
  if (!instantlyConfigured()) return { connected: false as const };
  try {
    const items = await instantly.listCampaigns();
    return { connected: true as const, campaigns: items.map((c) => ({ id: c.id, name: c.name, status: INSTANTLY_STATUS[c.status] ?? String(c.status), senders: c.email_list?.length ?? 0 })) };
  } catch (e) { return { connected: true as const, error: (e as Error).message, campaigns: [] }; }
}

export const dynamic = "force-dynamic";

export default async function Campaigns() {
  try {
    const [campaigns, [{ approved }]] = await Promise.all([
      sql(`select c.*, (select count(*)::int from campaign_contacts cc where cc.campaign_id = c.id) leads,
             (select count(*)::int from outreach_events e where e.campaign_id = c.id and e.event_type = 'sent') sent,
             (select count(*)::int from outreach_events e where e.campaign_id = c.id and e.event_type = 'reply') replies,
             (select count(*)::int from outreach_events e where e.campaign_id = c.id and e.event_type = 'reply' and e.reply_classification = 'Positive') positive,
             (select count(*)::int from outreach_events e where e.campaign_id = c.id and e.event_type = 'meeting_booked') meetings,
             (select count(*)::int from outreach_events e where e.campaign_id = c.id and e.event_type = 'bounce') bounces,
             (select count(*)::int from outreach_events e where e.campaign_id = c.id and e.event_type = 'unsubscribe') unsubs,
             (select count(*)::int from outreach_events e where e.campaign_id = c.id and e.event_type = 'closed_won') closed,
             (select coalesce(sum(revenue),0)::float from outreach_events e where e.campaign_id = c.id and e.event_type = 'closed_won') revenue
           from campaigns c order by created_at desc`),
      sql<{ approved: number }>(`select count(*)::int approved from approval_queue where status = 'Approved'`),
    ]);
    const inst = await loadInstantly();
    return (
      <>
        <div className="page-head">
          <div><h1>Campaigns</h1><p className="muted">Approved leads → sender. Launching always requires your explicit approval.</p></div>
        </div>
        {inst.connected ? (
          <Panel title="Add approved leads to an Instantly campaign">
            {"error" in inst && inst.error && <div className="notice bad"><div><b>Instantly didn&rsquo;t respond</b>{inst.error}</div></div>}
            <p className="muted">{approved} approved lead{approved === 1 ? "" : "s"}. Only approved leads with a verified email that aren&rsquo;t suppressed get added. This never launches a campaign — you start it yourself in Instantly.</p>
            <CampaignPush campaigns={inst.campaigns} />
          </Panel>
        ) : (
        <div className="notice"><div>
          <b>No sender is connected to this dashboard yet.</b>
          Getlead does not send cold email (its outreach hooks are HeyReach for LinkedIn and Smartlead for website-visitor leads only). The recommended sender is the Instantly workspace R&amp;S already has, with InboxKit mailboxes exported into it. Once you choose, this page gets the campaign builder (name, audience, mailboxes, daily limit, follow-ups, sending window, start date, Claude personalization, approval before launch) and live sync. {approved} approved lead{approved === 1 ? " is" : "s are"} ready.
        </div></div>
        )}
        <Panel title="Campaigns" pad={false}>
          {campaigns.length === 0 ? <Empty title="No campaigns yet" /> : (
            <div className="table-wrap"><table>
              <thead><tr><th>Campaign</th><th>Status</th><th>Leads</th><th>Sent</th><th>Replies</th><th>Positive</th><th>Meetings</th><th>Bounces</th><th>Unsubs</th><th>Closed</th><th>Revenue</th></tr></thead>
              <tbody>{campaigns.map((c: any) => (
                <tr key={c.id}><td className="cell-main">{c.name}</td><td><StatusBadge value={c.status} /></td>
                  {["leads", "sent", "replies", "positive", "meetings", "bounces", "unsubs", "closed"].map((k) => <td key={k} className="num">{c[k]}</td>)}
                  <td className="num">${Math.round(c.revenue).toLocaleString()}</td></tr>))}</tbody>
            </table></div>)}
        </Panel>
      </>
    );
  } catch (e) { return <><h1>Campaigns</h1><DbError error={e} /></>; }
}
