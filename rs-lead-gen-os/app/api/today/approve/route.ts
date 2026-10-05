import { NextResponse } from "next/server";
import { z } from "zod";
import { approveAndSend } from "@/lib/dailyBatch";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const body = z.object({ batchId: z.string().uuid(), exclude: z.array(z.string().uuid()).default([]) });

/** Owner approval: approve today's leads and add them to the active campaigns. */
export async function POST(req: Request) {
  let b: z.infer<typeof body>;
  try { b = body.parse(await req.json()); } catch (e) { return NextResponse.json({ error: String(e) }, { status: 400 }); }
  try { return NextResponse.json({ ok: true, summary: await approveAndSend(b.batchId, b.exclude) }); }
  catch (e) { return NextResponse.json({ error: String((e as Error).message ?? e) }, { status: 400 }); }
}
