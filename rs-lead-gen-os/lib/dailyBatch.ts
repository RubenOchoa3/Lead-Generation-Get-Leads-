import { db, one, sql } from "@/lib/db";
import { decide } from "@/lib/decisions";
import { runLeadSearch } from "@/lib/leadRun";
import { buildGetleadFilters } from "@/lib/searchFilters";
import { DEFAULT_COOLDOWN_DAYS, LOCAL_MAX_EMPLOYEES, pushApprovedToCampaign } from "@/lib/outreach";
import { getleadConfigured } from "@/lib/providers/getlead";
import { instantly, instantlyConfigured, resumeIfCompleted, setAccountDailyLimit, setCampaignDailyLimit } from "@/lib/providers/instantly";

/**
 * Daily send batch + weekly ramp.
 * Each morning: pick today's leads (90% local, 10% big companies), show the owner the people and
 * the exact emails, and add them to the active Instantly campaigns only after he approves.
 * Each week: raise the per-mailbox cap (5 → 10 → 15 → 20 → 25) unless bounces say slow down.
 */
export type OutreachSettings = {
  local_campaign_id: string;
  big_campaign_id: string;
  start_date: string;        // YYYY-MM-DD, first sending day
  ramp: number[];            // per-mailbox daily cap by week
  mailboxes: number;
  big_share: number;         // 0.10 = 10% to big companies
  applied_per_mailbox?: number;
  fill_offsets?: { local?: number; big?: number };
  /** Only email companies based in these cities (empty = anywhere in California). */
  target_hq_cities?: string[];
  /** Big-company experiment paused: the whole daily cap goes to local businesses. */
  big_paused?: boolean;
  /** Which target the saved fill offsets belong to; a new target restarts paging from 0. */
  fill_target_key?: string;
};

/** Kern County towns — companies headquartered here are truly local to R&S. */
export const KERN_CITIES = ["Bakersfield", "Delano", "Tehachapi", "Ridgecrest", "Wasco", "Shafter", "Arvin", "McFarland", "Taft",
  "California City", "Lamont", "Frazier Park", "Mojave", "Lake Isabella", "Rosamond", "Oildale", "Kernville", "Buttonwillow", "Maricopa", "Boron"];

export const DEFAULT_OUTREACH: OutreachSettings = {
  local_campaign_id: "65e5efa2-4d18-4f38-a632-9d1a292369e2",
  big_campaign_id: "59861f3c-357f-45ba-abda-631d90dd84b3",
  start_date: "2026-10-06",
  ramp: [5, 10, 15, 20, 25],
  mailboxes: 18,
  big_share: 0.1,
  target_hq_cities: KERN_CITIES,
  big_paused: true,
};

const areaOf = (s: OutreachSettings) => (s.target_hq_cities ?? []).map((c) => c.toLowerCase());
/** Daily split: everything to local while the big-company test is paused. */
export function armTargets(s: OutreachSettings, total: number) {
  const big = s.big_paused ? 0 : Math.round(total * s.big_share);
  return { local: total - big, big };
}

export async function getOutreachSettings(): Promise<OutreachSettings> {
  const row = await one<{ value: Partial<OutreachSettings> }>("select value from settings where key = 'outreach'");
  return { ...DEFAULT_OUTREACH, ...(row?.value ?? {}) };
}
async function saveOutreachSettings(s: OutreachSettings) {
  await sql(`insert into settings (key, value, updated_at) values ('outreach', $1, now()) on conflict (key) do update set value = $1, updated_at = now()`, [JSON.stringify(s)]);
}

/** Today's date in Pacific time (sending happens in Pacific business hours). */
export function pacificToday(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles" }).format(now);
}

/** Ramp step for a date: week 1 = ramp[0] … capped at the last step. */
export function rampStep(s: Pick<OutreachSettings, "start_date" | "ramp">, date: string) {
  const days = Math.floor((Date.parse(date) - Date.parse(s.start_date)) / 864e5);
  const week = Math.max(0, Math.floor(days / 7));
  return { week: week + 1, perMailbox: s.ramp[Math.min(week, s.ramp.length - 1)] };
}

