-- Registry waterfall: newly registered California businesses (CA Secretary of State filings,
-- City of Fresno new business licenses), then enriched with a decision-maker contact from Getlead.
-- Businesses with no contact found are kept as call / in-person leads.
create table if not exists registry_businesses (
  id uuid primary key default gen_random_uuid(),
  source text not null,                  -- ca_sos | fresno_new_business
  external_id text not null,             -- SOS entity number, or a stable key from the city list
  name text not null,
  normalized_name text not null,
  entity_type text,                      -- LLC, Corporation, …
  business_type text,                    -- city license category, when the source gives one
  status text,
  filed_date date,
  address text,
  city text,
  state text,
  postal_code text,
  agent_name text,
  raw jsonb,
  enrichment_status text not null default 'pending'
    check (enrichment_status in ('pending','contact_found','call_or_visit','skipped')),
  enrichment_note text,
  enriched_at timestamptz,
  organization_id uuid references organizations(id) on delete set null,
  contact_name text,
  contact_title text,
  contact_email text,
  contact_phone text,
  first_seen_at timestamptz not null default now(),
  unique (source, external_id)
);
create index if not exists registry_businesses_status_idx on registry_businesses (enrichment_status, filed_date desc);
