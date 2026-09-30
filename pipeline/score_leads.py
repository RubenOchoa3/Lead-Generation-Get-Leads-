#!/usr/bin/env python3
"""RS Commercial Cleaning Lead Generation OS - pilot scoring pipeline.

Reads raw GetLeads search_contacts JSON pages, de-duplicates contacts and
companies, picks the best decision maker per company, scores each lead 0-100
against the RS Lead Spec (docs/RS_LEAD_SPEC.md), and writes:

    <folder>/leads_scored.csv        top-N pilot list (in-scope facilities only)
    <folder>/leads_all_scored.csv    every unique business, including filtered ones
    <folder>/audit.json              pilot audit numbers

Usage:
    python3 pipeline/score_leads.py data/pilot_bakersfield_healthcare [--top 100]
"""
import csv
import glob
import json
import os
import re
import sys
from collections import Counter
from datetime import date

TARGET_CITY = "bakersfield"
TARGET_STATE = "california"
TARGET_COUNTY = "Kern County"
KERN_COUNTY_TOWNS = {"delano", "taft", "tehachapi", "wasco", "shafter", "lake isabella", "ridgecrest",
                     "arvin", "mcfarland", "lamont", "oildale", "frazier park", "california city",
                     "rosamond", "mojave", "buttonwillow", "kernville"}
SOURCE = "GetLeads MCP (search_contacts)"

# ---------------------------------------------------------------------------
# Business type classification
# (label, facility points 0-20, recurring-cleaning points 0-10, in_scope)
# ---------------------------------------------------------------------------
BUSINESS_TYPES = {
    "Medical office / physician group": (20, 10, True),
    "Dental / orthodontic office": (20, 10, True),
    "Clinic / community health center": (20, 10, True),
    "Urgent care / occupational medicine": (20, 10, True),
    "Surgery / imaging center": (20, 10, True),
    "Hospital / medical center": (20, 6, True),   # big facility, but often in-house EVS
    "Dialysis center": (19, 9, True),
    "Diagnostic laboratory / blood bank": (18, 9, True),
    "Physical therapy / rehab": (18, 9, True),
    "Optometry / eye care": (18, 9, True),
    "Chiropractic / podiatry": (16, 8, True),
    "Behavioral / mental health clinic": (16, 8, True),
    "Skilled nursing / residential care": (18, 8, True),
    "Hospice / PACE / senior services (office + care site)": (12, 6, True),
    "Healthcare admin / management office": (12, 7, True),
    "Home health agency (office only)": (6, 4, True),
    "Health services (unclear facility)": (10, 5, True),
    # non-healthcare ICP types (pilot 2+)
    "Office building / professional office": (18, 9, True),
    "Property management / commercial real estate": (20, 10, True),
    "Warehouse / logistics facility": (18, 9, True),
    "Industrial / oilfield / plant facility": (18, 8, True),
    "Manufacturing facility": (18, 9, True),
    "School / education campus": (20, 9, True),
    "Church / religious facility": (16, 8, True),
    "Gym / fitness / recreation center": (18, 9, True),
    "Retail center / auto dealership": (18, 9, True),
    "Daycare / child care center": (18, 9, True),
    "Coworking / shared office": (18, 9, True),
    "Government / public facility": (14, 7, True),
    "Non-facility (telehealth / staffing / software / billing)": (3, 2, False),
    "Out of scope (insurer / nonprofit / foundation / retail)": (2, 1, False),
}


def _has(blob, *words):
    return any(w in blob for w in words)


HEALTH_INDUSTRIES = ("hospital", "health", "medical", "dentist", "physician", "mental", "outpatient",
                     "chiropract", "optomet", "therap", "nursing", "laborator", "alternative medicine",
                     "wellness and fitness services", "veterinary")