/** Bounce rate over the last 7 days (needs ≥ 50 sends to count). */
async function recentHealth() {
  const r = await one<{ sent: number; bounced: number; complaints: number }>(
    `select count(*) filter (where event_type = 'sent')::int sent, count(*) filter (where event_type = 'bounce')::int bounced,
            count(*) filter (where event_type = 'complaint')::int complaints
       from outreach_events where provider = 'Instantly' and occurred_at > now() - interval '7 days'`);
  const sent = r?.sent ?? 0, bounced = r?.bounced ?? 0;
  const bounceRate = sent >= 50 ? bounced / sent : 0;
  return { sent, bounced, bounceRate, complaints: r?.complaints ?? 0, healthy: bounceRate < 0.03 && (r?.complaints ?? 0) === 0 };
}

/**
 * Apply this week's cap to every sending mailbox and split it 90/10 across the two campaigns.
 * Holds at last week's level if bounces ≥ 3% or there were spam complaints.
 */
export async function applyRamp(date = pacificToday()) {
  const s = await getOutreachSettings();
  const { week, perMailbox: planned } = rampStep(s, date);
  const health = await recentHealth();
  const prev = s.applied_per_mailbox ?? s.ramp[0];
  const perMailbox = planned > prev && !health.healthy ? prev : planned;
  const total = perMailbox * s.mailboxes;
  const { big } = armTargets(s, total);
  const result = { week, planned, perMailbox, total, local: total - big, big, health, changed: perMailbox !== s.applied_per_mailbox, errors: [] as string[] };
  if (!result.changed || !instantlyConfigured()) return result;
  const camps = await instantly.listCampaigns();
  const senders = new Set(camps.filter((c) => c.id === s.local_campaign_id || c.id === s.big_campaign_id).flatMap((c) => c.email_list ?? []));
  for (const email of senders) {
    if (/@rscentralvalleycleaning\.com$/i.test(email)) continue; // main domain is never a sender
    try { await setAccountDailyLimit(email, perMailbox); } catch (e) { result.errors.push(`${email}: ${(e as Error).message}`); }
  }
  try { await setCampaignDailyLimit(s.local_campaign_id, result.local); if (result.big > 0) await setCampaignDailyLimit(s.big_campaign_id, result.big); }
  catch (e) { result.errors.push(`campaign limits: ${(e as Error).message}`); }
  if (!result.errors.length) await saveOutreachSettings({ ...s, applied_per_mailbox: perMailbox });
  console.log(`[ramp] ${JSON.stringify({ ...result, health: { ...health } })}`);
  return result;
}

type Candidate = { contact_id: string; organization_id: string };

/**
 * Every lead already in the platform that could go out today: primary contact with a VALID email,
 * not rejected/suppressed by the owner, not bounced/opted out, not in a campaign within the cooldown.
 * Includes leads that never entered the Approval Queue (scored under the queue threshold) — the owner
 * still approves each daily batch. Best scores first.
 */
const POOL_SQL = `
       from organizations o
       join contacts c on c.organization_id = o.id and c.is_primary
       left join approval_queue q on q.organization_id = o.id
      where coalesce(q.status, 'Needs Review') in ('Needs Review','Approved')`;
const POOL_FILTERS = `
        and c.email is not null and upper(coalesce(c.email_status,'')) = 'VALID'
        and coalesce(o.business_type,'') <> 'Janitorial competitor'
        and not exists (select 1 from suppression_list s where s.organization_id = o.id or (s.email is not null and lower(s.email) = lower(c.email)))
        and not exists (select 1 from outreach_events e where e.contact_id = c.id and e.event_type in ('bounce','complaint','unsubscribe'))`;
const ARM_EXPR = `(case when coalesce(substring(replace(coalesce(o.employee_range,''), ',', '') from '[0-9]+'), '0')::int > ${LOCAL_MAX_EMPLOYEES} then 'big' else 'local' end)`;

const AREA_SQL = (n: number) => `and (cardinality($${n}::text[]) = 0 or lower(coalesce(o.city,'')) = any($${n}::text[]))`;

