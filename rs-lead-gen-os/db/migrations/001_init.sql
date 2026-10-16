-- R&S Lead Generation OS — Railway PostgreSQL schema v1
-- Ported from the original Supabase schema (column names preserved where possible).

create extension if not exists pgcrypto;

-- ───────────────────────── Organizations ─────────────────────────
create table if not exists organizations (
  id uuid primary key default gen_random_uuid(),
  company_name text not null,
  normalized_company_name text not null,
  business_type text,                    -- R&S target category (medical office, warehouse…)
  industry text,                         -- provider industry label (LinkedIn/NAICS)
  naics_code text,
  employee_range text,
  address text,
  normalized_address text,
  city text,
  county text,
  state text default 'CA',
  postal_code text,
  website text,
  domain text,
  linkedin_url text,
  main_phone text,
  source text not null,                  -- 'Getlead', 'Manual', …
  source_url text,
  external_id text,                      -- provider org id when available
  first_found_at timestamptz not null default now(),
  last_enriched_at timestamptz,
  lead_score integer not null default 0 check (lead_score between 0 and 100),
  score_band text not null default 'Hold',
  score_breakdown jsonb not null default '{}'::jsonb,
  pipeline_status text not null default 'New',   -- New → Qualified → Approved → In Campaign → Replied → Meeting → Customer | Rejected | Suppressed
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists organizations_domain_uq on organizations (lower(domain)) where domain is not null and domain <> '';
create unique index if not exists organizations_external_uq on organizations (source, external_id) where external_id is not null;
create unique index if not exists organizations_name_addr_uq on organizations (normalized_company_name, normalized_address) where normalized_address is not null and normalized_address <> '';
create index if not exists organizations_score_idx on organizations (lead_score desc);
create index if not exists organizations_city_idx on organizations (city);
create index if not exists organizations_created_idx on organizations (created_at desc);

-- ───────────────────────── Contacts ─────────────────────────
create table if not exists contacts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  first_name text,
  last_name text,
  full_name text,
  title text,
  title_priority integer,                 -- 0 = best (Facilities Manager); null = not a priority title
  seniority text,
  email text,
  email_status text,                      -- VALID | CATCH_ALL | INVALID | UNKNOWN
  email_verified_at timestamptz,
  email_confidence integer default 0,
  phone text,
  linkedin_url text,
  source text not null,
  external_id text,
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists contacts_email_uq on contacts (lower(email)) where email is not null and email <> '';
create unique index if not exists contacts_external_uq on contacts (source, external_id) where external_id is not null;
create unique index if not exists contacts_linkedin_uq on contacts (lower(linkedin_url)) where linkedin_url is not null and linkedin_url <> '';
create index if not exists contacts_org_idx on contacts (organization_id);

-- ───────────────────────── Sources / discovery / enrichment ─────────────────────────
create table if not exists lead_sources (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  provider text,
  source_type text,
  enabled boolean not null default true,
  cost_type text,
  notes text
);
insert into lead_sources (name, provider, source_type, cost_type)
values ('Getlead', 'GetLeads', 'contact database', 'plan credits / fair use'),
       ('Manual', 'R&S', 'manual entry', 'none')
on conflict (name) do nothing;

create table if not exists automation_runs (
  id uuid primary key default gen_random_uuid(),
  automation_type text not null,          -- manual_search | daily_lead_engine | getlead_sync | inboxkit_sync | claude_research | campaign_sync
  trigger text not null default 'manual',
  status text not null default 'running', -- running | complete | failed | cancelled
  params jsonb not null default '{}'::jsonb,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  stage text,                             -- current pipeline stage for progress UI
  matches integer default 0,
  businesses_found integer default 0,
  unique_businesses integer default 0,
  duplicates_removed integer default 0,
  decision_makers integer default 0,
  verified_emails integer default 0,
  phones integer default 0,
  linkedin_profiles integer default 0,
  researched integer default 0,
  priority_count integer default 0,
  good_count integer default 0,
  review_count integer default 0,
  queued integer default 0,
  failed integer default 0,
  provider_usage jsonb not null default '{}'::jsonb,
  error_summary text,
  log jsonb not null default '[]'::jsonb
);
-- Prevent duplicate concurrent runs of the same automation.
create unique index if not exists automation_runs_one_running on automation_runs (automation_type) where status = 'running';
create index if not exists automation_runs_started_idx on automation_runs (started_at desc);

create table if not exists discovery_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  run_id uuid references automation_runs(id) on delete set null,
  source text not null,
  query jsonb,
  was_duplicate boolean not null default false,
  found_at timestamptz not null default now()
);
create index if not exists discovery_events_org_idx on discovery_events (organization_id);

create table if not exists enrichment_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references organizations(id) on delete cascade,
  contact_id uuid references contacts(id) on delete set null,
  provider text not null,
  enrichment_type text not null,
  request_status text not null,
  credits_used numeric default 0,
  detail text,
  created_at timestamptz not null default now()
);

-- ───────────────────────── Research (Claude) ─────────────────────────
create table if not exists research (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  business_summary text not null,
  likely_cleaning_need text,
  personalization_note text,
  outreach_angle text,
  confidence integer check (confidence between 0 and 100),
  uncertainty_notes text,
  sources_used jsonb not null default '[]'::jsonb,
  model text,                              -- which Claude model/session produced it
  researched_at timestamptz not null default now()
);
create index if not exists research_org_idx on research (organization_id, researched_at desc);

