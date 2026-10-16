import { NextResponse } from "next/server";
import { z } from "zod";
import { getleadConfigured, GetleadNotConfiguredError } from "@/lib/providers/getlead";
import { RunAlreadyActiveError } from "@/lib/runs";
import { runLeadSearch } from "@/lib/leadRun";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const schema = z.object({
  filters: z.record(z.string(), z.any()),
  requestedCount: z.number().int().min(1).max(500),
  queueThreshold: z.number().int().min(0).max(100).default(65),
  requireVerifiedEmail: z.boolean().default(true),
});

/** Server-side Getlead run (requires GETLEAD_API_KEY + GETLEAD_API_BASE). */
export async function POST(req: Request) {
  if (!getleadConfigured()) {
    return NextResponse.json({ error: new GetleadNotConfiguredError().message, notConfigured: true }, { status: 503 });
  }
  let input: z.infer<typeof schema>;
  try { input = schema.parse(await req.json()); } catch (e) { return NextResponse.json({ error: String(e) }, { status: 400 }); }

  try {
    return NextResponse.json(await runLeadSearch(input, "manual_search", "manual"));
  } catch (e) {
    const err = e as Error & { runId?: string };
    if (err instanceof RunAlreadyActiveError) return NextResponse.json({ error: err.message }, { status: 409 });
    return NextResponse.json({ runId: err.runId, error: String(err.message ?? e) }, { status: err.runId ? 502 : 500 });
  }
}
