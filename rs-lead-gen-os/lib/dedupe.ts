const SUFFIX_TOKENS = new Set(["inc", "incorporated", "llc", "ltd", "co", "corp", "corporation", "company", "pc", "pllc", "lp", "llp", "dds", "dmd", "md"]);

export function normalizeCompanyName(name: string) {
  const tokens = name
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[.']/g, "")
    .replace(/[^a-z0-9 ]+/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  if (tokens[0] === "the") tokens.shift();
  // Strip legal/professional suffixes from the END only ("MD Atkinson Co" keeps "md").
  while (tokens.length > 1 && SUFFIX_TOKENS.has(tokens[tokens.length - 1])) tokens.pop();
  return tokens.join(" ");
}

export function normalizeDomain(urlOrDomain?: string | null) {
  if (!urlOrDomain) return "";
  const raw = urlOrDomain.trim();
  if (!raw) return "";
  try {
    const u = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    return u.hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return raw.replace(/^https?:\/\//i, "").replace(/^www\./, "").split("/")[0].toLowerCase();
  }
}

const ADDRESS_ABBR: Record<string, string> = {
  street: "st", avenue: "ave", road: "rd", boulevard: "blvd", drive: "dr", suite: "ste",
  lane: "ln", court: "ct", parkway: "pkwy", highway: "hwy", place: "pl", north: "n", south: "s", east: "e", west: "w",
};

export function normalizeAddress(street?: string | null, postal?: string | null) {
  if (!street) return "";
  const s = street
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => ADDRESS_ABBR[w] ?? w)
    .join(" ");
  return postal ? `${s} ${postal.slice(0, 5)}` : s;
}

export function normalizeEmail(email?: string | null) {
  return (email || "").trim().toLowerCase();
}

export function normalizeLinkedin(url?: string | null) {
  if (!url) return "";
  return url.trim().toLowerCase().replace(/^https?:\/\/(www\.)?/, "https://www.").replace(/\/+$/, "");
}

export function normalizePhone(phone?: string | null) {
  const d = (phone || "").replace(/\D/g, "");
  return d.length === 11 && d.startsWith("1") ? d.slice(1) : d;
}

/** Free-mail domains are never treated as a company domain for dedupe. */
export const FREE_MAIL = new Set(["gmail.com", "yahoo.com", "hotmail.com", "outlook.com", "aol.com", "icloud.com", "live.com", "msn.com", "comcast.net", "att.net", "sbcglobal.net"]);
