-- RS Lead Generation OS: Supabase (Postgres) schema
-- Run once against the Supabase project (SQL editor or `psql "$DATABASE_URL" -f db/migrations/001_init.sql`).

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Companies and leads (from pipeline/score_leads.py output)
-- ---------------------------------------------------------------------------
create table if not exists companies (
  id             uuid primary key default gen_random_uuid(),
  domain         text unique,               -- null when unknown; name_key used instead
  name_key       text unique,               -- normalized name, fallback identity
  name           text not null,
  business_type  text,
  address        text,
  city           text,
  county         text,
  state          text,
  website        text,
  phone          text,
  size_band      text,
  source         text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create table if not exists leads (
  id             uuid primary key default gen_random_uuid(),
  company_id     uuid references companies(id) on delete cascade,
  email          text unique,               -- primary join key for email events
  full_name      text,
  title          text,
  title_tier     smallint,                  -- 1 facilities .. 6 non-buyer
  email_status   text,                      -- VALID / NONE
  direct_phone   text,
  linkedin_url   text,
  contact_city   text,
  location_match text,
  lead_score     smallint,
  fit_score      smallint,
  contact_score  smallint,
  score_reason   text,
  list_name      text,                      -- e.g. pilot_bakersfield_healthcare
  source         text,
  date_found     date,
  status         text not null default 'new',  -- new|contacted|replied|booked|not_interested (CLAUDE.md)
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists leads_company_idx on leads(company_id);
create index if not exists leads_status_idx on leads(status);

-- ---------------------------------------------------------------------------
-- Campaigns and raw email events (Instantly webhooks)
-- ---------------------------------------------------------------------------
create table if not exists campaigns (
  id             text primary key,          -- Instantly campaign id
  name           text,
  status         text,
  created_at     timestamptz not null default now()
);

create table if not exists email_events (
  id             bigserial primary key,
  received_at    timestamptz not null default now(),
  event_type     text not null,             -- email_sent, reply_received, email_bounced, lead_interested, ...
  event_ts       timestamptz,               -- timestamp from the payload when present
  campaign_id    text references campaigns(id),
  lead_email     text,
  lead_id        uuid references leads(id),
  step           smallint,                  -- sequence step, when present
  variant        text,
  from_account   text,
  subject        text,
  body_text      text,                      -- reply text, when present
  payload        jsonb not null,            -- full raw webhook body
  dedupe_key     text unique                -- hash of (event_type, lead_email, campaign, event_ts)
);
create index if not exists email_events_type_idx on email_events(event_type);
create index if not exists email_events_lead_idx on email_events(lead_email);
create index if not exists email_events_campaign_idx on email_events(campaign_id);

-- Reply classification (filled by the analyzer)
create table if not exists replies (
  id             bigserial primary key,
  event_id       bigint unique references email_events(id) on delete cascade,
  lead_id        uuid references leads(id),
  classification text,                      -- interested|not_interested|out_of_office|wrong_person|auto_reply|unsubscribe|unknown
  sentiment      text,                      -- positive|neutral|negative
  summary        text,
  classified_by  text,                      -- rule|instantly_label|claude
  classified_at  timestamptz not null default now()
);

-- Daily campaign analytics pulled from the Instantly API (backfill / cross-check)
create table if not exists daily_metrics (
  day            date not null,
  campaign_id    text not null references campaigns(id),
  sent           int default 0,
  bounced        int default 0,
  opened         int default 0,
  replied        int default 0,
  interested     int default 0,
  unsubscribed   int default 0,
  fetched_at     timestamptz not null default now(),
  primary key (day, campaign_id)
);

-- ---------------------------------------------------------------------------
-- Analysis views
-- ---------------------------------------------------------------------------
-- One row per lead with its funnel state derived from events
create or replace view lead_funnel as
select
  l.id            as lead_id,
  l.email,
  l.full_name,
  l.title,
  l.title_tier,
  l.lead_score,
  l.list_name,
  c.name          as company,
  c.business_type,
  c.city,
  bool_or(e.event_type = 'email_sent')                         as sent,
  bool_or(e.event_type = 'email_bounced')                      as bounced,
  bool_or(e.event_type = 'email_opened')                       as opened,
  bool_or(e.event_type = 'reply_received')                     as replied,
  bool_or(e.event_type in ('lead_interested','lead_meeting_booked','custom_label_any_positive')) as positive,
  bool_or(e.event_type in ('lead_not_interested','lead_unsubscribed','custom_label_any_negative')) as negative,
  bool_or(e.event_type = 'lead_meeting_booked')                as meeting_booked,
  min(e.event_ts) filter (where e.event_type = 'email_sent')   as first_sent_at,
  min(e.event_ts) filter (where e.event_type = 'reply_received') as first_reply_at
from leads l
left join companies c on c.id = l.company_id
left join email_events e on e.lead_id = l.id
group by l.id, c.id;

-- Performance by the dimensions the scoring model uses
create or replace view performance_by_business_type as
select business_type,
       count(*)                          as leads,
       count(*) filter (where sent)      as sent,
       count(*) filter (where bounced)   as bounced,
       count(*) filter (where replied)   as replied,
       count(*) filter (where positive)  as positive,
       count(*) filter (where meeting_booked) as meetings,
       round(100.0 * count(*) filter (where replied)  / nullif(count(*) filter (where sent), 0), 1) as reply_rate_pct,
       round(100.0 * count(*) filter (where positive) / nullif(count(*) filter (where sent), 0), 1) as positive_rate_pct
from lead_funnel group by business_type order by positive desc, replied desc;

create or replace view performance_by_title_tier as
select title_tier,
       count(*)                          as leads,
       count(*) filter (where sent)      as sent,
       count(*) filter (where replied)   as replied,
       count(*) filter (where positive)  as positive,
       round(100.0 * count(*) filter (where replied)  / nullif(count(*) filter (where sent), 0), 1) as reply_rate_pct,
       round(100.0 * count(*) filter (where positive) / nullif(count(*) filter (where sent), 0), 1) as positive_rate_pct
from lead_funnel group by title_tier order by title_tier;

create or replace view performance_by_score_band as
select case when lead_score >= 80 then '80+' when lead_score >= 65 then '65-79' else '<65' end as score_band,
       count(*)                          as leads,
       count(*) filter (where sent)      as sent,
       count(*) filter (where bounced)   as bounced,
       count(*) filter (where replied)   as replied,
       count(*) filter (where positive)  as positive,
       round(100.0 * count(*) filter (where replied)  / nullif(count(*) filter (where sent), 0), 1) as reply_rate_pct,
       round(100.0 * count(*) filter (where positive) / nullif(count(*) filter (where sent), 0), 1) as positive_rate_pct
from lead_funnel group by 1 order by 1 desc;

create or replace view performance_by_step as
select campaign_id, step,
       count(*) filter (where event_type = 'email_sent')     as sent,
       count(*) filter (where event_type = 'reply_received') as replied,
       count(*) filter (where event_type = 'email_bounced')  as bounced
from email_events group by campaign_id, step order by campaign_id, step;

-- keep updated_at fresh
create or replace function touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;
drop trigger if exists companies_touch on companies;
create trigger companies_touch before update on companies for each row execute function touch_updated_at();
drop trigger if exists leads_touch on leads;
create trigger leads_touch before update on leads for each row execute function touch_updated_at();

-- Lock the tables down: the collector uses the service role / direct DB URL, not the anon key.
alter table companies    enable row level security;
alter table leads        enable row level security;
alter table campaigns    enable row level security;
alter table email_events enable row level security;
alter table replies      enable row level security;
alter table daily_metrics enable row level security;