def classify_icp(rec):
    """Non-healthcare ICP types. Returns a label or None when the record looks like healthcare."""
    name = (rec.get("Company Name") or "").lower()
    ind = (rec.get("Company Industry (LinkedIn)") or "").lower()
    naics = (rec.get("NAICS Industry Description") or "").lower()
    spec = (rec.get("Company Specialties (LinkedIn)") or "").lower()
    blob = " ".join([name, ind, naics, spec])
    if _has(ind, *HEALTH_INDUSTRIES) and not _has(ind, "wellness and fitness"):
        return None
    if _has(name, "foundation", "endowment", "scholarship fund"):
        return "Out of scope (insurer / nonprofit / foundation / retail)"
    if _has(name, "computer", "technology", "software", "systems inc", "it solutions"):
        return "Office building / professional office"
    if _has(ind, "wellness and fitness", "recreational") or _has(name, "gym", "fitness", "athletic", "crossfit", "yoga"):
        if _has(blob, "gym", "fitness", "recreation", "sports", "athletic", "yoga", "crossfit"):
            return "Gym / fitness / recreation center"
        return None
    if _has(ind, "day care") or _has(name, "daycare", "day care", "preschool", "child care", "learning center"):
        return "Daycare / child care center"
    if _has(name, "coworking", "co-working", "shared office", "executive suites") or _has(blob, "coworking"):
        return "Coworking / shared office"
    if _has(ind, "religious") or _has(name, "church", "ministries", "chapel", "parish", "temple", "mosque"):
        return "Church / religious facility"
    if _has(ind, "education", "primary and secondary") or _has(name, "school", "academy", "unified", "college", "charter"):
        return "School / education campus"
    if _has(ind, "retail motor vehicles") or _has(name, "dealership", "motors", "auto group", "toyota", "ford", "chevrolet", "honda", "nissan"):
        return "Retail center / auto dealership"
    if _has(ind, "retail") or _has(name, "shopping center", "plaza", "mall", "marketplace"):
        return "Retail center / auto dealership"
    if _has(ind, "warehousing", "logistics", "truck transportation", "freight") or _has(name, "warehouse", "logistics", "distribution", "cold storage"):
        return "Warehouse / logistics facility"
    if _has(ind, "manufacturing", "fabricated metal", "food and beverage manufacturing", "machinery") or _has(name, "manufacturing", "mfg", "fabrication", "packing", "bottling"):
        return "Manufacturing facility"
    if _has(ind, "oil and gas", "oil; gas", "mining", "utilities", "environmental services", "renewable", "solar", "electric power", "farming", "agricultur") or _has(name, "oilfield", "energy", "petroleum", "drilling", "pipeline"):
        return "Industrial / oilfield / plant facility"
    if _has(ind, "real estate", "leasing") or _has(blob, "property management", "commercial real estate", "office park", "landlord"):
        return "Property management / commercial real estate"
    if _has(ind, "government", "public"):
        return "Government / public facility"
    if _has(ind, "law practice", "legal", "accounting", "insurance", "banking", "financial", "executive offices", "consulting", "engineering", "architecture", "staffing", "advertising", "marketing", "software", "it services"):
        return "Office building / professional office"
    if _has(ind, "construction"):
        return "Office building / professional office"
    return None