async function candidates(arm: "local" | "big", limit: number, exclude: string[], area: string[] = []) {
  if (limit <= 0) return [] as Candidate[];
  return sql<Candidate>(
    `select c.id contact_id, o.id organization_id ${POOL_SQL}
        ${POOL_FILTERS}
        and ${ARM_EXPR} = $1
        and not exists (select 1 from campaign_contacts cc where cc.contact_id = c.id and cc.added_at > now() - make_interval(days => $2))
        and not exists (select 1 from daily_batch_items i join daily_batches b on b.id = i.batch_id where i.contact_id = c.id and b.status = 'ready')
        and not (c.id = any($3::uuid[]))
        ${AREA_SQL(5)}
      order by o.lead_score desc nulls last
      limit $4`,
    [arm, DEFAULT_COOLDOWN_DAYS, exclude, limit, area],
  );
}

/** How many existing leads are ready to email, by group (shown on Today's Send). */
export async function poolCounts() {
  const area = areaOf(await getOutreachSettings());
  const rows = await sql<{ arm: string; n: number }>(
    `select ${ARM_EXPR} arm, count(*)::int n ${POOL_SQL} ${POOL_FILTERS}
        and not exists (select 1 from campaign_contacts cc where cc.contact_id = c.id and cc.added_at > now() - make_interval(days => $1))
        and not exists (select 1 from daily_batch_items i join daily_batches b on b.id = i.batch_id where i.contact_id = c.id and b.status = 'ready')
        ${AREA_SQL(2)}
      group by 1`, [DEFAULT_COOLDOWN_DAYS, area]);
  return { local: rows.find((r) => r.arm === "local")?.n ?? 0, big: rows.find((r) => r.arm === "big")?.n ?? 0 };
}

/** Top up the pool with a fresh Getlead search when there aren't enough leads waiting. */
async function fill(arm: "local" | "big", need: number, s: OutreachSettings) {
  if (!getleadConfigured() || need <= 0) return 0;
  const area = s.target_hq_cities ?? [];
  // Targeted area: every company based there with a verified email (no industry/title filter — any business needs cleaning).
  const filters: Record<string, unknown> = area.length
    ? { countries: ["United States"], states: ["California"], headquarters_cities: area, email_status: ["VALID"], employees_max: LOCAL_MAX_EMPLOYEES }
    : buildGetleadFilters({ state: "California", cities: [] });
  if (arm === "big") { delete filters.employees_max; filters.employees_min = LOCAL_MAX_EMPLOYEES + 1; }
  const key = area.join("|");
  if (s.fill_target_key !== key) { s.fill_offsets = {}; s.fill_target_key = key; }
  const startOffset = s.fill_offsets?.[arm] ?? 0;
  const { summary, nextOffset } = await runLeadSearch(
    { filters, requestedCount: Math.min(500, need * 3), queueThreshold: 50, requireVerifiedEmail: true, startOffset },
    `daily_fill_${arm}`, "schedule", { arm, need, startOffset });
  s.fill_offsets = { ...(s.fill_offsets ?? {}), [arm]: nextOffset };
  await saveOutreachSettings(s);
  return summary.queued;
}

/** Build (once) today's batch. Safe to call again — returns the existing batch. */
/** Leads added to this Instantly campaign in the last two weeks that it hasn't sent to yet. */
async function waitingInCampaign(externalId: string) {
  if (!externalId) return 0;
  const r = await one<{ n: number }>(
    `select count(*)::int n from campaign_contacts cc join campaigns cp on cp.id = cc.campaign_id
      where cp.provider = 'Instantly' and cp.external_id = $1 and cc.added_at > now() - interval '14 days'
        and not exists (select 1 from outreach_events e where e.contact_id = cc.contact_id and e.event_type in ('sent','bounce'))`,
    [externalId]);
  return r?.n ?? 0;
}

