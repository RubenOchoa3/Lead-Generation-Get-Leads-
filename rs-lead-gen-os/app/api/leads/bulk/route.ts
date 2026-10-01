import { NextResponse } from "next/server";
import { z } from "zod";
import { tx } from "@/lib/db";
import { decide } from "@/lib/decisions";

export const dynamic = "force-dynamic";
const body = z.object({ ids: z.array(z.string().uuid()).min(1).max(500), decision: z.enum(["approve", "reject", "suppress", "needs_research", "reopen"]), reason: z.string().max(500).optional() });

export async function POST(req: Request) {
  try {
    const b = body.parse(await req.json());
    await tx(async (c) => { for (const id of b.ids) await decide(c, id, b.decision, { reason: b.reason }); });
    return NextResponse.json({ ok: true, updated: b.ids.length });
  } catch (e) { return NextResponse.json({ error: String((e as Error).message ?? e) }, { status: 400 }); }
}