def classify_business(rec):
    icp = classify_icp(rec)
    if icp:
        return icp
    name = (rec.get("Company Name") or "").lower()
    ind = (rec.get("Company Industry (LinkedIn)") or "").lower()
    naics_all = (rec.get("NAICS Industry Description") or "").lower()
    naics1 = naics_all.split(";")[0] if naics_all else ""
    spec = (rec.get("Company Specialties (LinkedIn)") or "").lower()
    head = (rec.get("Company Headline (LinkedIn)") or "").lower()

    # 1) hard out-of-scope signals
    if _has(name, "telemed", "telehealth", "tele-", "telespeech") or _has(head, "telehealth", "virtual care"):
        return "Non-facility (telehealth / staffing / software / billing)"
    if _has(name, " rcm", "billing", "staffing", "recruit", "consult", "compliance", "software",
            "technolog", "analytics", "pharmaceutical adherence"):
        return "Non-facility (telehealth / staffing / software / billing)"
    if _has(ind, "insurance", "staffing", "software", "it services", "financial"):
        return "Non-facility (telehealth / staffing / software / billing)"
    if _has(ind, "construction", "accounting", "law practice", "legal", "real estate", "retail pharmacies",
            "marketing", "advertising", "wholesale", "manufacturing") or \
       _has(name, "construction", "cpa", "accountan", "pharmacy", "drugs", "disposal", "waste", "supply",
            "medical equipment", "audiology corp", "veterinary", "animal hospital") or _has(ind, "veterinary"):
        return "Out of scope (insurer / nonprofit / foundation / retail)"
    if _has(name, "foundation", "alliance for health", "health plan", "placement") or \
       _has(naics1, "insurance carriers", "grantmaking", "employment placement"):
        return "Out of scope (insurer / nonprofit / foundation / retail)"

    # 2) company-name keywords (most reliable)
    if _has(name, "dental", "dentist", "orthodont", "oral surg", "endodont", "periodont", "smile"):
        return "Dental / orthodontic office"
    if _has(name, "urgent care", "occupational med", "occupational health", "walk-in"):
        return "Urgent care / occupational medicine"
    if _has(name, "surgery center", "surgical center", "surgical", "imaging", "radiology", " mri", "radnet"):
        return "Surgery / imaging center"
    if _has(name, "dialysis", "kidney", "renal", "nephrology"):
        return "Dialysis center"
    if _has(name, "blood bank", "laborator", "pathology", "diagnostic"):
        return "Diagnostic laboratory / blood bank"
    if _has(name, "eye", "vision", "optomet", "ophthalm", "laser center"):
        return "Optometry / eye care"
    if _has(name, "chiropract", "podiatry", "spine"):
        return "Chiropractic / podiatry"
    if _has(name, "physical therap", "rehab", "neuro skills", "orthotic", "prosthetic", "burn center",
            "skilled care", "encompass health", "ernest health"):
        return "Physical therapy / rehab"
    if _has(name, "hospice", "pace ", "pace by", "senior"):
        return "Hospice / PACE / senior services (office + care site)"
    if _has(name, "home health", "home care", "healthcare llc", "nurses home"):
        return "Home health agency (office only)"
    if _has(name, "behavioral", "counseling", "psychiatr", "mental health", "recovery", "treatment",
            "child guidance", "cognitive", "aspiranet", "telecare", "aegis"):
        return "Behavioral / mental health clinic"
    if _has(name, "hospital", "medical center", "health care district", "healthcare district",
            "kern medical", "kaiser", "dignity", "adventist", "commonspirit", "honorhealth", "stanford health"):
        return "Hospital / medical center"
    if _has(name, "family health", "community health", "health center", "clinic", "clinica",
            "health project", "komoto"):
        return "Clinic / community health center"
    if _has(name, "medical group", "medical corporation", "physicians", "medical associates",
            "cardiovascular", "neurology", "oncology", "cancer center", "pediatric", "anesthesia",
            "dermatology", "institute", "medical", " md", "health group"):
        return "Medical office / physician group"
    if _has(name, "skilled", "nursing", "assisted living", "brookdale", "sevita"):
        return "Skilled nursing / residential care"

    # 3) LinkedIn industry tag
    if "dentist" in ind:
        return "Dental / orthodontic office"
    if "chiropract" in ind:
        return "Chiropractic / podiatry"
    if "optomet" in ind:
        return "Optometry / eye care"
    if "physical" in ind and "therap" in ind:
        return "Physical therapy / rehab"
    if "laborator" in ind:
        return "Diagnostic laboratory / blood bank"
    if "nursing" in ind or "residential care" in ind:
        return "Skilled nursing / residential care"
    if "mental health" in ind:
        return "Behavioral / mental health clinic"
    if "home health" in ind:
        return "Home health agency (office only)"
    if "outpatient" in ind:
        return "Clinic / community health center"
    if ind in ("hospitals",):
        return "Hospital / medical center"

    # 4) first NAICS description, then specialties
    blob = naics1 + " " + spec
    if _has(blob, "dentist", "orthodont"):
        return "Dental / orthodontic office"
    if _has(blob, "hospital"):
        return "Hospital / medical center"
    if _has(blob, "offices of physicians"):
        return "Medical office / physician group"
    if _has(blob, "outpatient", "ambulatory"):
        return "Clinic / community health center"
    if _has(blob, "nursing care", "assisted living", "residential"):
        return "Skilled nursing / residential care"
    if _has(blob, "mental health", "substance abuse", "counseling"):
        return "Behavioral / mental health clinic"
    if _has(blob, "home health"):
        return "Home health agency (office only)"
    if _has(blob, "office administrative", "management"):
        return "Healthcare admin / management office"
    if ind == "medical practices":
        return "Medical office / physician group"
    return "Health services (unclear facility)"


