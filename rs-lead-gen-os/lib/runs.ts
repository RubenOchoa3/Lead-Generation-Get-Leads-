import type { Db } from "./db";
import type { IngestSummary } from "./ingest";

export const STAGES = ["Searching", "Deduplicating", "Qualifying", "Decision Makers", "Verifying", "Researching", "Scoring", "Saving", "Queueing"] as const;

export class RunAlreadyActiveError extends Error {
  constructor(type: string) { super(`A ${type} run is already in progress. Wait for it to finish or cancel it on the Automations page.`); }
}

export async function startRun(db: Db, type: string, trigger: string, params: unknown) {
  try {
    const { rows } = await db.query<{ id: string }>(
      `insert into automation_runs (automation_type, trigger, params, stage) values ($1,$2,$3,'Searching') returning id`,
      [type, trigger, JSON.stringify(params ?? {})],
    );
    return rows[0].id;
  } catch (e) {
    if (String((e as Error).message).includes("automation_runs_one_running")) throw new RunAlreadyActiveError(type);
    throw e;
  }
}

export async function setStage(db: Db, runId: string, stage: string, logLine?: string) {
  await db.query(
    `update automation_runs set stage = $2, log = case when $3::text is null then log else log || jsonb_build_array(jsonb_build_object('at', now(), 'msg', $3::text)) end where id = $1`,
    [runId, stage, logLine ?? null],
  );
}

export async function finishRun(db: Db, runId: string, s: IngestSummary, extra: { matches?: number; usage?: unknown; status?: string; error?: string } = {}) {
  await db.query(
    `update automation_runs set status = $2, finished_at = now(), stage = 'Done',
        matches = coalesce($3, matches), businesses_found = businesses_found + $4, unique_businesses = unique_businesses + $5,
        duplicates_removed = duplicates_removed + $6, decision_makers = decision_makers + $7, verified_emails = verified_emails + $8,
        phones = phones + $9, linkedin_profiles = linkedin_profiles + $10, priority_count = priority_count + $11,
        good_count = good_count + $12, review_count = review_count + $13, queued = queued + $14, failed = failed + $15,
        provider_usage = coalesce($16::jsonb, provider_usage), error_summary = $17
      where id = $1`,
    [runId, extra.status ?? (s.errors.length && !s.unique_businesses && !s.duplicates_removed ? "failed" : "complete"), extra.matches ?? null,
      s.businesses_found, s.unique_businesses, s.duplicates_removed, s.decision_makers, s.verified_emails, s.phones,
      s.linkedin_profiles, s.priority, s.good, s.review, s.queued, s.errors.length,
      extra.usage ? JSON.stringify(extra.usage) : null, extra.error ?? (s.errors.length ? s.errors.slice(0, 10).join("\n") : null)],
  );
}

export async function failRun(db: Db, runId: string, error: string) {
  await db.query(`update automation_runs set status = 'failed', finished_at = now(), error_summary = $2 where id = $1`, [runId, error.slice(0, 2000)]);
}
