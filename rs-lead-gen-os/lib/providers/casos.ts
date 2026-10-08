import { type RegistryRecord, field, isoDate } from "@/lib/registryTypes";

/**
 * California Secretary of State "BE Public Search" API (free; key from calicodev.sos.ca.gov →
 * Products → BE Public Search → Subscribe). BusinessEntityKeywordSearch takes search-term plus
 * created-date-start / created-date-end (yyyy-mm-dd), so it can list newly filed entities.
 * Base URL and response casing are configurable/defensive because the docs are only partly public.
 */
export function casosConfigured() {
  return Boolean(process.env.CASOS_API_KEY);
}

const BASE = () => (process.env.CASOS_API_BASE || "https://calico.sos.ca.gov/cbc/v1/api").replace(/\/$/, "");

/** Name keywords for the business types R&S cleans. Holding/investment entities are skipped later. */
export const CASOS_SEARCH_TERMS = [
  "dental", "dentistry", "orthodontic", "medical", "clinic", "health", "chiropractic", "therapy", "optometry", "pharmacy",
  "properties", "property management", "realty", "real estate", "office", "plaza", "center",
  "warehouse", "logistics", "distribution", "trucking", "transport", "manufacturing", "industries", "packing",
  "church", "ministries", "fitness", "gym", "daycare", "preschool", "academy", "school", "learning",
  "auto", "motors", "law", "accounting", "insurance", "veterinary", "salon", "spa",
];

function firstArray(v: unknown): Record<string, unknown>[] {
  if (Array.isArray(v)) return v as Record<string, unknown>[];
  if (v && typeof v === "object") {
    for (const x of Object.values(v as Record<string, unknown>)) {
      const a = firstArray(x);
      if (a.length) return a;
    }
  }
  return [];
}

export function mapCasosRow(r: Record<string, unknown>): RegistryRecord | null {
  const externalId = field(r, "entityId", "EntityID", "entityNumber", "EntityNumber", "ID");
  const name = field(r, "entityName", "EntityName", "Name", "TITLE");
  if (!externalId || !name) return null;
  return {
    source: "ca_sos",
    externalId,
    name,
    entityType: field(r, "entityType", "EntityType", "Type"),
    status: field(r, "entityStatus", "Status", "StatusDescription"),
    filedDate: isoDate(field(r, "formationDate", "registrationDate", "filingDate", "initialFilingDate", "createdDate", "FormedDate")),
    address: field(r, "entityStreetAddress1", "principalAddress1", "PrincipalAddress", "streetAddress"),
    city: field(r, "entityCity", "principalCity", "City"),
    state: field(r, "entityState", "principalState", "State"),
    postalCode: field(r, "entityZipCode", "entityZip", "principalZip", "ZipCode"),
    agentName: field(r, "agentName", "AgentName"),
    raw: r,
  };
}

export async function casosKeywordSearch(term: string, start: string, end: string): Promise<RegistryRecord[]> {
  const url = `${BASE()}/BusinessEntityKeywordSearch?search-term=${encodeURIComponent(term)}&created-date-start=${start}&created-date-end=${end}`;
  const res = await fetch(url, { headers: { "Ocp-Apim-Subscription-Key": process.env.CASOS_API_KEY!, Accept: "application/json" }, cache: "no-store" });
  const text = await res.text();
  if (!res.ok) throw new Error(`CA SOS API ${res.status} for "${term}": ${text.slice(0, 300)}`);
  const rows = firstArray(JSON.parse(text));
  return rows.map(mapCasosRow).filter((x): x is RegistryRecord => x !== null);
}
