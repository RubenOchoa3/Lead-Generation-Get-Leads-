import { NextResponse } from "next/server";
import { db, one } from "@/lib/db";
import { researchSchema, saveResearch, runClaudeResearch, claudeResearchConfigured } from "@/lib/research";
import { requireHumanOrMachine } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/** Run Claude research on the server (needs ANTHROPIC_API_KEY). */
export async function POST(_req: Request, { params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  if (!claudeResearchConfigured()) {
    return NextResponse.json({ error: "Claude research API is not configured on the server. Research is currently added from a Claude session.", notConfigured: true }, { status: 503 });
  }
  const org = await one<Record<string, unknown>>("select * from organizations where id = $1", [orgId]);
  if (!org) return NextResponse.json({ error: "Lead not found" }, { status: 404 });
  try {
    const { research, model } = await runClaudeResearch(org);
    await saveResearch(db, orgId, research, model);
    return NextResponse.json({ ok: true, research });
  } catch (e) { return NextResponse.json({ error: String((e as Error).message ?? e) }, { status: 502 }); }
}

/** Store research produced by a Claude session (machine secret) — validated, never free-form. */
export async function PUT(req: Request, { params }: { params: Promise<{ orgId: string }> }) {
  if (!requireHumanOrMachine(req, "INGEST_SECRET")) return NextResponse.json({ error: "Invalid secret" }, { status: 401 });
  const { orgId } = await params;
  try {
    const b = await req.json();
    const r = researchSchema.parse(b.research ?? b);
    await saveResearch(db, orgId, r, String(b.model ?? "claude-session"));
    return NextResponse.json({ ok: true });
  } catch (e) { return NextResponse.json({ error: String((e as Error).message ?? e) }, { status: 400 }); }
}
