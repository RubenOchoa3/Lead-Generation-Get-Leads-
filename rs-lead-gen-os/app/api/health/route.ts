import { NextResponse } from "next/server";
import { one } from "@/lib/db";
import { getleadConfigured } from "@/lib/providers/getlead";
import { instantlyConfigured } from "@/lib/providers/instantly";

export const dynamic = "force-dynamic";

/** Public, non-sensitive health check (Railway healthcheck path). */
export async function GET() {
  let database: "ok" | "not_configured" | "error" = "ok";
  let migrations: string | null = null;
  try {
    const r = await one<{ name: string }>("select name from schema_migrations order by name desc limit 1");
    migrations = r?.name ?? null;
  } catch (e) {
    database = String((e as Error).message).includes("DATABASE_URL") ? "not_configured" : "error";
  }
  const body = {
    ok: database === "ok",
    database,
    migrations,
    providers: {
      getlead_server_api: getleadConfigured() ? "configured" : "not_configured",
      claude_research_api: process.env.ANTHROPIC_API_KEY ? "configured" : "not_configured",
      inboxkit_server_api: process.env.INBOXKIT_API_KEY ? "configured" : "not_configured",
      sender: instantlyConfigured() ? "instantly" : "not_connected",
    },
    time: new Date().toISOString(),
  };
  return NextResponse.json(body, { status: body.ok ? 200 : 503 });
}
