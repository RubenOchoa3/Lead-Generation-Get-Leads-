import type { ProspectInput } from "@/lib/types";
import { normalizeDomain } from "@/lib/dedupe";

/**
 * Getlead (GetLeads) adapter.
 *
 * Two real data paths:
 *  1. MCP (verified): Claude calls the GetLeads MCP tools (count_contacts / search_contacts /
 *     lookup_decision_makers) and posts the rows to /api/ingest/getlead or `npm run import:getlead`.
 *  2. REST (server-side, needs GETLEAD_API_KEY): the deployed app searches on its own.
 *     The REST endpoint paths below are NOT yet verified against GetLeads' API docs — they are
 *     configurable via env and the adapter reports "not configured" until a key + base URL exist.
 *
 * The column labels mapped here are the exact display labels GetLeads returned in a live
 * search on 2026-09-30.
 */

export const GETLEAD_COLUMNS = [
  "Contact Full Name", "First Name", "Last Name", "Current Job Title", "Seniority Level",
  "Email", "Email Verification Status", "Email Last Verification Date", "Cellphone", "Direct Office Phone",
  "Contact LinkedIn URL", "Company Name", "Company Domain", "Company Website", "Company Phone",
  "Company LinkedIn URL", "Employee Count Range", "Company Industry (LinkedIn)", "NAICS Industry Code",
  "NAICS Industry Description", "Company Street Address", "Company City", "Company State",
  "Company Postal Code", "LinkedIn Location Count", "Year Founded", "Website Active?",
] as const;

export type GetleadRow = Partial<Record<(typeof GETLEAD_COLUMNS)[number], string | number | boolean | null>>;

const s = (v: unknown) => (v === null || v === undefined || v === "" ? null : String(v).trim() || null);

export function mapGetleadRow(row: GetleadRow): ProspectInput | null {
  const companyName = s(row["Company Name"]);
  if (!companyName) return null; // a contact without an employer is not a facility lead
  const naicsCodes = (s(row["NAICS Industry Code"]) || "").split(/[;,]/).map((x) => x.trim()).filter(Boolean);
  const naicsDescriptions = (s(row["NAICS Industry Description"]) || "").split(";").map((x) => x.trim()).filter(Boolean);
  const website = s(row["Company Website"]);
  const domain = normalizeDomain(s(row["Company Domain"]) || website) || null;
  const statusRaw = (s(row["Email Verification Status"]) || "").toUpperCase();
  const verifiedAt = s(row["Email Last Verification Date"]);

  const email = s(row["Email"]);
  const fullName = s(row["Contact Full Name"]) || [s(row["First Name"]), s(row["Last Name"])].filter(Boolean).join(" ") || null;

  return {
    source: "Getlead",
    company: {
      name: companyName,
      domain,
      website,
      phone: s(row["Company Phone"]),
      linkedinUrl: s(row["Company LinkedIn URL"]),
      industry: s(row["Company Industry (LinkedIn)"]),
      naicsCodes,
      naicsDescriptions,
      employeeRange: s(row["Employee Count Range"]),
      street: s(row["Company Street Address"]),
      city: s(row["Company City"]),
      state: s(row["Company State"]),
      postalCode: s(row["Company Postal Code"]),
      locationCount: row["LinkedIn Location Count"] != null ? Number(row["LinkedIn Location Count"]) : null,
      foundedYear: row["Year Founded"] ? Number(row["Year Founded"]) || null : null,
      websiteActive: typeof row["Website Active?"] === "boolean" ? (row["Website Active?"] as boolean) : null,
      externalId: s(row["Company LinkedIn URL"]), // GetLeads does not expose an org id; LinkedIn company URL is the stable key
    },
    contact: fullName || email
      ? {
          firstName: s(row["First Name"]),
          lastName: s(row["Last Name"]),
          fullName,
          title: s(row["Current Job Title"]),
          seniority: s(row["Seniority Level"]),
          email,
          emailStatus: statusRaw || (email ? "UNKNOWN" : null),
          emailVerifiedAt: verifiedAt ? new Date(verifiedAt.replace(" ", "T").slice(0, 19) + "Z").toISOString() : null,
          phone: s(row["Direct Office Phone"]) || s(row["Cellphone"]),
          linkedinUrl: s(row["Contact LinkedIn URL"]),
          externalId: s(row["Contact LinkedIn URL"]),
        }
      : null,
  };
}

/** Filters the Find Leads page sends. Names mirror GetLeads' documented MCP filter parameters. */
export type GetleadFilters = {
  office_states?: string[];
  office_cities?: string[];
  industries?: string[];
  naics_codes?: string[];
  job_titles?: string[];
  email_status?: string[];
  require_phone?: boolean;
  employees_min?: number;
  employees_max?: number;
  exclude_industries?: string[];
};

export class GetleadNotConfiguredError extends Error {
  constructor() {
    super(
      "Getlead server-side API is not configured (GETLEAD_API_KEY / GETLEAD_API_BASE). " +
        "Lead pulls currently run through the Getlead MCP connection in Claude and are imported into this database.",
    );
  }
}

export function getleadConfigured() {
  return Boolean(process.env.GETLEAD_API_KEY && process.env.GETLEAD_API_BASE);
}

async function call<T>(pathEnv: string, fallbackPath: string, body: unknown): Promise<T> {
  if (!getleadConfigured()) throw new GetleadNotConfiguredError();
  const base = process.env.GETLEAD_API_BASE!.replace(/\/$/, "");
  const path = process.env[pathEnv] || fallbackPath; // UNVERIFIED default — confirm against GetLeads docs when the key is added
  const res = await fetch(`${base}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.GETLEAD_API_KEY}` },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Getlead API ${res.status} on ${path}: ${text.slice(0, 400)}`);
  return JSON.parse(text) as T;
}

export async function getleadCount(filters: GetleadFilters) {
  return call<{ total_matching: number }>("GETLEAD_COUNT_PATH", "/api/v1/contacts/count", filters);
}

export async function getleadSearch(filters: GetleadFilters, limit: number, offset = 0) {
  return call<{ contacts: GetleadRow[]; has_more?: boolean; next_offset?: number; query_credits_used?: number }>(
    "GETLEAD_SEARCH_PATH",
    "/api/v1/contacts/search",
    { ...filters, limit: Math.min(100, limit), offset, columns: GETLEAD_COLUMNS },
  );
}
