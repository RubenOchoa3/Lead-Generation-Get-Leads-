/** A prospect record normalized from any provider (Getlead first). */
export type ProspectInput = {
  source: string;                 // "Getlead"
  company: {
    name: string;
    domain?: string | null;
    website?: string | null;
    phone?: string | null;
    linkedinUrl?: string | null;
    industry?: string | null;
    naicsCodes?: string[];
    naicsDescriptions?: string[];
    employeeRange?: string | null;
    street?: string | null;
    city?: string | null;
    state?: string | null;
    postalCode?: string | null;
    locationCount?: number | null;
    foundedYear?: number | null;
    websiteActive?: boolean | null;
    externalId?: string | null;
  };
  contact?: {
    firstName?: string | null;
    lastName?: string | null;
    fullName?: string | null;
    title?: string | null;
    seniority?: string | null;
    email?: string | null;
    emailStatus?: string | null;   // VALID | CATCH_ALL | INVALID | UNKNOWN
    emailVerifiedAt?: string | null;
    phone?: string | null;          // best phone for the person (direct or cell)
    linkedinUrl?: string | null;
    externalId?: string | null;
  } | null;
};

export type ScoreBreakdown = {
  fit: number;
  contact: number;
  dataQuality: number;
  opportunity: number;
  total: number;
  reasons: string[];
};

export type ScoreBand = "Priority" | "Good" | "Review" | "Hold";

export type ResearchResult = {
  business_summary: string;
  likely_cleaning_need: string;
  personalization_note: string;
  outreach_angle: string;
  confidence: number;
  uncertainty_notes?: string;
  sources_used?: string[];
};