# ---------------------------------------------------------------------------
# Decision-maker title ranking
# tier -> (points out of 25, label)
# ---------------------------------------------------------------------------
TITLE_TIERS = {
    1: (25, "facilities / building / property lead"),
    2: (22, "operations lead"),
    3: (20, "practice / clinic / office administrator"),
    4: (17, "owner / executive"),
    5: (10, "other manager or clinician (fallback)"),
    6: (0, "not a buyer role"),
}


def _w(pattern, text):
    """Whole-word regex match."""
    return re.search(r"\b" + pattern + r"\b", text) is not None


NON_BUYER = ["physician assistant", "nurse practitioner", "resident physician", "registered nurse",
             "intern", "student", "fellow", "technician", "hygienist", "receptionist", "clerk",
             "coordinator", "specialist", "analyst", "engineer", "developer", "recruiter",
             "human resources", "hr", "payroll", "talent", "benefits", "marketing", "communications",
             "sales", "grants", "donor", "fundrais", "controller", "accountant", "accounting", "finance",
             "billing", "coding", "database", "network", "system", "systems", "technology", "it",
             "cybersecurity", "quality", "compliance", "risk", "utilization", "case manager",
             "social worker", "counselor", "therapist", "clinical supervisor", "clincal supervisor",
             "program supervisor", "program manager", "program director", "behavioral health supervisor",
             "analytics", "data", "business development", "revenue cycle", "credentialing", "referral",
             "product owner", "executive assistant", "administrative assistant", "assistant to",
             "board member", "liaison", "advocate", "instructional", "lms", "pharmacy technician",
             "pharmacist", "dietitian", "chaplain", "volunteer"]


def title_tier(title):
    t = (title or "").lower().replace("&", " and ")
    t = re.sub(r"[^a-z0-9 ]", " ", t)
    t = re.sub(r"\s+", " ", t).strip()
    if not t:
        return 6
    # 1) facilities-type buyers win even if the title also mentions something else
    if _w(r"facilit(y|ies)", t) or _w(r"building", t) or _w(r"property", t) or \
       _w(r"plant operations", t) or _w(r"environmental services", t) or _w(r"evs", t) or \
       _w(r"maintenance (manager|director|supervisor)", t) or _w(r"(plant|warehouse) manager", t) or \
       _w(r"operations and maintenance", t):
        if _w(r"(assistant|asst|ass)", t):
            return 5
        if not _w(r"(direct care staff|technician|coordinator)", t):
            return 1
    # 2) explicit non-buyer functions
    for kw in NON_BUYER:
        if _w(re.escape(kw), t):
            # "Administrator, President" style dual titles still count as buyers
            if _w(r"(president|owner|ceo|chief executive)", t) and not _w(r"(vice president|assistant)", t):
                break
            return 6
    # 3) operations
    if _w(r"operations?", t) or _w(r"chief operating officer", t) or _w(r"coo", t):
        return 2
    # 4) practice / clinic / office administration
    if _w(r"(practice|clinic|clinical|office|business|dental|medical|hospital|site|center|regional|district|health services|facility) (manager|administrator|director)", t) or \
       _w(r"administrator", t) or _w(r"executive director", t) or _w(r"general manager", t) or \
       _w(r"office manager", t) or _w(r"practice manager", t) or _w(r"clinic manager", t) or \
       _w(r"director of nursing", t) or _w(r"nursing director", t) or _w(r"center manager", t):
        return 3
    # 5) owner / executive
    if _w(r"(owner|founder|co founder|president|ceo|chief executive officer|principal|pastor|superintendent|managing partner|partner|managing director|medical director|dental director|chief)", t) \
       and not _w(r"vice president", t):
        return 4
    # 6) fallback managers and clinicians who may own the practice
    if _w(r"(manager|director|supervisor|vice president|vp|head)", t):
        return 5
    if _w(r"(dentist|dds|dmd|orthodontist|physician|md|doctor|optometrist|chiropractor|surgeon|podiatrist)", t):
        return 5
    return 6


