-- Daily send batch: each morning the owner reviews today's leads + the exact emails, then approves
-- and they are added to the active Instantly campaigns (local 90% / big companies 10%).
create table if not exists daily_batches (
  id uuid primary key default gen_random_uuid(),
  batch_date date not null unique,
  status text not null default 'ready' check (status in ('ready','sent','skipped')),
  target integer not null,
  per_mailbox integer not null,
  note text,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  sent_summary jsonb
);
create table if not exists daily_batch_items (
  batch_id uuid not null references daily_batches(id) on delete cascade,
  contact_id uuid not null references contacts(id) on delete cascade,
  organization_id uuid not null references organizations(id) on delete cascade,
  arm text not null check (arm in ('local','big')),
  included boolean not null default true,
  primary key (batch_id, contact_id)
);