export async function buildDailyBatch(date = pacificToday()) {
  const existing = await one<{ id: string }>("select id from daily_batches where batch_date = $1", [date]);
  if (existing) return { batchId: existing.id, created: false };
  const s = await getOutreachSettings();
  const perMailbox = s.applied_per_mailbox ?? rampStep(s, date).perMailbox;
  const target = perMailbox * s.mailboxes;
  const { local: localTarget, big: bigTarget } = armTargets(s, target);
  const area = areaOf(s);
  const picked: Record<"local" | "big", Candidate[]> = { local: [], big: [] };
  const notes: string[] = [];
  // Leads approved earlier that the campaign hasn't sent yet go out first, so only top up to today's cap.
  const waiting = { local: await waitingInCampaign(s.local_campaign_id), big: await waitingInCampaign(s.big_campaign_id) };
  if (waiting.local + waiting.big) notes.push(`${waiting.local + waiting.big} approved earlier still waiting to send (${waiting.local} local, ${waiting.big} big) — they go out first`);
  for (const [arm, full] of [["local", localTarget], ["big", bigTarget]] as const) {
    const want = Math.max(0, full - waiting[arm]);
    picked[arm] = await candidates(arm, want, [], area);
    if (picked[arm].length < want) {
      try { await fill(arm, want - picked[arm].length, s); } catch (e) { notes.push(`${arm} search: ${(e as Error).message}`); }
      picked[arm].push(...await candidates(arm, want - picked[arm].length, picked[arm].map((c) => c.contact_id), area));
    }
    if (want > 0 && picked[arm].length < want) notes.push(`only ${picked[arm].length}/${want} ${arm} leads available`);
  }
  const { rows: [b] } = await db.query<{ id: string }>(
    `insert into daily_batches (batch_date, target, per_mailbox, note) values ($1,$2,$3,$4) returning id`,
    [date, target, perMailbox, notes.join("; ") || null]);
  for (const arm of ["local", "big"] as const) {
    for (const c of picked[arm]) {
      await db.query(`insert into daily_batch_items (batch_id, contact_id, organization_id, arm) values ($1,$2,$3,$4) on conflict do nothing`,
        [b.id, c.contact_id, c.organization_id, arm]);
    }
  }
  console.log(`[daily-batch] ${date}: local ${picked.local.length}/${localTarget}, big ${picked.big.length}/${bigTarget}${notes.length ? ` — ${notes.join("; ")}` : ""}`);
  return { batchId: b.id, created: true };
}

/** Owner approved: approve each lead, then add them to the right campaign (they send in the next window). */
export async function approveAndSend(batchId: string, excludeContactIds: string[] = []) {
  const batch = await one<{ id: string; status: string }>("select id, status from daily_batches where id = $1", [batchId]);
  if (!batch) throw new Error("Batch not found");
  if (batch.status !== "ready") throw new Error(`This batch was already ${batch.status}.`);
  const s = await getOutreachSettings();
  if (excludeContactIds.length) await db.query(`update daily_batch_items set included = false where batch_id = $1 and contact_id = any($2::uuid[])`, [batchId, excludeContactIds]);
  const items = await sql<{ contact_id: string; organization_id: string; arm: "local" | "big" }>(
    `select contact_id, organization_id, arm from daily_batch_items where batch_id = $1 and included`, [batchId]);
  for (const i of items) await decide(db, i.organization_id, "approve", { by: "owner (daily batch)" });
  const summary: Record<string, unknown> = {};
  for (const arm of ["local", "big"] as const) {
    const ids = items.filter((i) => i.arm === arm).map((i) => i.contact_id);
    if (!ids.length) continue;
    const r = await pushApprovedToCampaign(db, instantly, arm === "local" ? s.local_campaign_id : s.big_campaign_id,
      { dryRun: false, contactIds: ids, allowLarge: arm === "big" });
    let resumed = false;
    if (r.added > 0 && arm === "local") {
      try { resumed = await resumeIfCompleted(s.local_campaign_id); } catch (e) { console.error(`[daily-batch] resume local campaign: ${(e as Error).message}`); }
    }
    summary[arm] = { added: r.added, blocked: r.blocked.length, skippedBySender: r.skippedBySender, ...(resumed ? { resumed } : {}) };
  }
  await db.query(`update daily_batches set status = 'sent', sent_at = now(), sent_summary = $2 where id = $1`, [batchId, JSON.stringify(summary)]);
  return summary;
}
