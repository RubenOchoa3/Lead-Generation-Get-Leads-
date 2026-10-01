import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { pushApprovedToCampaign } from "@/lib/outreach";
import { instantly, instantlyConfigured } from "@/lib/providers/instantly";
import { requireHumanOrMachine } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const body = z.object({ campaignId: z.string().min(1).max(100), dryRun: z.boolean().default(true) });

/** Preview (dryRun) or add approved leads to an Instantly campaign. Never launches the campaign. */
export async function POST(req: Request) {
  if (!requireHumanOrMachine(req, "INGEST_SECRET")) return NextResponse.json({ error: "Invalid secret" }, { status: 401 });
  if (!instantlyConfigured()) return NextResponse.json({ error: "Instantly is not connected yet.", notConfigured: true }, { status: 503 });
  try {
    const b = body.parse(await req.json());
    return NextResponse.json(await pushApprovedToCampaign(db, instantly, b.campaignId, { dryRun: b.dryRun }));
  } catch (e) { return NextResponse.json({ error: String((e as Error).message ?? e) }, { status: 400 }); }
}
