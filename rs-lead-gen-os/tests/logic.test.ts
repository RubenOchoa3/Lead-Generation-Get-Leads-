import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { scoreProspect, scoreBand, titleRank, isPreferredDecisionMaker } from "../lib/scoring";
import { classifyBusiness } from "../lib/classify";
import { normalizeCompanyName, normalizeDomain, normalizeAddress, normalizePhone } from "../lib/dedupe";
import { mapGetleadRow, toGetleadQuery } from "../lib/providers/getlead";
import { buildGetleadFilters } from "../lib/searchFilters";
import rows from "./fixtures/getlead-sample.json" with { type: "json" };

describe("titles", () => {
  it("ranks Facilities Manager above Owner", () => assert.ok(titleRank("Facilities Manager") < titleRank("Owner")));
  it("recognizes title variants", () => {
    assert.equal(titleRank("National Facilities Manager"), 0);
    assert.equal(titleRank("Sr. Property Manager"), 2);
    assert.equal(titleRank("Dental Practice Manager"), titleRank("Practice Manager"));
  });
  it("rejects non-buyers", () => {
    assert.equal(titleRank("Software Engineer"), 999);
    assert.equal(titleRank("Facilities Intern"), 999);
    assert.equal(isPreferredDecisionMaker("Practice Manager"), false);
  });
});

describe("classification", () => {
  it("maps NAICS to R&S types", () => {
    assert.equal(classifyBusiness(["621210"]), "Dental office");
    assert.equal(classifyBusiness(["621111"]), "Medical office");
    assert.equal(classifyBusiness(["531311", "561110"]), "Property management");
    assert.equal(classifyBusiness(["493110"]), "Warehouse");
    assert.equal(classifyBusiness(["531130"]), "Warehouse");
  });
  it("flags janitorial competitors", () => assert.equal(classifyBusiness(["561720"]), "Janitorial competitor"));
  it("falls back to LinkedIn industry, else unclassified", () => {
    assert.equal(classifyBusiness([], "Real Estate"), "Commercial real estate");
    assert.equal(classifyBusiness([], null), "Other / Unclassified");
  });
});

describe("dedupe normalization", () => {
  it("normalizes names, domains, addresses, phones", () => {
    assert.equal(normalizeCompanyName("M.D. Atkinson Company, Inc"), normalizeCompanyName("MD Atkinson Co."));
    assert.equal(normalizeDomain("https://www.Example.com/about"), "example.com");
    assert.equal(normalizeAddress("1401 19Th Street", "93301-1234"), normalizeAddress("1401 19th St", "93301"));
    assert.equal(normalizePhone("+1 (661) 334-4800"), "6613344800");
  });
});

describe("getlead mapping + scoring", () => {
  it("maps live GetLeads column labels", () => {
    const p = mapGetleadRow(rows[1] as never)!;
    assert.equal(p.company.name, "Sample Properties, Inc");
    assert.equal(p.company.domain, "sampleproperties.example");
    assert.deepEqual(p.company.naicsCodes, ["531311", "561110", "531210"]);
    assert.equal(p.contact?.emailStatus, "VALID");
    assert.ok(p.contact?.emailVerifiedAt?.startsWith("2026-06-02"));
  });
  it("skips rows without a company", () => assert.equal(mapGetleadRow({ "Contact Full Name": "No Employer" }), null));
  it("maps current GetLeads canonical columns", () => {
    const p = mapGetleadRow({
      full_name: "Gina Example", first_name: "Gina", last_name: "Example", current_title: "Office Manager",
      seniority_level: "manager", work_email: "gina@valleydental.example", email_status: "VALID", mobile_phone: "",
      linkedin_url: "https://www.linkedin.com/in/gina-example", company_name: "Valley Dental (fixture)",
      company_domain: "valleydental.example", company_website: "valleydental.example",
      current_employer_linkedin_url: "https://www.linkedin.com/company/valley-dental-fixture",
      company_contact_info_json: '{"phone":"(661) 555-0101","email":null}', employee_count_range: "11 to 50",
      main_industry: "Dentists", contact_city: "Bakersfield", contact_state: "California",
      company_hq_city: "Fresno", company_founded_year: "1995-01-01T00:00:00.000Z",
    })!;
    assert.equal(p.company.domain, "valleydental.example");
    assert.equal(p.company.phone, "(661) 555-0101");
    assert.equal(p.company.linkedinUrl, "https://www.linkedin.com/company/valley-dental-fixture");
    assert.equal(p.company.city, "Bakersfield");
    assert.equal(p.company.foundedYear, 1995);
    assert.equal(p.contact?.email, "gina@valleydental.example");
    assert.equal(p.contact?.emailStatus, "VALID");
    assert.equal(classifyBusiness(p.company.naicsCodes, p.company.industry), "Dental office");
  });
  it("maps rows keyed by current display labels", () => {
    const p = mapGetleadRow({ "Company Name": "Label Co", "Work Email": "a@label.example", "Email Status": "VALID",
      "Current Title": "Property Manager", "Main Industry": "Real Estate", "Contact State": "California" } as never)!;
    assert.equal(p.contact?.email, "a@label.example");
    assert.equal(p.contact?.title, "Property Manager");
    assert.equal(p.company.industry, "Real Estate");
    assert.equal(p.company.state, "California");
  });
  it("builds GetLeads filters from a saved search (whole state when no cities)", () => {
    const f = buildGetleadFilters({ country: "United States", state: "California", cities: [], categories: ["Dental offices"], titles: ["Owner"], verified: true });
    assert.deepEqual(f, { countries: ["United States"], states: ["California"], industries: ["Dentists"], job_titles: ["Owner"], email_status: ["VALID"] });
    assert.deepEqual(buildGetleadFilters({ state: "All states", cities: ["Fresno"], categories: [], verified: false }).cities, ["Fresno"]);
    assert.equal("states" in buildGetleadFilters({ state: "All states" }), false);
  });
  it("translates older saved filters to current GetLeads parameters", () => {
    assert.deepEqual(toGetleadQuery({ office_states: ["California"], office_cities: ["Fresno"], naics_codes: ["6212"], job_titles: ["Owner"] }),
      { states: ["California"], cities: ["Fresno"], job_titles: ["Owner"] });
  });
  it("scores transparently with reasons and bands", () => {
    const p = mapGetleadRow(rows[1] as never)!;
    const s = scoreProspect(p, classifyBusiness(p.company.naicsCodes, p.company.industry));
    assert.equal(s.total, s.fit + s.contact + s.dataQuality + s.opportunity);
    assert.ok(s.fit <= 40 && s.contact <= 25 && s.dataQuality <= 20 && s.opportunity <= 15);
    assert.ok(s.reasons.some((r) => r.includes("preferred decision maker")));
    assert.ok(s.total >= 65, `expected Good+ got ${s.total}`);
  });
  it("never gives competitors fit points for commercial/target", () => {
    const p = mapGetleadRow(rows[1] as never)!;
    const s = scoreProspect(p, "Janitorial competitor");
    assert.ok(s.fit <= 10);
  });
  it("bands", () => {
    assert.equal(scoreBand(80), "Priority"); assert.equal(scoreBand(79), "Good");
    assert.equal(scoreBand(50), "Review"); assert.equal(scoreBand(49), "Hold");
  });
});