# ---------------------------------------------------------------------------
# Scoring helpers
# ---------------------------------------------------------------------------
def norm(s):
    return re.sub(r"[^a-z0-9]", "", (s or "").lower())


def company_key(rec):
    dom = (rec.get("Company Domain") or "").lower().strip()
    if dom:
        return "dom:" + dom
    return "name:" + norm(rec.get("Company Name"))


def size_score(rng, count):
    """Best fit for recurring commercial cleaning: 11-500 staff facilities."""
    rng = rng or ""
    if rng in ("11 to 50", "51 to 200"):
        return 10
    if rng == "201 to 500":
        return 9
    if rng == "501 to 1000":
        return 7
    if rng == "1 to 10":
        return 6 if (count or 0) >= 12 else 4
    if rng == "1001 to 5000":
        return 5
    if rng in ("5001 to 10000", "10001+"):
        return 3
    return 4


def location_score(rec, tier):
    cc = (rec.get("Company City") or "").strip().lower()
    cs = (rec.get("Company State") or "").strip().lower()
    hc = (rec.get("HQ City") or "").strip().lower()
    pc = (rec.get("Contact City") or "").strip().lower()
    ps = (rec.get("Contact State") or "").strip().lower()
    if cc == TARGET_CITY and cs == TARGET_STATE:
        return 15, "Bakersfield address"
    if hc == TARGET_CITY:
        return 14, "HQ in Bakersfield"
    if cc in KERN_COUNTY_TOWNS:
        return 10, f"Kern County ({rec.get('Company City')}), not Bakersfield"
    if not cc and not hc and "about_mentions_bakersfield" in (rec.get("_page") or ""):
        return 12, "no address on file; company About text mentions Bakersfield"
    if pc == TARGET_CITY:
        multi_site = (rec.get("LinkedIn Location Count") or 0) >= 2 or \
            (rec.get("Employee Count Range") or "") in ("201 to 500", "501 to 1000", "1001 to 5000",
                                                        "5001 to 10000", "10001+")
        if not multi_site:
            return 4, f"single-site company in {rec.get('Company City') or 'unknown city'}; only the contact lives in Bakersfield"
        # a facility-level buyer living in Bakersfield usually runs the local site of a chain
        bonus = 2 if tier <= 3 else 0
        if cs == TARGET_STATE:
            return 8 + bonus, "multi-site company; contact based in Bakersfield, HQ elsewhere in CA"
        return 6 + bonus, "multi-site company; contact based in Bakersfield, HQ out of state"
    if cs == TARGET_STATE or ps == TARGET_STATE:
        return 3, "California, not Bakersfield"
    return 0, "location does not match"


def phone_fields(rec):
    cell = (rec.get("Cellphone") or "").strip()
    direct = (rec.get("Direct Office Phone") or "").strip()
    comp = (rec.get("Company Phone") or "").strip()
    return cell, direct, comp


def score_lead(rec):
    btype = classify_business(rec)
    fac, rec_pts, in_scope = BUSINESS_TYPES[btype]
    tier = title_tier(rec.get("Current Job Title"))
    loc_pts, loc_reason = location_score(rec, tier)
    sz = size_score(rec.get("Employee Count Range"), rec.get("LinkedIn Employee Profile Count"))
    fit = fac + rec_pts + loc_pts + sz  # max 55

    title_pts, title_label = TITLE_TIERS[tier]
    email_ok = bool(rec.get("Email")) and (rec.get("Email Verification Status") or "").upper() == "VALID"
    email_pts = 10 if email_ok else 0
    cell, direct, comp = phone_fields(rec)
    phone_pts = 7 if (cell or direct) else (3 if comp else 0)
    li_pts = 3 if rec.get("Contact LinkedIn URL") else 0
    contact = title_pts + email_pts + phone_pts + li_pts  # max 45

    total = fit + contact
    reasons = [btype, loc_reason, f"size {rec.get('Employee Count Range') or 'n/a'}", title_label,
               "verified email" if email_ok else "no verified email",
               "direct phone" if (cell or direct) else ("company phone only" if comp else "no phone")]
    return {
        "score": total, "fit": fit, "contact": contact, "business_type": btype,
        "in_scope": in_scope, "title_tier": tier, "reason": "; ".join(reasons),
        "has_direct_phone": bool(cell or direct), "email_ok": email_ok,
        "loc_reason": loc_reason,
    }


