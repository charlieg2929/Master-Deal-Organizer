-- Run this once in Supabase: Dashboard > SQL Editor > New query > paste all > Run

create extension if not exists "pgcrypto";

create table if not exists properties (
  id uuid primary key default gen_random_uuid(),
  address text not null,
  category text not null default 'Multifamily',
  status text not null default 'New',
  owner_name text,
  phone text,
  email text,
  unit_count text,
  lot_size text,
  opportunity_score text,
  initial_thoughts text,
  touchpoints jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists contacts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  role text not null default 'Broker',
  company text,
  phone text,
  email text,
  notes text,
  touchpoints jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

alter table properties enable row level security;
alter table contacts enable row level security;

-- Any logged-in user (only you and Ryne, since signup is disabled) can read/write everything.
-- There's no public signup form in the app, so "authenticated" effectively means "you or Ryne".

create policy "Authenticated users can manage properties"
  on properties for all
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

create policy "Authenticated users can manage contacts"
  on contacts for all
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');
