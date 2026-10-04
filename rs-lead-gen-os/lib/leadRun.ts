import { db, tx } from "@/lib/db";
import { getleadSearch, mapGetleadRow } from "@/lib/providers/getlead";
import { ingestBatch, emptySummary } from "@/lib/ingest";
import { startRun, setStage, finishRun, failRun } from "@/lib/runs";

export type LeadRunInput = {
  filters: Record<string, unknown>;
  requestedCount: number;
  queueThreshold: number;
  requireVerifiedEmail: boolean;
};

/**
 * One GetLeads search run: page through results, dedupe, score and queue. Used by the Get Leads
 * button and the nightly Daily Lead Engine. Throws RunAlreadyActiveError if one of `type` is running.
 */
export async function runLeadSearch(input: LeadRunInput, type: string, trigger: string, params: unknown = input) {
  const runId = await startRun(db, type, trigger, params);
  const total = emptySummary();
  let credits = 0;
  try {
    let offset = 0;
    while (total.received < input.requestedCount) {
      await setStage(db, runId, "Searching", `offset ${offset}`);
      const t0 = Date.now();
      const page = await getleadSearch(input.filters, Math.min(100, input.requestedCount - total.received), offset);
      credits += page.query_credits_used ?? 0;
      const prospects = page.contacts.map(mapGetleadRow).filter((p): p is NonNullable<typeof p> => p !== null);
      // Field names only (no contact data) so a provider format change shows up in the logs.
      console.log(`[getlead] run ${runId} offset ${offset}: ${page.contacts.length} rows (${prospects.length} with a company) in ${Date.now() - t0}ms; ` +
        `with email ${prospects.filter((p) => p.contact?.email).length}, with title ${prospects.filter((p) => p.contact?.title).length}; ` +
        `keys: ${Object.keys(page.contacts[0] ?? {}).join(",")}`);
      await setStage(db, runId, "Deduplicating");
      const t1 = Date.now();
      const s = await tx((c) => ingestBatch(c, prospects, { queueThreshold: input.queueThreshold, requireVerifiedEmail: input.requireVerifiedEmail, runId, query: input.filters }));
      console.log(`[getlead] run ${runId} offset ${offset}: saved and scored in ${Date.now() - t1}ms`);
      for (const k of Object.keys(total) as (keyof typeof total)[]) {
        if (k === "errors") total.errors.push(...s.errors); else (total[k] as number) += s[k] as number;
      }
      total.received += page.contacts.length - prospects.length; // count rows without a company too
      if (!page.has_more || !page.contacts.length) break;
      offset = page.next_offset ?? offset + page.contacts.length;
    }
    await finishRun(db, runId, total, { usage: { getlead_credits: credits } });
    console.log(`[getlead] run ${runId} done: ${JSON.stringify({ ...total, errors: total.errors.length })}`);
    return { runId, summary: total };
  } catch (e) {
    await failRun(db, runId, String((e as Error).message ?? e));
    throw Object.assign(e as Error, { runId });
  }
}
