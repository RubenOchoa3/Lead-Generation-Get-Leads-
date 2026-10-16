import { NextResponse } from "next/server";
import { z } from "zod";
import { tx } from "@/lib/db";
import { ingestBatch } from "@/lib/ingest";
import { mapGetleadRow, type GetleadRow } from "@/lib/providers/getlead";
import { startRun, finishRun, failRun, setStage, RunAlreadyActiveError } from "@/lib/runs";
import { requireHumanOrMachine } from "@/lib/auth";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const schema = z.object({
  rows: z.array(z.record(z.string(), z.any())).min(1).max(5000),
  query: z.any().optional(),
  label: z.string().max(200).optional(),
  queueThreshold: z.number().int().min(0).max(100).default(65),
  requireVerifiedEmail: z.boolean().default(true),
});

/**
 * Import Getlead rows (exact GetLeads column labels) — from Claude's Getlead MCP pulls, or a CSV
 * exported from Getlead and uploaded on Find Leads. Dedupes, classifies, scores and queues.
 */
export async function POST(req: Request) {
  if (!requireHumanOrMachine(req, "INGEST_SECRET")) return NextResponse.json({ error: "Invalid ingest secret" }, { status: 401 });
  let input: z.infer<typeof schema>;
  try { input = schema.parse(await req.json()); }
  catch (e) { return NextResponse.json({ error: `Invalid payload: ${String(e)}` }, { status: 400 }); }

  let runId: string;
  try { runId = await startRun(db, "getlead_import", req.headers.get("authorization")?.startsWith("Bearer ") ? "claude" : "manual", { label: input.label, query: input.query, rows: input.rows.length }); }
  catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: e instanceof RunAlreadyActiveError ? 409 : 500 }); }

  try {
    const prospects = input.rows.map((r) => mapGetleadRow(r as GetleadRow)).filter((p): p is NonNullable<typeof p> => p !== null);
    await setStage(db, runId, "Deduplicating", `${input.rows.length} rows received, ${prospects.length} with a company`);
    const summary = await tx((c) => ingestBatch(c, prospects, { queueThreshold: input.queueThreshold, requireVerifiedEmail: input.requireVerifiedEmail, runId, query: input.query }));
    summary.skipped_invalid += input.rows.length - prospects.length;
    await finishRun(db, runId, summary, { matches: input.rows.length });
    return NextResponse.json({ runId, summary });
  } catch (e) {
    await failRun(db, runId, String((e as Error).message ?? e));
    return NextResponse.json({ runId, error: String((e as Error).message ?? e) }, { status: 500 });
  }
}
