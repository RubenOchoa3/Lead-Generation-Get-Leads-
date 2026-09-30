#!/usr/bin/env python3
"""Upsert a scored leads CSV (output of score_leads.py) into Supabase.

Usage:
    DATABASE_URL=postgres://... python3 pipeline/load_leads.py data/pilot_bakersfield_healthcare/leads_scored.csv
    DATABASE_URL=postgres://... python3 pipeline/load_leads.py data/test_bakersfield_icp/leads_scored.csv

Companies are matched on website domain (fallback: normalized name); leads on email.
Existing rows are updated, nothing is deleted.
"""
import csv
import os
import re
import sys

import psycopg

TIER_BY_LABEL = {
    "facilities / building / property lead": 1,
    "operations lead": 2,
    "practice / clinic / office administrator": 3,
    "owner / executive": 4,
    "other manager or clinician (fallback)": 5,
    "not a buyer role": 6,
}


def domain_of(url):
    return (url or "").lower().replace("https://", "").replace("http://", "").replace("www.", "").split("/")[0] or None


def norm(s):
    return re.sub(r"[^a-z0-9]", "", (s or "").lower())


def tier_from_reason(reason):
    for label, tier in TIER_BY_LABEL.items():
        if label in (reason or ""):
            return tier
    return None


def main(path):
    list_name = os.path.basename(os.path.dirname(os.path.abspath(path)))
    rows = list(csv.DictReader(open(path)))
    n_c = n_l = 0
    with psycopg.connect(os.environ["DATABASE_URL"]) as conn:
        for r in rows:
            dom = domain_of(r.get("Website"))
            key = norm(r.get("Company"))
            cid = conn.execute(
                """insert into companies (domain, name_key, name, business_type, address, city, county, state,
                                          website, phone, size_band, source)
                   values (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
                   on conflict (domain) do update set name=excluded.name, business_type=excluded.business_type,
                     address=excluded.address, city=excluded.city, county=excluded.county, state=excluded.state,
                     website=excluded.website, phone=coalesce(excluded.phone, companies.phone),
                     size_band=excluded.size_band
                   returning id""" if dom else
                """insert into companies (domain, name_key, name, business_type, address, city, county, state,
                                          website, phone, size_band, source)
                   values (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
                   on conflict (name_key) do update set business_type=excluded.business_type,
                     address=excluded.address, city=excluded.city, phone=coalesce(excluded.phone, companies.phone)
                   returning id""",
                (dom, key, r["Company"], r.get("Business type"), r.get("Address"), r.get("City"),
                 r.get("County"), r.get("State"), r.get("Website"), r.get("Company phone") or None,
                 r.get("Company size"), r.get("Source")),
            ).fetchone()[0]
            n_c += 1
            email = (r.get("Email") or "").lower().strip() or None
            if not email:
                continue  # leads without an email cannot be joined to email events
            conn.execute(
                """insert into leads (company_id, email, full_name, title, title_tier, email_status, direct_phone,
                                      linkedin_url, contact_city, location_match, lead_score, fit_score,
                                      contact_score, score_reason, list_name, source, date_found)
                   values (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
                   on conflict (email) do update set company_id=excluded.company_id, full_name=excluded.full_name,
                     title=excluded.title, title_tier=excluded.title_tier, email_status=excluded.email_status,
                     direct_phone=coalesce(excluded.direct_phone, leads.direct_phone),
                     linkedin_url=excluded.linkedin_url, contact_city=excluded.contact_city,
                     location_match=excluded.location_match, lead_score=excluded.lead_score,
                     fit_score=excluded.fit_score, contact_score=excluded.contact_score,
                     score_reason=excluded.score_reason, list_name=excluded.list_name""",
                (cid, email, r.get("Decision maker"), r.get("Title"), tier_from_reason(r.get("Short reason")),
                 r.get("Verification"), r.get("Direct phone") or None, r.get("LinkedIn") or None,
                 r.get("Contact city"), r.get("Location match"), int(r["Lead score"]), int(r["Fit score"]),
                 int(r["Contact score"]), r.get("Short reason"), list_name, r.get("Source"), r.get("Date found")),
            )
            n_l += 1
        conn.commit()
    print(f"{path}: {n_c} companies, {n_l} leads upserted (list {list_name})")


if __name__ == "__main__":
    for p in sys.argv[1:]:
        main(p)
