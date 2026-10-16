import { NextResponse } from "next/server";
import { one } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const run = await one("select * from automation_runs where id = $1", [id]);
  if (!run) return NextResponse.json({ error: "Run not found" }, { status: 404 });
  return NextResponse.json(run);
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await one("update automation_runs set status = 'cancelled', finished_at = now() where id = $1 and status = 'running' returning id", [id]);
  return NextResponse.json({ ok: true });
}
