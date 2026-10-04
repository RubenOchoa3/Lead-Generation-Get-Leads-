import type { ProspectInput } from "@/lib/types";
import { normalizeDomain } from "@/lib/dedupe";

/**
 * Getlead (GetLeads) adapter.
 *
 * Two real data paths:
 *  1. MCP (verified): Claude calls the GetLeads MCP tools (count_contacts / search_contacts /
 *     lookup_decision_makers) and posts the rows to /api/ingest/getlead or `npm run import:getlead`.
 *  2. REST (server-side, needs GETLEAD_API_KEY + GETLEAD_API_BASE=https://app.getleads.io): the
 *     deployed app searches on its own. Paths are configurable via env; the adapter reports
 *     "not configured" until a key + base URL exist.
 *
 * Columns are requested by GetLeads canonical name (get_available_columns); rows come back keyed by
 * those names. `mapGetleadRow` also accepts the older display labels ("Contact Full Name",
 * "Email", "NAICS Industry Code", …) so CSV exports and earlier MCP pulls still import.
 */

export const GETLEAD_COLUMNS = [
  "full_name", "first_name", "last_name", "current_title", "seniority_level",
  "work_email", "email_status", "mobile_phone", "linkedin_url",
  "company_name", "company_domain", "company_website", "company_linkedin_url", "company_contact_info_json",
  "employee_count_range", "linkedin_employee_count_exact", "main_industry",
  "contact_city", "contact_state", "company_hq_city", "company_founded_year",
] as const;

/** Older GetLeads display labels, still seen in CSV exports and the test fixture. */
const LEGACY_COLUMNS = [
  "Contact Full Name", "First Name", "Last Name", "Current Job Title", "Seniority Level",
  "Email", "Email Verification Status", "Email Last Verification Date", "Cellphone", "Direct Office Phone",
  "Contact LinkedIn URL", "Company Name", "Company Domain", "Company Website", "Company Phone",
  "Company LinkedIn URL", "Employee Count Range", "Company Industry (LinkedIn)", "NAICS Industry Code",
  "NAICS Industry Description", "Company Street Address", "Company City", "Company State",
  "Company Postal Code", "LinkedIn Location Count", "Year Founded", "Website Active?",
] as const;

type Cell = string | number | boolean | null;
export type GetleadRow = Partial<Record<(typeof GETLEAD_COLUMNS)[number] | (typeof LEGACY_COLUMNS)[number] | "current_employer_linkedin_url" | "company_industry", Cell>>;

const s = (v: unknown) => (v === null || v === undefined || v === "" ? null : String(v).trim() || null);

/** First non-empty value among the given keys (canonical name first, then legacy label). */
function pick(row: GetleadRow, ...keys: (keyof GetleadRow)[]) {
  for (const k of keys) { const v = s(row[k]); if (v) return v; }
  return null;
}

function contactInfoPhone(raw: unknown): string | null {
  if (!raw) return null;
  try { return s((typeof raw === "string" ? JSON.parse(raw) : raw)?.phone); } catch { return null; }
}

function yearOf(v: string | null) {
  const y = v ? Number(v.slice(0, 4)) : NaN;
  return Number.isFinite(y) && y > 0 ? y : null;
}

/** "Work Email" → "work_email": the REST API may key rows by display label instead of canonical name. */
const canonicalKey = (k: string) => k.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");

