import type { ProspectInput, ScoreBand, ScoreBreakdown } from "./types";
import { RECURRING_TYPES, TARGET_TYPES, type BusinessType } from "./classify";

/** Spec priority list (index 0 = best). Extra buyer titles from R&S decision-maker policy follow. */
export const TITLE_PRIORITY = [
  "facilities manager", "director of facilities", "property manager", "building manager",
  "operations manager", "director of operations", "office manager", "general manager",
  "asset manager", "owner",
  // R&S policy additions: functional buyers per building type + executives
  "practice manager", "plant manager", "club manager", "facility manager", "facilities director",
  "president", "ceo", "chief executive", "founder", "managing partner", "administrator",
];

const TITLE_ALIASES: Array<[RegExp, string]> = [
  [/\bfacilit(y|ies)\b.*\b(manager|supervisor|coordinator)\b/, "facilities manager"],
  [/\b(director|head|vp)\b.*\bfacilit/, "director of facilities"],
  [/\bproperty\b.*\bmanager\b/, "property manager"],
  [/\bbuilding\b.*\b(manager|engineer)\b/, "building manager"],
  [/\b(director|vp|head)\b.*\boperations\b/, "director of operations"],
  [/\boperations\b.*\bmanager\b/, "operations manager"],
  [/\boffice\b.*\b(manager|administrator)\b/, "office manager"],
  [/\bgeneral\b.*\bmanager\b|\bgm\b/, "general manager"],
  [/\basset\b.*\bmanager\b/, "asset manager"],
  [/\b(owner|co-owner|proprietor)\b/, "owner"],
  [/\bpractice\b.*\b(manager|administrator)\b/, "practice manager"],
  [/\bplant\b.*\bmanager\b/, "plant manager"],
];

/** 0 = best; 999 = not a decision-maker title we email. */
export function titleRank(title?: string | null): number {
  if (!title) return 999;
  const t = title.toLowerCase();
  // Exclude obvious non-buyers that contain buyer words ("assistant property manager" still counts; "intern" never)
  if (/\b(intern|student|volunteer|retired|former)\b/.test(t)) return 999;
  for (const [re, canonical] of TITLE_ALIASES) if (re.test(t)) return TITLE_PRIORITY.indexOf(canonical);
  const i = TITLE_PRIORITY.findIndex((x) => t.includes(x));
  return i === -1 ? 999 : i;
}

export function isPreferredDecisionMaker(title?: string | null) {
  return titleRank(title) <= 9; // the 10 spec titles
}

export function isEligibleDecisionMaker(title?: string | null) {
  return titleRank(title) < 999;
}

/**
 * Transparent 100-point score (spec: Fit 40 / Contact 25 / Data quality 20 / Opportunity 15).
 * Every point awarded has a human-readable reason. Opportunity points use only real provider signals.
 */
export function scoreProspect(p: ProspectInput, businessType: BusinessType): ScoreBreakdown {
  const reasons: string[] = [];
  const c = p.company;
  const ct = p.contact ?? undefined;
  let fit = 0, contact = 0, dataQuality = 0, opportunity = 0;

  // ── Fit (40)
  if (businessType !== "Janitorial competitor" && businessType !== "Government") { fit += 10; reasons.push("+10 commercial prospect"); }
  if (RECURRING_TYPES.has(businessType)) { fit += 10; reasons.push("+10 recurring cleaning likely"); }
  if (TARGET_TYPES.has(businessType)) { fit += 10; reasons.push(`+10 target category (${businessType})`); }
  if (/^(ca|california)$/i.test((c.state || "").trim())) { fit += 5; reasons.push("+5 California"); }
  const minEmployees = parseInt((c.employeeRange || "").replace(/[^0-9 ]/g, " ").trim().split(/\s+/)[0] || "0", 10);
  if (minEmployees >= 11 || (c.locationCount ?? 0) >= 2) { fit += 5; reasons.push("+5 meaningful footprint"); }

  // ── Contact (25)
  const verified = (ct?.emailStatus || "").toUpperCase() === "VALID";
  if (ct && isPreferredDecisionMaker(ct.title)) { contact += 10; reasons.push(`+10 preferred decision maker (${ct.title})`); }
  else if (ct && isEligibleDecisionMaker(ct.title)) { contact += 6; reasons.push(`+6 eligible decision maker (${ct.title})`); }
  if (ct?.email && verified) { contact += 10; reasons.push("+10 verified direct email"); }
  if (ct?.phone || c.phone) { contact += 3; reasons.push("+3 phone"); }
  if (ct?.linkedinUrl) { contact += 2; reasons.push("+2 LinkedIn"); }

  // ── Data quality (20)
  if (c.website && c.websiteActive !== false) { dataQuality += 5; reasons.push("+5 website confirmed"); }
  if (c.street && c.city) { dataQuality += 5; reasons.push("+5 address present"); }
  if (ct?.emailVerifiedAt && Date.now() - new Date(ct.emailVerifiedAt).getTime() < 180 * 864e5) {
    dataQuality += 5; reasons.push("+5 email verified within 6 months");
  }
  if (verified) { dataQuality += 5; reasons.push("+5 verified email"); }

  // ── Opportunity (15) — real signals only
  if ((c.locationCount ?? 0) >= 2) { opportunity += 5; reasons.push("+5 multiple locations"); }
  if (c.foundedYear && c.foundedYear >= new Date().getFullYear() - 2) { opportunity += 5; reasons.push("+5 newly opened (founded ≤2 yrs)"); }
  // Remaining opportunity points are awarded only from Claude research / owner input later.

  if (businessType === "Janitorial competitor") reasons.push("Competitor — will be suppressed");

  const total = Math.min(100, fit + contact + dataQuality + opportunity);
  return { fit, contact, dataQuality, opportunity, total, reasons };
}

export function scoreBand(score: number): ScoreBand {
  if (score >= 80) return "Priority";
  if (score >= 65) return "Good";
  if (score >= 50) return "Review";
  return "Hold";
}
