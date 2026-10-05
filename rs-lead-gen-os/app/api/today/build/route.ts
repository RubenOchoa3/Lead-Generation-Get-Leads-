import { NextResponse } from "next/server";
import { buildDailyBatch } from "@/lib/dailyBatch";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Build today's batch now (normally the nightly run does this before 5 AM). */
export async function POST() {
  try { return NextResponse.json(await buildDailyBatch()); }
  catch (e) { return NextResponse.json({ error: String((e as Error).message ?? e) }, { status: 500 }); }
}