def load_raw(folder):
    contacts, pages = [], []
    overlay = {}
    ov_path = os.path.join(folder, "raw", "enrichment_overlay.json")
    if os.path.exists(ov_path):
        with open(ov_path) as fh:
            for o in json.load(fh).get("overlay", []):
                overlay[o["Contact LinkedIn URL"].lower()] = o
    for path in sorted(glob.glob(os.path.join(folder, "raw", "*.json"))):
        if path == ov_path:
            continue
        with open(path) as fh:
            data = json.load(fh)
        pages.append({"file": os.path.basename(path), "rows": len(data.get("contacts", [])),
                      "credits": data.get("query_credits_used", 0)})
        for c in data.get("contacts", []):
            c["_page"] = os.path.basename(path)
            o = overlay.get((c.get("Contact LinkedIn URL") or "").lower())
            if o:
                for k, v in o.items():
                    if k != "Contact LinkedIn URL" and not c.get(k):
                        c[k] = v
            contacts.append(c)
    return contacts, pages


def write_csv(path, leads, today):
    fields = ["Rank", "Company", "Business type", "Address", "City", "County", "State", "Website",
              "Company phone", "Decision maker", "Title", "Email", "Verification", "Direct phone",
              "LinkedIn", "Contact city", "Location match", "Company size", "Source", "Date found",
              "Lead score", "Fit score", "Contact score", "Short reason"]
    with open(path, "w", newline="") as fh:
        w = csv.DictWriter(fh, fieldnames=fields)
        w.writeheader()
        for i, c in enumerate(leads, 1):
            s = c["_s"]
            cell, direct, comp = phone_fields(c)
            city = c.get("Company City") or c.get("HQ City") or ""
            in_kern = city.lower() == TARGET_CITY or city.lower() in KERN_COUNTY_TOWNS
            w.writerow({
                "Rank": i, "Company": c.get("Company Name"), "Business type": s["business_type"],
                "Address": c.get("Company Street Address") or "", "City": city,
                "County": TARGET_COUNTY if in_kern else "",
                "State": c.get("Company State") or c.get("HQ State") or "",
                "Website": c.get("Company Website") or "", "Company phone": comp,
                "Decision maker": c.get("Contact Full Name"), "Title": c.get("Current Job Title"),
                "Email": c.get("Email") or "", "Verification": c.get("Email Verification Status") or "NONE",
                "Direct phone": cell or direct, "LinkedIn": c.get("Contact LinkedIn URL") or "",
                "Contact city": c.get("Contact City") or "", "Location match": s["loc_reason"],
                "Company size": c.get("Employee Count Range") or "", "Source": SOURCE,
                "Date found": today, "Lead score": s["score"], "Fit score": s["fit"],
                "Contact score": s["contact"], "Short reason": s["reason"],
            })


def load_exclusions(folder):
    """Company keys already delivered in earlier lists (data/*/leads_scored.csv)."""
    keys = set()
    for path in glob.glob(os.path.join(os.path.dirname(folder.rstrip("/")), "*", "leads_scored.csv")):
        if os.path.abspath(os.path.dirname(path)) == os.path.abspath(folder):
            continue
        with open(path) as fh:
            for row in csv.DictReader(fh):
                dom = (row.get("Website") or "").lower().replace("https://", "").replace("http://", "").replace("www.", "").split("/")[0]
                keys.add("dom:" + dom if dom else "name:" + norm(row.get("Company")))
    return keys


