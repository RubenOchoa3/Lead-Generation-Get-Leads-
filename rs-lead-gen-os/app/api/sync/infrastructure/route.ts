import { NextResponse } from "next/server";
import { z } from "zod";
import { tx } from "@/lib/db";
import { requireHumanOrMachine } from "@/lib/auth";
import { upsertInfrastructure } from "@/lib/infrastructure";

export const dynamic = "force-dynamic";

const schema = z.object({
  source: z.string().default("InboxKit"),
  domains: z.array(z.record(z.string(), z.any())).default([]),
  mailboxes: z.array(z.record(z.string(), z.any())).default([]),
});

/** Accepts an InboxKit snapshot (domains + mailboxes, as returned by InboxKit list_domains / list_mailboxes). */
export async function POST(req: Request) {
  if (!requireHumanOrMachine(req, "INGEST_SECRET")) return NextResponse.json({ error: "Invalid secret" }, { status: 401 });
  try {
    const b = schema.parse(await req.json());
    const r = await tx((c) => upsertInfrastructure(c, b.domains, b.mailboxes));
    return NextResponse.json({ ok: true, ...r });
  } catch (e) { return NextResponse.json({ error: String((e as Error).message ?? e) }, { status: 400 }); }
}
