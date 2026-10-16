import { createHash } from "node:crypto";
import { type RegistryRecord, isoDate, str } from "@/lib/registryTypes";

/**
 * City of Fresno "New Business Directory" (public list of businesses with a new city business
 * license). No key. The page is HTML, so rows are read from its table(s) by header name.
 */
export const FRESNO_NEW_BUSINESS_URL = "https://appdev.fresno.gov/finance/businessdirectory-v2/index.php?view=new";

const decode = (s: string) => s.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&#39;|&apos;/g, "'")
  .replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/\s+/g, " ").trim();

/** Every <table> → rows of { header: cell }. */
export function parseHtmlTables(html: string): Record<string, string>[] {
  const out: Record<string, string>[] = [];
  for (const t of html.match(/<table[\s\S]*?<\/table>/gi) ?? []) {
    const rows = t.match(/<tr[\s\S]*?<\/tr>/gi) ?? [];
    let header: string[] | null = null;
    for (const r of rows) {
      const ths = r.match(/<th[\s\S]*?<\/th>/gi);
      const tds = r.match(/<td[\s\S]*?<\/td>/gi);
      if (ths && !tds) { header = ths.map(decode); continue; }
      if (!tds) continue;
      const cells = tds.map(decode);
      if (!header) { header = cells; continue; } // first row as header when there is no <th>
      out.push(Object.fromEntries(header.map((h, i) => [h, cells[i] ?? ""])));
    }
  }
  return out;
}

function pick(row: Record<string, string>, re: RegExp) {
  const k = Object.keys(row).find((h) => re.test(h));
  return k ? str(row[k]) : null;
}

export function mapFresnoRow(row: Record<string, string>): RegistryRecord | null {
  const name = pick(row, /business\s*name|^name$|dba|business$/i) ?? pick(row, /name/i);
  if (!name) return null;
  const address = pick(row, /address|location|street/i);
  const license = pick(row, /license|account|cert|number|id/i);
  return {
    source: "fresno_new_business",
    externalId: license ?? createHash("sha1").update(`${name}|${address ?? ""}`.toLowerCase()).digest("hex").slice(0, 20),
    name,
    businessType: pick(row, /type|category|description|activity|naics|class/i),
    filedDate: isoDate(pick(row, /date|start|issued|opened/i)),
    address,
    city: pick(row, /city/i) ?? "Fresno",
    state: "CA",
    postalCode: pick(row, /zip|postal/i),
    raw: row,
  };
}

export async function fetchFresnoNewBusinesses(): Promise<{ records: RegistryRecord[]; headers: string[] }> {
  const res = await fetch(FRESNO_NEW_BUSINESS_URL, { headers: { "User-Agent": "RS-Central-Valley-Cleaning-LeadOS/1.0" }, cache: "no-store" });
  if (!res.ok) throw new Error(`Fresno New Business Directory ${res.status}`);
  const rows = parseHtmlTables(await res.text());
  return { records: rows.map(mapFresnoRow).filter((x): x is RegistryRecord => x !== null), headers: Object.keys(rows[0] ?? {}) };
}
