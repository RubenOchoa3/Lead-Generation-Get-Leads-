import { NextResponse } from "next/server";
import { z } from "zod";
import { hasMachineSecret } from "@/lib/auth";
import { one, sql } from "@/lib/db";
import { approveAndSend, pacificToday } from "@/lib/dailyBatch";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const body = z.object({ skipArms: z.array(z.enum(["local", "big"])).default([]) });

/**
 * Approve today's batch on the owner's behalf when they ask Claude to (they're away from the dashboard).
 * Machine-only (`Authorization: Bearer $CRON_SECRET`); `skipArms` leaves out a whole group, e.g. ["big"].
 */
export async function POST(req: Request) {
  if (!hasMachineSecret(req, "CRON_SECRET")) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  let b: z.infer<typeof body>;
  try { b = body.parse(await req.json().catch(() => ({}))); } catch (e) { return NextResponse.json({ error: String(e) }, { status: 400 }); }
  const batch = await one<{ id: string; status: string }>("select id, status from daily_batches where batch_date = $1", [pacificToday()]);
  if (!batch) return NextResponse.json({ error: "No batch for today yet" }, { status: 404 });
  if (batch.status !== "ready") return NextResponse.json({ ok: true, skipped: `batch already ${batch.status}` });
  const skip = await sql<{ contact_id: string }>(
    "select contact_id from daily_batch_items where batch_id = $1 and arm = any($2::text[])", [batch.id, b.skipArms]);
  try { return NextResponse.json({ ok: true, skipped: skip.length, summary: await approveAndSend(batch.id, skip.map((r) => r.contact_id)) }); }
  catch (e) { return NextResponse.json({ error: String((e as Error).message ?? e) }, { status: 400 }); }
}
