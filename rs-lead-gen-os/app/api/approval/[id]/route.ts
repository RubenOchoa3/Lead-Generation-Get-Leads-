import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { decide } from "@/lib/decisions";

export const dynamic = "force-dynamic";
const body = z.object({ decision: z.enum(["approve", "reject", "suppress", "needs_research", "reopen"]), reason: z.string().max(500).optional() });

/** id = organization id */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const b = body.parse(await req.json());
    await decide(db, id, b.decision, { reason: b.reason });
    return NextResponse.json({ ok: true });
  } catch (e) { return NextResponse.json({ error: String((e as Error).message ?? e) }, { status: 400 }); }
}
