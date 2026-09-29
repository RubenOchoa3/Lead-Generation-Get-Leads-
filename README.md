# RS Commercial Cleaning Lead Generation OS

Lead sourcing, scoring and audit pipeline for R&S Central Valley Cleaning
(rscentralvalleycleaning.com). Data comes from the GetLeads MCP connector attached to
the Claude account; nothing here sends email or launches campaigns.

## Layout

```
docs/RS_LEAD_SPEC.md                 target definition, decision-maker priority, scoring rules
pipeline/score_leads.py              dedupe + best-contact-per-company + 0-100 scoring + audit
data/pilot_bakersfield_healthcare/   pilot 1: Bakersfield medical / dental / clinics
  raw/                               GetLeads search pages as returned (append-only)
  leads_scored.csv                   top 100 pilot leads
  leads_all_scored.csv               every unique business found, scored
  audit.json / PILOT_AUDIT.md        pilot audit
```

## Run

```
python3 pipeline/score_leads.py data/pilot_bakersfield_healthcare --top 100
```

## Rules

- No outreach from this repo. Scoring and list-building only.
- Raw pages are never edited or deleted; corrections go in `raw/enrichment_overlay.json`.
- Larger pulls wait for pilot approval.