describe("classification from real pilot patterns", () => {
  it("uses LinkedIn industry over non-primary NAICS", () => {
    assert.equal(classifyBusiness(["523910", "493110", "493120"], "Warehousing and Storage"), "Warehouse");
    assert.equal(classifyBusiness(["541512", "621999", "621111"], "Medical Practices"), "Medical office");
  });
  it("splits real estate by NAICS", () => {
    assert.equal(classifyBusiness(["541611", "531110", "531210"], "Real Estate"), "Commercial real estate");
    assert.equal(classifyBusiness(["444110", "531210"], "Real Estate"), "Real estate brokerage");
    assert.equal(classifyBusiness(["531311", "561110", "531210"], "Real Estate"), "Property management");
  });
});

describe("registry waterfall", async () => {
  const { sameBusiness } = await import("../lib/registry");
  const { mapCasosRow } = await import("../lib/providers/casos");
  const { parseHtmlTables, mapFresnoRow } = await import("../lib/providers/fresnoBiz");
  const { isoDate } = await import("../lib/registryTypes");
  it("matches the same business across sources", () => {
    assert.ok(sameBusiness("Valley Dental Group, Inc.", "VALLEY DENTAL GROUP INC"));
    assert.ok(sameBusiness("Valley Dental", "Valley Dental Group"));
    assert.equal(sameBusiness("Valley", "Valley Dental Group"), false); // too short to trust
    assert.equal(sameBusiness("Bright Smiles Dental", "Bright Ideas LLC"), false);
  });
  it("maps CA SOS rows whatever the key casing", () => {
    const r = mapCasosRow({ EntityID: "B20260012345", EntityName: "Oak Street Dental LLC", entityType: "LLC", FormationDate: "09/28/2026", entityCity: "Bakersfield", entityZipCode: "93301" })!;
    assert.equal(r.externalId, "B20260012345");
    assert.equal(r.filedDate, "2026-09-28");
    assert.equal(r.city, "Bakersfield");
    assert.equal(mapCasosRow({ entityName: "No Id" }), null);
  });
  it("reads the Fresno new-business table by header", () => {
    const rows = parseHtmlTables(`<table><tr><th>Business Name</th><th>Address</th><th>Business Type</th><th>Start Date</th></tr>
      <tr><td>Fig &amp; Olive Pediatrics</td><td>123 W Shaw Ave</td><td>Medical Office</td><td>10/01/2026</td></tr></table>`);
    const r = mapFresnoRow(rows[0])!;
    assert.equal(r.name, "Fig & Olive Pediatrics");
    assert.equal(r.address, "123 W Shaw Ave");
    assert.equal(r.businessType, "Medical Office");
    assert.equal(r.filedDate, "2026-10-01");
    assert.equal(r.city, "Fresno");
  });
  it("normalizes dates", () => { assert.equal(isoDate("2026-10-02T00:00:00Z"), "2026-10-02"); assert.equal(isoDate(""), null); });
});