export function mapGetleadRow(input: GetleadRow): ProspectInput | null {
  const row: GetleadRow = { ...input };
  for (const [k, v] of Object.entries(input)) {
    const ck = canonicalKey(k) as keyof GetleadRow;
    if (row[ck] === undefined) row[ck] = v;
  }
  const companyName = pick(row, "company_name", "Company Name");
  if (!companyName) return null; // a contact without an employer is not a facility lead
  const naicsCodes = (s(row["NAICS Industry Code"]) || "").split(/[;,]/).map((x) => x.trim()).filter(Boolean);
  const naicsDescriptions = (s(row["NAICS Industry Description"]) || "").split(";").map((x) => x.trim()).filter(Boolean);
  const website = pick(row, "company_website", "Company Website");
  const domain = normalizeDomain(pick(row, "company_domain", "Company Domain") || website) || null;
  const statusRaw = (pick(row, "email_status", "Email Verification Status") || "").toUpperCase();
  const verifiedAt = s(row["Email Last Verification Date"]);
  const companyLinkedin = pick(row, "company_linkedin_url", "current_employer_linkedin_url", "Company LinkedIn URL");
  const contactLinkedin = pick(row, "linkedin_url", "Contact LinkedIn URL");
  const exactHeadcount = s(row["linkedin_employee_count_exact"]);

  const email = pick(row, "work_email", "Email");
  const firstName = pick(row, "first_name", "First Name");
  const lastName = pick(row, "last_name", "Last Name");
  const fullName = pick(row, "full_name", "Contact Full Name") || [firstName, lastName].filter(Boolean).join(" ") || null;

  return {
    source: "Getlead",
    company: {
      name: companyName,
      domain,
      website,
      phone: contactInfoPhone(row["company_contact_info_json"]) || s(row["Company Phone"]),
      linkedinUrl: companyLinkedin,
      industry: pick(row, "main_industry", "company_industry", "Company Industry (LinkedIn)"),
      naicsCodes,
      naicsDescriptions,
      employeeRange: pick(row, "employee_count_range", "Employee Count Range") || (exactHeadcount ? `${exactHeadcount} on LinkedIn` : null),
      street: s(row["Company Street Address"]),
      // The current dataset has no office address; the contact's city is where they work for a local lead.
      city: pick(row, "Company City", "contact_city", "company_hq_city"),
      state: pick(row, "Company State", "contact_state"),
      postalCode: s(row["Company Postal Code"]),
      locationCount: row["LinkedIn Location Count"] != null ? Number(row["LinkedIn Location Count"]) : null,
      foundedYear: yearOf(pick(row, "company_founded_year", "Year Founded")),
      websiteActive: typeof row["Website Active?"] === "boolean" ? (row["Website Active?"] as boolean) : null,
      externalId: companyLinkedin, // GetLeads does not expose an org id; LinkedIn company URL is the stable key
    },
    contact: fullName || email
      ? {
          firstName,
          lastName,
          fullName,
          title: pick(row, "current_title", "Current Job Title"),
          seniority: pick(row, "seniority_level", "Seniority Level"),
          email,
          emailStatus: statusRaw || (email ? "UNKNOWN" : null),
          emailVerifiedAt: verifiedAt ? new Date(verifiedAt.replace(" ", "T").slice(0, 19) + "Z").toISOString() : null,
          phone: pick(row, "Direct Office Phone", "mobile_phone", "Cellphone"),
          linkedinUrl: contactLinkedin,
          externalId: contactLinkedin,
        }
      : null,
  };
}

/** Filters the Find Leads page sends. Names are GetLeads' contact search parameters. */
export type GetleadFilters = {
  countries?: string[];
  states?: string[];
  cities?: string[];
  founded_year_min?: number;
  industries?: string[];
  job_titles?: string[];
  email_status?: string[];
  require_phone?: boolean;
  employees_min?: number;
  employees_max?: number;
  exclude_industries?: string[];
};

/**
 * Saved searches and older clients may still send office_states / office_cities / naics_codes,
 * which the current GetLeads API does not take. Rename the location filters and drop NAICS.
 */
export function toGetleadQuery(filters: Record<string, unknown>): GetleadFilters {
  const { office_states, office_cities, naics_codes: _naics, ...rest } = filters as Record<string, unknown> & {
    office_states?: string[]; office_cities?: string[]; naics_codes?: string[];
  };
  const q = { ...rest } as GetleadFilters;
  if (office_states && !q.states) q.states = office_states;
  if (office_cities && !q.cities) q.cities = office_cities;
  return q;
}

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
  const path = process.env[pathEnv] || fallbackPath;
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

/**
 * The REST API has no count route (/api/v1/contacts/count is a 404), so unless GETLEAD_COUNT_PATH
 * names one, count with a 1-row search and read its total_available (1 credit).
 */
export async function getleadCount(filters: Record<string, unknown>) {
  if (process.env.GETLEAD_COUNT_PATH) {
    return call<{ total_matching: number }>("GETLEAD_COUNT_PATH", "", toGetleadQuery(filters));
  }
  // Keep GetLeads' default ranking here: with it off, total_available is only a lower bound.
  const page = await getleadSearch(filters, 1, 0, { exactTotal: true });
  return { total_matching: page.total_available ?? page.contacts.length };
}

/**
 * Lead runs turn off GetLeads' "domain or headline first" ranking: it roughly halves the search time
 * and adds nothing here, since runs already filter to verified emails and re-score every row.
 */
export async function getleadSearch(filters: Record<string, unknown>, limit: number, offset = 0, opts: { exactTotal?: boolean } = {}) {
  return call<{ contacts: GetleadRow[]; total_available?: number; has_more?: boolean; next_offset?: number; query_credits_used?: number }>(
    "GETLEAD_SEARCH_PATH",
    "/api/v1/contacts/search",
    { ...toGetleadQuery(filters), limit: Math.min(100, limit), offset, columns: GETLEAD_COLUMNS, ...(opts.exactTotal ? {} : { require_domain_or_headline: false }) },
  );
}
