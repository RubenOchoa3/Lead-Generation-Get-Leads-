import type { Db } from "./db";

export type Decision = "approve" | "reject" | "suppress" | "needs_research" | "reopen";

/** Apply an owner decision to an organization's queue entry. Rejected/suppressed leads can never enter outreach. */
export async function decide(db: Db, orgId: string, decision: Decision, opts: { reason?: string; by?: string } = {}) {
  const status = { approve: "Approved", reject: "Rejected", suppress: "Suppressed", needs_research: "Needs Research", reopen: "Needs Review" }[decision];
  const pipeline = { approve: "Approved", reject: "Rejected", suppress: "Suppressed", needs_research: "Qualified", reopen: "Qualified" }[decision];
  await db.query(
    `insert into approval_queue (organization_id, contact_id, status, reviewed_at, reviewed_by, rejection_reason, why_selected)
     values ($1, (select id from contacts where organization_id = $1 and is_primary limit 1), $2, now(), $3, $4, 'Added manually')
     on conflict (organization_id) do update set status = $2, reviewed_at = now(), reviewed_by = $3,
       rejection_reason = coalesce($4, approval_queue.rejection_reason)`,
    [orgId, status, opts.by ?? "owner", opts.reason ?? null],
  );
  await db.query(`update organizations set pipeline_status = $2, updated_at = now() where id = $1`, [orgId, pipeline]);
  if (decision === "suppress") {
    await db.query(
      `insert into suppression_list (organization_id, domain, suppression_type, reason, source)
       select o.id, o.domain, 'manual', $2, 'owner' from organizations o where o.id = $1
       and not exists (select 1 from suppression_list s where s.organization_id = $1 and s.suppression_type = 'manual')`,
      [orgId, opts.reason ?? "Owner suppressed"],
    );
  }
}
