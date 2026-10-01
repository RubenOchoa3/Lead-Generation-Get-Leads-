import { NextResponse } from "next/server";
import { getleadCount, GetleadNotConfiguredError } from "@/lib/providers/getlead";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const filters = await req.json();
    const r = await getleadCount(filters);
    return NextResponse.json({ total: r.total_matching });
  } catch (e) {
    const notConfigured = e instanceof GetleadNotConfiguredError;
    return NextResponse.json({ error: (e as Error).message, notConfigured }, { status: notConfigured ? 503 : 502 });
  }
}