def main(folder, top_n):
    raw, pages = load_raw(folder)
    already = load_exclusions(folder)
    total_rows = len(raw)

    # 1) contact-level dedupe (same person returned by several queries)
    seen, contacts, dup_contacts = set(), [], 0
    for c in raw:
        key = (c.get("Email") or "").lower() or (c.get("Contact LinkedIn URL") or "").lower() \
            or norm(c.get("Contact Full Name")) + "@" + company_key(c)
        if key in seen:
            dup_contacts += 1
            continue
        seen.add(key)
        c["_s"] = score_lead(c)
        contacts.append(c)

    # 2) best decision maker per company
    by_company = {}
    for c in contacts:
        k = company_key(c)
        cur = by_company.get(k)
        rank = (c["_s"]["title_tier"], -c["_s"]["score"],
                0 if (c.get("Contact City") or "").lower() == TARGET_CITY else 1)
        if cur is None or rank < cur["_rank"]:
            c["_rank"] = rank
            by_company[k] = c
    all_leads = sorted(by_company.values(), key=lambda c: -c["_s"]["score"])
    dup_prior = [c for c in all_leads if company_key(c) in already]
    pilot = [c for c in all_leads if c["_s"]["in_scope"] and company_key(c) not in already][:top_n]
    filtered_out = [c for c in all_leads if not c["_s"]["in_scope"]]

    today = date.today().isoformat()
    write_csv(os.path.join(folder, "leads_scored.csv"), pilot, today)
    write_csv(os.path.join(folder, "leads_all_scored.csv"), all_leads, today)

    scores = [c["_s"]["score"] for c in pilot]
    audit = {
        "pilot": os.path.basename(folder.rstrip("/")),
        "date": today,
        "source_pages": pages,
        "credits_used_search_rows": sum(p["credits"] for p in pages),
        "raw_rows_returned": total_rows,
        "duplicate_contact_rows_removed": dup_contacts,
        "unique_contacts": len(contacts),
        "unique_businesses": len(all_leads),
        "duplicate_rate_pct_rows_to_businesses": round(100.0 * (total_rows - len(all_leads)) / total_rows, 1),
        "businesses_filtered_out_of_scope": len(filtered_out),
        "businesses_already_in_earlier_lists": len(dup_prior),
        "filtered_out_names": [c.get("Company Name") for c in filtered_out],
        "pilot_leads_delivered": len(pilot),
        "pilot_decision_makers_tier_1_4": sum(1 for c in pilot if c["_s"]["title_tier"] <= 4),
        "pilot_fallback_manager_or_clinician_tier_5": sum(1 for c in pilot if c["_s"]["title_tier"] == 5),
        "pilot_no_buyer_role_found_tier_6": sum(1 for c in pilot if c["_s"]["title_tier"] == 6),
        "pilot_emails_found": sum(1 for c in pilot if c.get("Email")),
        "pilot_verified_emails": sum(1 for c in pilot if c["_s"]["email_ok"]),
        "pilot_direct_phones_found": sum(1 for c in pilot if c["_s"]["has_direct_phone"]),
        "pilot_company_phones_found": sum(1 for c in pilot if (c.get("Company Phone") or "").strip()),
        "pilot_linkedin_profiles_found": sum(1 for c in pilot if c.get("Contact LinkedIn URL")),
        "pilot_bakersfield_address": sum(1 for c in pilot if (c.get("Company City") or "").lower() == TARGET_CITY),
        "pilot_kern_county_other_town": sum(1 for c in pilot if (c.get("Company City") or "").lower() in KERN_COUNTY_TOWNS),
        "pilot_contact_in_bakersfield_company_elsewhere": sum(1 for c in pilot if c["_s"]["loc_reason"].startswith("contact in Bakersfield")),
        "score_80_plus": sum(1 for s in scores if s >= 80),
        "score_65_79": sum(1 for s in scores if 65 <= s < 80),
        "score_below_65": sum(1 for s in scores if s < 65),
        "business_type_breakdown": dict(Counter(c["_s"]["business_type"] for c in pilot).most_common()),
        "title_tier_breakdown": dict(Counter(TITLE_TIERS[c["_s"]["title_tier"]][1] for c in pilot).most_common()),
    }
    with open(os.path.join(folder, "audit.json"), "w") as fh:
        json.dump(audit, fh, indent=2)
    print(json.dumps({k: v for k, v in audit.items() if k not in ("source_pages", "filtered_out_names")}, indent=2))
    print("filtered out:", ", ".join(audit["filtered_out_names"]))


if __name__ == "__main__":
    args = sys.argv[1:]
    top = 100
    if "--top" in args:
        i = args.index("--top")
        top = int(args[i + 1])
        del args[i:i + 2]
    main(args[0] if args else "data/pilot_bakersfield_healthcare", top)
