import Link from "next/link";
import { sql } from "@/lib/db";
import { DbError } from "@/components/ui";
import ApprovalQueue from "@/components/ApprovalQueue";

export const dynamic = "force-dynamic";
const TABS = ["Needs Review", "Needs Research", "Approved", "Rejected", "Suppressed"];

export default async function Approval({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const tab = TABS.includes(sp.status ?? "") ? sp.status! : "Needs Review";
  try {
    const [items, counts] = await Promise.all([
      sql(`select o.id, o.company_name, o.business_type, o.city, o.lead_score, o.score_band, o.source, o.website, o.main_phone,
              c.full_name, c.title, c.email, c.email_status, c.phone, q.status, q.why_selected, q.queued_at,
              r.personalization_note, r.outreach_angle, r.confidence
         from approval_queue q join organizations o on o.id = q.organization_id
         left join contacts c on c.id = q.contact_id
         left join lateral (select personalization_note, outreach_angle, confidence from research where organization_id = o.id order by researched_at desc limit 1) r on true
        where q.status = $1 order by o.lead_score desc, q.queued_at asc limit 300`, [tab]),
      sql<{ status: string; n: number }>(`select status, count(*)::int n from approval_queue group by 1`),
    ]);
    const n = Object.fromEntries(counts.map((c) => [c.status, c.n]));
    return (
      <>
        <div className="page-head">
          <div><h1>Approval Queue</h1><p className="muted">One decision per lead. Nothing reaches outreach without your approval. Keys: <span className="kbd">J</span>/<span className="kbd">K</span> move · <span className="kbd">A</span> approve · <span className="kbd">R</span> reject · <span className="kbd">S</span> suppress · <span className="kbd">O</span> open</p></div>
        </div>
        <nav className="chips" aria-label="Queue status">
          {TABS.map((t) => <Link key={t} className="chip" aria-pressed={t === tab} href={`/approval?status=${encodeURIComponent(t)}`}>{t} · {n[t] ?? 0}</Link>)}
        </nav>
        <ApprovalQueue items={items as never} tab={tab} />
      </>
    );
  } catch (e) {
    return <><div className="page-head"><h1>Approval Queue</h1></div><DbError error={e} /></>;
  }
}
