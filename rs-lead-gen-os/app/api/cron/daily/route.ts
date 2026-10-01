import { NextResponse } from "next/server";
import { hasMachineSecret } from "@/lib/auth";
import { one } from "@/lib/db";
import { getleadConfigured } from "@/lib/providers/getlead";

export const dynamic = "force-dynamic";

/**
 * Daily Lead Engine trigger. Disabled until (a) the schedule is enabled in Settings and
 * (b) the Getlead server API is configured. Never launches outreach.
 */
export async function POST(req: Request) {
  if (!hasMachineSecret(req, "CRON_SECRET")) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const schedule = await one<{ value: { enabled?: boolean } }>("select value from settings where key = 'schedule'");
  if (!schedule?.value?.enabled) return NextResponse.json({ ok: true, skipped: "schedule disabled in Settings" });
  if (!getleadConfigured()) return NextResponse.json({ ok: false, skipped: "Getlead server API not configured" }, { status: 503 });
  // Phase 7: run saved searches through /api/leads/search logic in a worker. Intentionally not auto-run yet.
  return NextResponse.json({ ok: false, skipped: "Daily engine worker not enabled yet (Phase 7)" }, { status: 501 });
}
