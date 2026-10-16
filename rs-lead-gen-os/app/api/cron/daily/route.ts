import { NextResponse } from "next/server";
import { hasMachineSecret } from "@/lib/auth";
import { one } from "@/lib/db";
import { getleadConfigured } from "@/lib/providers/getlead";
import { buildGetleadFilters, type SearchState } from "@/lib/searchFilters";
import { runLeadSearch } from "@/lib/leadRun";
import { runRegistryWaterfall } from "@/lib/registry";
import { applyRamp, buildDailyBatch } from "@/lib/dailyBatch";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Pilot guardrail: each nightly search adds at most this many leads unless Settings raises it. */
const DEFAULT_NIGHTLY_MAX = 25;

/**
 * Daily Lead Engine, called by the Railway cron service with `Authorization: Bearer $CRON_SECRET`.
 * Pulls newly registered businesses (registry waterfall), then runs every saved search marked
 * "Run nightly", so new leads are waiting in the Approval Queue and New Businesses in the morning. Off until the schedule is enabled in Settings. Finds and queues only — never sends.
 */
export async function POST(req: Request) {
  if (!hasMachineSecret(req, "CRON_SECRET")) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const schedule = await one<{ value: { enabled?: boolean; max_per_search?: number } }>("select value from settings where key = 'schedule'");
  if (!schedule?.value?.enabled) return NextResponse.json({ ok: true, skipped: "schedule disabled in Settings" });
  if (!getleadConfigured()) return NextResponse.json({ ok: false, skipped: "Getlead server API not configured" }, { status: 503 });

  // New businesses first: registry pull → Getlead lookup → queue or call / visit list.
  let registry: unknown;
  try { registry = await runRegistryWaterfall("schedule", { daysBack: 3 }); } catch (e) { registry = { error: String((e as Error).message ?? e) }; }

  const saved = await one<{ value: Array<{ name: string; filters: SearchState }> }>("select value from settings where key = 'saved_searches'");
  const nightly = (saved?.value ?? []).filter((s) => s.filters?.nightly);

  const cap = Math.max(1, Math.min(500, Number(schedule.value.max_per_search) || DEFAULT_NIGHTLY_MAX));
  const results = [];
  for (const s of nightly) { // (none marked nightly → skipped; the daily batch below still fills itself)
    const f = s.filters;
    try {
      const { runId, summary } = await runLeadSearch(
        { filters: buildGetleadFilters(f), requestedCount: Math.min(cap, f.count ?? cap), queueThreshold: f.minScore ?? 65, requireVerifiedEmail: f.verified ?? true },
        "daily_lead_engine", "schedule", { savedSearch: s.name },
      );
      results.push({ search: s.name, runId, queued: summary.queued, new: summary.unique_businesses });
    } catch (e) {
      results.push({ search: s.name, error: String((e as Error).message ?? e) });
    }
  }
  // Weekly ramp (5→10→15→20→25 per mailbox, held if bounces ≥3%), then build today's batch for approval.
  let ramp: unknown, batch: unknown;
  try { ramp = await applyRamp(); } catch (e) { ramp = { error: String((e as Error).message ?? e) }; }
  try { batch = await buildDailyBatch(); } catch (e) { batch = { error: String((e as Error).message ?? e) }; }
  return NextResponse.json({ ok: results.every((r) => !("error" in r)), registry, results, ramp, batch });
}
