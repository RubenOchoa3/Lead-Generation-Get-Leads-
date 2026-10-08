import { NextResponse } from "next/server";
import { z } from "zod";
import { requireHumanOrMachine } from "@/lib/auth";
import { RunAlreadyActiveError } from "@/lib/runs";
import { runRegistryWaterfall } from "@/lib/registry";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const schema = z.object({ daysBack: z.number().int().min(1).max(31).default(3), enrichLimit: z.number().int().min(0).max(200).default(40) });

/** "Pull new businesses" button: registry pull → Getlead lookup → queue / call list. Never sends. */
export async function POST(req: Request) {
  if (!requireHumanOrMachine(req, "CRON_SECRET")) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  let input: z.infer<typeof schema>;
  try { input = schema.parse(await req.json().catch(() => ({}))); } catch (e) { return NextResponse.json({ error: String(e) }, { status: 400 }); }
  try {
    return NextResponse.json(await runRegistryWaterfall("manual", input));
  } catch (e) {
    const status = e instanceof RunAlreadyActiveError ? 409 : 502;
    return NextResponse.json({ error: String((e as Error).message ?? e) }, { status });
  }
}
