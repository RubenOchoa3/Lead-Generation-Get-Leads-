import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { db } from "@/lib/db";
import { recordInstantlyEvent, type InstantlyEvent } from "@/lib/instantlyEvents";

export const dynamic = "force-dynamic";

function tokenOk(req: Request) {
  const want = process.env.INSTANTLY_WEBHOOK_TOKEN;
  const got = new URL(req.url).searchParams.get("token") ?? "";
  if (!want || got.length !== want.length) return false;
  return timingSafeEqual(Buffer.from(got), Buffer.from(want));
}

/**
 * Instantly → app event feed (sent, reply, bounce, unsubscribe, interested, meeting booked).
 * Instantly can't send our Basic-auth header, so this one route is public and checks
 * ?token=INSTANTLY_WEBHOOK_TOKEN instead.
 */
export async function POST(req: Request) {
  if (!tokenOk(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const payload = await req.json().catch(() => null);
  if (!payload) return NextResponse.json({ error: "Bad JSON" }, { status: 400 });
  const events: InstantlyEvent[] = Array.isArray(payload) ? payload : [payload];
  const results = [];
  for (const e of events) results.push(await recordInstantlyEvent(db, e));
  console.log(`[instantly-webhook] ${JSON.stringify(results).slice(0, 500)}`);
  return NextResponse.json({ ok: true, results });
}
