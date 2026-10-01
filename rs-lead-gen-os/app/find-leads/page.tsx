import FindLeads from "@/components/FindLeads";
import { getleadConfigured } from "@/lib/providers/getlead";
import { sql } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function Page() {
  let saved: Array<{ name: string; filters: unknown }> = [];
  try {
    const rows = await sql<{ value: Array<{ name: string; filters: unknown }> }>("select value from settings where key = 'saved_searches'");
    saved = rows[0]?.value ?? [];
  } catch { /* DB banner shows in shell */ }
  return <FindLeads serverApi={getleadConfigured()} saved={saved} />;
}
