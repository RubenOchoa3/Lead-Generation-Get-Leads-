# RS Lead Spec — R&S Central Valley Cleaning

Target customer: a California commercial business or building that plausibly needs
recurring janitorial / commercial cleaning, plus the person at that business who can
buy it.

## 1. Geography

- State: California only. Company must have a physical address in California.
- Pilot market: Bakersfield (Kern County). Nearby Kern County towns (Delano, Taft,
  Tehachapi, Wasco, Shafter, Lake Isabella, Ridgecrest, Arvin) are acceptable at a
  lower location score.
- A contact who lives in Bakersfield but works for a company whose address is elsewhere
  counts only if the company is multi-site (chains such as DaVita, Encompass, Adventist).
  Single-site companies outside Bakersfield are scored low.

## 2. Priority business types

Medical offices, dental offices, office buildings, property management companies,
warehouses, industrial facilities, manufacturing facilities, schools, churches, gyms,
retail centers, auto dealerships, daycares, coworking spaces.

Pilot 1 covers the healthcare slice only: medical offices, dental offices, clinics,
urgent care, surgery and imaging centers, dialysis, labs, rehab, optometry,
behavioral health, skilled nursing, and hospitals.

Explicitly out of scope (filtered before scoring): telehealth-only companies,
staffing/recruiting, billing / RCM, software, insurers and health plans, foundations,
pharmacies, veterinary, construction, accounting, medical-waste haulers.

## 3. Priority decision makers (in order)

1. Facilities Manager / Director of Facilities / Environmental Services lead
2. Building Manager / Property Manager / Asset Manager
3. Operations Manager / Director of Operations / COO
4. Practice Administrator / Practice Manager / Clinic Manager / Office Manager /
   Executive Director / General Manager / Administrator
5. Owner / President / CEO / Medical or Dental Director
6. Fallback: other managers, or the treating dentist / physician at a small practice

Never selected as the buyer: HR, payroll, IT/systems/network, analytics, finance,
marketing, compliance, quality, clinical staff (PA, RN, resident), assistants,
coordinators, grants, program supervisors.

## 4. Fields collected per lead

Company name, business/building type, street address, city, county, state, website,
company phone, decision-maker name, title, email, email verification status, direct
phone (cell or direct office line), LinkedIn URL, contact city, company size band,
source, date found.

## 5. Scoring (0–100)

Fit (max 55)

| Component | Points | Rule |
|---|---|---|
| Commercial facility | 0–20 | By business type (medical/dental/clinic/surgery = 20, rehab/optometry/dialysis/lab/nursing = 18–19, behavioral/chiro = 16, admin office/hospice = 12, home health = 6) |
| Recurring cleaning likely | 0–10 | By business type (daily-patient-traffic facilities = 10, hospitals = 6 because most run in-house EVS, home health = 4) |
| Location | 0–15 | Bakersfield address 15, HQ Bakersfield 14, About text mentions Bakersfield 12, other Kern County town 10, multi-site company with contact in Bakersfield 6–10, single-site elsewhere 4, non-CA 0 |
| Size | 0–10 | 11–200 staff = 10, 201–500 = 9, 501–1000 = 7, 1–10 = 4–6, 1001+ = 3–5 |

Contact quality (max 45)

| Component | Points | Rule |
|---|---|---|
| Decision-maker title | 0–25 | Tier 1 facilities 25, tier 2 operations 22, tier 3 practice/office admin 20, tier 4 owner/exec 17, tier 5 fallback 10, tier 6 non-buyer 0 |
| Verified email | 0–10 | GetLeads status VALID = 10 |
| Phone | 0–7 | Cell or direct line 7, company main line only 3 |
| LinkedIn | 0–3 | Profile URL present |

Bands: 80+ = ready for outreach review; 65–79 = usable, verify one gap first;
below 65 = park.

## 6. De-duplication

1. Contact level: same email, else same LinkedIn URL, else same name at same company.
2. Company level: same website domain, else normalized company name.
3. One lead per company: best title tier, then highest score, then contact located in
   Bakersfield.

## 7. Sources

Pilot 1 uses the GetLeads MCP only (`search_contacts`, `count_contacts`,
`getleads_enrich_person_batch`). Every lead carries `Source = GetLeads MCP`.
Future sources (Google Maps / county business licenses / property records) will be
added as separate raw pages with their own source tag and merged by the same
de-duplication rules.

## 8. Guardrails

- No outreach, no campaigns, no email sends from this pipeline.
- Never delete or overwrite existing lead data without explicit approval; raw pages
  are append-only.
- Every larger pull is approved by Ruben after the pilot audit.
