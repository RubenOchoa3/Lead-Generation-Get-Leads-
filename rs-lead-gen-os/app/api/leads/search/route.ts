import { NextResponse } from "next/server";
import { z } from "zod";
import { db, tx } from "@/lib/db";
import { getleadSearch, getleadConfigured, mapGetleadRow, GetleadNotConfiguredError } from "@/lib/providers/getlead";
import { ingestBatch, emptySummary } from "@/lib/ingest";
import { startRun, setStage, finishRun, failRun, RunAlreadyActiveError } from "@/lib/runs";

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

  let runId: string;
  try { runId = await startRun(db, "manual_search", "manual", input); }
  catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: e instanceof RunAlreadyActiveError ? 409 : 500 }); }

  const total = emptySummary();
  let credits = 0;
  try {
    let offset = 0;
    while (total.received < input.requestedCount) {
      await setStage(db, runId, "Searching", `offset ${offset}`);
      const page = await getleadSearch(input.filters, Math.min(100, input.requestedCount - total.received), offset);
      credits += page.query_credits_used ?? 0;
      const prospects = page.contacts.map(mapGetleadRow).filter((p): p is NonNullable<typeof p> => p !== null);
      await setStage(db, runId, "Deduplicating");
      const s = await tx((c) => ingestBatch(c, prospects, { queueThreshold: input.queueThreshold, requireVerifiedEmail: input.requireVerifiedEmail, runId, query: input.filters }));
      for (const k of Object.keys(total) as (keyof typeof total)[]) {
        if (k === "errors") total.errors.push(...s.errors); else (total[k] as number) += s[k] as number;
      }
      total.received += page.contacts.length - prospects.length; // count rows without a company too
      if (!page.has_more || !page.contacts.length) break;
      offset = page.next_offset ?? offset + page.contacts.length;
    }
    await finishRun(db, runId, total, { usage: { getlead_credits: credits } });
    return NextResponse.json({ runId, summary: total });
  } catch (e) {
    await failRun(db, runId, String((e as Error).message ?? e));
    return NextResponse.json({ runId, error: String((e as Error).message ?? e) }, { status: 502 });
  }
}
