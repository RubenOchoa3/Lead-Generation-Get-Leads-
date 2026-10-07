import { NextResponse } from "next/server";
import { buildDailyBatch, discardReadyBatch } from "@/lib/dailyBatch";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Build today's batch now (normally the nightly run does this before 5 AM). `{ rebuild: true }` replaces an unapproved one. */
export async function POST(req: Request) {
  const { rebuild } = (await req.json().catch(() => ({}))) as { rebuild?: boolean };
  try {
    if (rebuild) await discardReadyBatch();
    return NextResponse.json(await buildDailyBatch());
  }
  catch (e) { return NextResponse.json({ error: String((e as Error).message ?? e) }, { status: 500 }); }
}
