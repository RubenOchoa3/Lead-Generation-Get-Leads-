-- Instant answers to cold-email replies: one auto-reply per lead per campaign, with its outcome.
create table if not exists auto_replies (
  id uuid primary key default gen_random_uuid(),
  lead_email text not null,
  campaign_external_id text not null default '',
  reply_email_id text,
  template text not null,
  status text not null default 'pending' check (status in ('pending','sent','failed')),
  error text,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  unique (lead_email, campaign_external_id)
);
