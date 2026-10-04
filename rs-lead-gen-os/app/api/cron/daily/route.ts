import { NextResponse } from "next/server";
import { hasMachineSecret } from "@/lib/auth";
import { one } from "@/lib/db";
import { getleadConfigured } from "@/lib/providers/getlead";
import { buildGetleadFilters, type SearchState } from "@/lib/searchFilters";
import { runLeadSearch } from "@/lib/leadRun";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Pilot guardrail: each nightly search adds at most this many leads unless Settings raises it. */
const DEFAULT_NIGHTLY_MAX = 25;

/**
 * Daily Lead Engine, called by the Railway cron service with `Authorization: Bearer $CRON_SECRET`.
 * Runs every saved search marked "Run nightly" so new leads are waiting in the Approval Queue in
 * the morning. Off until the schedule is enabled in Settings. Finds and queues only — never sends.
 */
export async function POST(req: Request) {
  if (!hasMachineSecret(req, "CRON_SECRET")) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const schedule = await one<{ value: { enabled?: boolean; max_per_search?: number } }>("select value from settings where key = 'schedule'");
  if (!schedule?.value?.enabled) return NextResponse.json({ ok: true, skipped: "schedule disabled in Settings" });
  if (!getleadConfigured()) return NextResponse.json({ ok: false, skipped: "Getlead server API not configured" }, { status: 503 });

  const saved = await one<{ value: Array<{ name: string; filters: SearchState }> }>("select value from settings where key = 'saved_searches'");
  const nightly = (saved?.value ?? []).filter((s) => s.filters?.nightly);
  if (!nightly.length) return NextResponse.json({ ok: true, skipped: "no saved search is marked Run nightly" });

  const cap = Math.max(1, Math.min(500, Number(schedule.value.max_per_search) || DEFAULT_NIGHTLY_MAX));
  const results = [];
  for (const s of nightly) {
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
  return NextResponse.json({ ok: results.every((r) => !("error" in r)), results });
}
