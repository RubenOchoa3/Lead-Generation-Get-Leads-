import { NextResponse } from "next/server";
import { z } from "zod";
import { sql } from "@/lib/db";

export const dynamic = "force-dynamic";
const EDITABLE = ["territory", "decision_maker_priority", "thresholds", "limits", "schedule", "business", "saved_searches"] as const;

export async function PUT(req: Request) {
  try {
    const b = z.object({ key: z.enum(EDITABLE), value: z.any() }).parse(await req.json());
    await sql(`insert into settings (key, value, updated_at) values ($1, $2, now()) on conflict (key) do update set value = $2, updated_at = now()`, [b.key, JSON.stringify(b.value)]);
    return NextResponse.json({ ok: true });
  } catch (e) { return NextResponse.json({ error: String((e as Error).message ?? e) }, { status: 400 }); }
}
