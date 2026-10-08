export type RegistryRecord = {
  source: "ca_sos" | "fresno_new_business";
  externalId: string;
  name: string;
  entityType?: string | null;
  businessType?: string | null;
  status?: string | null;
  filedDate?: string | null;   // YYYY-MM-DD
  address?: string | null;
  city?: string | null;
  state?: string | null;
  postalCode?: string | null;
  agentName?: string | null;
  raw?: unknown;
};

export const str = (v: unknown) => (v === null || v === undefined ? null : String(v).trim() || null);

/** Any reasonable date string → YYYY-MM-DD, or null. */
export function isoDate(v: unknown): string | null {
  const s = str(v);
  if (!s) return null;
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/) ?? null;
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  const us = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (us) return `${us[3]}-${us[1].padStart(2, "0")}-${us[2].padStart(2, "0")}`;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

/** Case- and punctuation-insensitive field lookup, for APIs whose exact key casing isn't documented. */
export function field(obj: Record<string, unknown>, ...names: string[]) {
  const norm = (k: string) => k.toLowerCase().replace(/[^a-z0-9]/g, "");
  const index = new Map(Object.keys(obj).map((k) => [norm(k), k]));
  for (const n of names) { const k = index.get(norm(n)); if (k !== undefined) { const v = str(obj[k]); if (v) return v; } }
  return null;
}