-- ───────────────────────── Approval queue ─────────────────────────
create table if not exists approval_queue (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null unique references organizations(id) on delete cascade,
  contact_id uuid references contacts(id) on delete set null,
  status text not null default 'Needs Review' check (status in ('Needs Review','Approved','Rejected','Suppressed','Needs Research')),
  why_selected text,
  queued_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by text,
  rejection_reason text,
  notes text
);
create index if not exists approval_queue_status_idx on approval_queue (status, queued_at desc);

-- ───────────────────────── Campaigns / outreach ─────────────────────────
create table if not exists campaigns (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  provider text,                           -- sender platform once chosen
  external_id text,
  status text not null default 'Draft',    -- Draft | Pending Approval | Active | Paused | Completed
  audience jsonb not null default '{}'::jsonb,
  daily_send_limit integer,
  follow_up_count integer,
  sending_window jsonb,
  start_date date,
  claude_personalization boolean not null default true,
  require_approval_before_launch boolean not null default true,
  launch_approved_at timestamptz,
  launch_approved_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists campaigns_external_uq on campaigns (provider, external_id) where external_id is not null;

create table if not exists campaign_contacts (
  campaign_id uuid not null references campaigns(id) on delete cascade,
  contact_id uuid not null references contacts(id) on delete cascade,
  added_at timestamptz not null default now(),
  primary key (campaign_id, contact_id)
);

create table if not exists outreach_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references organizations(id) on delete cascade,
  contact_id uuid references contacts(id) on delete set null,
  campaign_id uuid references campaigns(id) on delete set null,
  mailbox text,
  event_type text not null,                -- sent | reply | bounce | unsubscribe | complaint | meeting_booked | closed_won | closed_lost
  occurred_at timestamptz not null default now(),
  step integer,
  subject text,
  reply_preview text,
  reply_classification text,               -- Positive | Neutral | Not Interested | Referral | Out of Office | Unsubscribe | Other
  revenue numeric default 0,
  external_id text,
  provider text
);
create unique index if not exists outreach_events_external_uq on outreach_events (provider, external_id) where external_id is not null;
create index if not exists outreach_events_type_time_idx on outreach_events (event_type, occurred_at desc);

-- ───────────────────────── Infrastructure (InboxKit) ─────────────────────────
create table if not exists domains (
  id uuid primary key default gen_random_uuid(),
  domain text not null unique,
  registrar text,
  provider text not null default 'InboxKit',
  external_id text,
  status text,
  dns_status text,
  spf_ok boolean,
  dkim_ok boolean,
  dmarc_ok boolean,
  mailbox_count integer default 0,
  health text,
  is_primary_business_domain boolean not null default false,
  created_on_provider timestamptz,
  last_sync_at timestamptz
);

create table if not exists mailboxes (
  id uuid primary key default gen_random_uuid(),
  address text not null unique,
  domain text not null,
  provider text not null default 'InboxKit',
  platform text,                           -- GOOGLE | MICROSOFT
  external_id text,
  status text,
  warmup_status text,
  health text,
  daily_send_limit integer,
  sent_today integer,
  bounce_rate numeric,
  sequencer text,
  campaign text,
  last_sync_at timestamptz
);

-- ───────────────────────── Suppression ─────────────────────────
create table if not exists suppression_list (
  id uuid primary key default gen_random_uuid(),
  email text,
  domain text,
  organization_id uuid references organizations(id) on delete cascade,
  suppression_type text not null check (suppression_type in ('opt_out','manual','invalid_email','hard_bounce','complaint','competitor','existing_customer','primary_domain')),
  reason text,
  source text,
  created_at timestamptz not null default now()
);
create index if not exists suppression_email_idx on suppression_list (lower(email));
create index if not exists suppression_domain_idx on suppression_list (lower(domain));

-- ───────────────────────── Settings ─────────────────────────
create table if not exists settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

insert into settings (key, value) values
  ('business', '{"name":"R&S Central Valley Cleaning","website":"rscentralvalleycleaning.com","tagline":"Cleaning Beyond Expectations","service_area":"Bakersfield, Kern County and select Central Valley locations"}'),
  ('territory', '{"state":"California","cities":["Bakersfield","Fresno","Visalia","Delano","Shafter","Wasco","Tulare","Hanford"],"counties":["Kern","Fresno","Tulare","Kings"]}'),
  ('decision_maker_priority', '["Facilities Manager","Director of Facilities","Property Manager","Building Manager","Operations Manager","Director of Operations","Office Manager","General Manager","Asset Manager","Owner"]'),
  ('thresholds', '{"qualify":65,"research":65,"queue":65}'),
  ('limits', '{"daily_lead_target":100,"max_run_size":500,"daily_research_limit":100}'),
  ('schedule', '{"daily_lead_engine":"06:00 America/Los_Angeles","enabled":false}')
on conflict (key) do nothing;

-- Protect the main business domain from cold outreach, always.
insert into suppression_list (domain, suppression_type, reason, source)
select 'rscentralvalleycleaning.com', 'primary_domain', 'Main R&S business domain — never cold-email from or to it', 'system'
where not exists (select 1 from suppression_list where suppression_type = 'primary_domain' and domain = 'rscentralvalleycleaning.com');
