/**
 * Maps provider industry data (NAICS + LinkedIn industry) to R&S target business types.
 * Only uses data the provider actually returned; unknown stays "Other / Unclassified".
 */

export type BusinessType =
  | "Dental office" | "Medical office" | "Clinic" | "Healthcare facility"
  | "Property management" | "Commercial real estate" | "Office"
  | "Warehouse" | "Distribution center" | "Manufacturing" | "Industrial facility"
  | "School" | "Church" | "Gym / Fitness" | "Retail center" | "Auto dealership"
  | "Daycare" | "Coworking" | "HOA" | "Facilities management" | "Government"
  | "Hospitality" | "Real estate brokerage" | "Janitorial competitor" | "Other / Unclassified";

// Ordered: first matching prefix wins (most specific first).
const NAICS_RULES: Array<[string, BusinessType]> = [
  ["561720", "Janitorial competitor"],
  ["561790", "Janitorial competitor"],
  ["561210", "Facilities management"],
  ["621210", "Dental office"],
  ["6211", "Medical office"],
  ["6213", "Medical office"],
  ["6214", "Clinic"],
  ["6215", "Clinic"],
  ["621", "Healthcare facility"],
  ["622", "Healthcare facility"],
  ["623", "Healthcare facility"],
  ["624410", "Daycare"],
  ["813990", "HOA"],
  ["531311", "Property management"],
  ["531312", "Property management"],
  ["531110", "Commercial real estate"],
  ["531130", "Warehouse"],
  ["531120", "Commercial real estate"],
  ["531210", "Real estate brokerage"],
  ["5312", "Commercial real estate"],
  ["531", "Commercial real estate"],
  ["4931", "Warehouse"],
  ["4921", "Distribution center"],
  ["4841", "Distribution center"],
  ["42", "Distribution center"],
  ["31", "Manufacturing"], ["32", "Manufacturing"], ["33", "Manufacturing"],
  ["2111", "Industrial facility"], ["2131", "Industrial facility"], ["2211", "Industrial facility"],
  ["6111", "School"], ["6112", "School"], ["6113", "School"], ["6116", "School"],
  ["8131", "Church"],
  ["71394", "Gym / Fitness"],
  ["4411", "Auto dealership"],
  ["44", "Retail center"], ["45", "Retail center"],
  ["7211", "Hospitality"],
  ["92", "Government"],
  ["52", "Office"], ["54", "Office"], ["55", "Office"], ["5611", "Office"], ["524", "Office"],
];

const INDUSTRY_RULES: Array<[RegExp, BusinessType]> = [
  [/janitorial|commercial cleaning|cleaning services/i, "Janitorial competitor"],
  [/facilities services/i, "Facilities management"],
  [/dental|dentist/i, "Dental office"],
  [/medical practices?|physician|chiropract|optometr/i, "Medical office"],
  [/outpatient care|diagnostic laborator/i, "Clinic"],
  [/hospital|health care|healthcare|mental health/i, "Healthcare facility"],
  [/real estate|property/i, "Commercial real estate"],
  [/warehousing|storage/i, "Warehouse"],
  [/logistics|supply chain|transportation|trucking/i, "Distribution center"],
  [/manufactur|food production|food and beverage manufacturing|machinery|packaging/i, "Manufacturing"],
  [/oil|energy|utilities|chemical/i, "Industrial facility"],
  [/primary.*education|education administration|e-learning|higher education/i, "School"],
  [/religious/i, "Church"],
  [/wellness and fitness|fitness/i, "Gym / Fitness"],
  [/motor vehicle|automotive/i, "Auto dealership"],
  [/retail/i, "Retail center"],
  [/child day care|childcare/i, "Daycare"],
  [/government|public safety/i, "Government"],
  [/hospitality|hotel/i, "Hospitality"],
  [/accounting|legal|law practice|insurance|financial|banking|consulting|architecture|engineering services/i, "Office"],
];

export const TARGET_TYPES = new Set<BusinessType>([
  "Dental office", "Medical office", "Clinic", "Healthcare facility", "Property management", "Commercial real estate",
  "Office", "Warehouse", "Distribution center", "Manufacturing", "Industrial facility", "School", "Church",
  "Gym / Fitness", "Retail center", "Auto dealership", "Daycare", "Coworking", "HOA", "Facilities management",
]);

/** Business types where recurring (not one-off) cleaning is the norm. */
export const RECURRING_TYPES = new Set<BusinessType>([
  "Dental office", "Medical office", "Clinic", "Healthcare facility", "Property management", "Commercial real estate",
  "Office", "Warehouse", "Distribution center", "Manufacturing", "School", "Church", "Gym / Fitness", "Daycare",
  "Coworking", "Auto dealership", "Retail center",
]);

/**
 * Provider NAICS lists are not reliably primary-first (they include predicted codes), so:
 *  1. any janitorial NAICS → competitor;
 *  2. LinkedIn "Real Estate" → split by NAICS (property management > lessor > brokerage);
 *  3. a specific LinkedIn industry match wins;
 *  4. otherwise majority vote across NAICS codes (ties → first listed).
 */
export function classifyBusiness(naicsCodes: string[] = [], industry?: string | null): BusinessType {
  const naicsTypes = naicsCodes.map((c) => c.trim()).filter(Boolean)
    .map((c) => NAICS_RULES.find(([prefix]) => c.startsWith(prefix))?.[1])
    .filter((t): t is BusinessType => Boolean(t));
  if (naicsTypes.includes("Janitorial competitor")) return "Janitorial competitor";
  if (industry && /cleaning services|janitorial/i.test(industry)) return "Janitorial competitor";

  if (industry && /real estate/i.test(industry)) {
    if (naicsTypes.includes("Property management")) return "Property management";
    if (naicsTypes.includes("Warehouse")) return "Warehouse";
    if (naicsTypes.includes("Commercial real estate")) return "Commercial real estate";
    if (naicsTypes.includes("Real estate brokerage")) return "Real estate brokerage";
    return "Commercial real estate";
  }

  const industryType = industry ? INDUSTRY_RULES.find(([re]) => re.test(industry))?.[1] : undefined;
  if (industryType && industryType !== "Office") return industryType;

  if (naicsTypes.length) {
    const counts = new Map<BusinessType, number>();
    naicsTypes.forEach((t) => counts.set(t, (counts.get(t) ?? 0) + 1));
    let best = naicsTypes[0];
    for (const t of naicsTypes) if ((counts.get(t) ?? 0) > (counts.get(best) ?? 0)) best = t;
    return best;
  }
  return industryType ?? "Other / Unclassified";
}
