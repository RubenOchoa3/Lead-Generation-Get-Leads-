import { TARGET_CATEGORIES, DEFAULT_TITLES, ALL_STATES } from "@/lib/targets";

/** What the Find Leads page holds (and what a saved search stores). */
export type SearchState = {
  country?: string;
  state?: string;
  cities?: string[];
  categories?: string[];
  titles?: string[];
  verified?: boolean;
  phone?: boolean;
  minScore?: number;
  count?: number;
  /** Run this saved search in the nightly Daily Lead Engine. */
  nightly?: boolean;
};

/** Find Leads state → GetLeads search parameters. Shared by the page and the nightly engine. */
export function buildGetleadFilters(s: SearchState) {
  const country = s.country ?? "United States";
  const state = s.state ?? "California";
  const cities = s.cities ?? [];
  const categories = s.categories ?? TARGET_CATEGORIES.filter((c) => c.default).map((c) => c.label);
  return {
    countries: [country],
    ...(country === "United States" && state !== ALL_STATES ? { states: [state] } : {}),
    ...(cities.length ? { cities } : {}),
    industries: [...new Set(TARGET_CATEGORIES.filter((c) => categories.includes(c.label)).flatMap((c) => c.industries))],
    job_titles: s.titles ?? DEFAULT_TITLES,
    ...(s.verified ?? true ? { email_status: ["VALID"] } : {}),
    ...(s.phone ? { require_phone: true } : {}),
  };
}
