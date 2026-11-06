-- Scott Free: database schema.
-- Run once in Supabase: SQL Editor > New query > paste all > Run.
-- Safe to re-run: uses IF NOT EXISTS / OR REPLACE where possible.
--
-- Security model:
--   * Every table has user_id and Row Level Security.
--   * Rows are visible only to their owner, and only when signed in with MFA
--     (aal2). A password alone is not enough to read or write anything.
--   * spotify_auth has RLS on and no policies: only Edge Functions (service role)
--     can touch it.

-- Helper: true when the caller is signed in with MFA completed.
create or replace function public.is_mfa()
returns boolean language sql stable as $$
  select coalesce(auth.jwt() ->> 'aal', '') = 'aal2'
$$;

-- Keep-alive ping used by the GitHub Action. Returns no data.
create or replace function public.ping()
returns text language sql stable as $$ select 'ok' $$;
grant execute on function public.ping() to anon;

-- ---------- Tables ----------

create table if not exists public.settings (
  user_id uuid primary key default auth.uid() references auth.users on delete cascade,
  data jsonb not null default '{}'::jsonb,       -- e.g. home location, pay settings
  updated_at timestamptz not null default now()
);

create table if not exists public.layouts (
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  device text not null check (device in ('phone', 'desktop')),
  items jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (user_id, device)
);

create table if not exists public.checkins (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  day date not null,                              -- Europe/London date
  metrics jsonb not null default '{}'::jsonb,    -- { mood: 1-5, sleep: 1-5, ... } so more can be added
  hours_slept numeric(3,1),
  exercised boolean,
  note text,
  created_at timestamptz not null default now(),
  unique (user_id, day)
);

create table if not exists public.phrases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  text text not null,
  tough_days boolean not null default false,
  pinned boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.weekly_reviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  week_start date not null,                       -- Monday of the week
  snapshot jsonb not null default '{}'::jsonb,   -- figures as they were that week
  reflection text,
  reviewed boolean not null default false,
  created_at timestamptz not null default now(),
  unique (user_id, week_start)
);

create table if not exists public.key_dates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  kind text not null check (kind in ('birthday', 'life_admin')),
  title text not null,
  due_date date not null,
  birth_year int,
  repeat_rule text not null default 'none',       -- none | yearly | every_n_months | every_n_years
  repeat_every int,
  lead_days int[] not null default '{0}',
  gift_ideas text,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.playlists (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  name text not null,
  spotify_url text not null,
  moods int[] not null default '{}',
  created_at timestamptz not null default now()
);

create table if not exists public.spotify_auth (
  user_id uuid primary key references auth.users on delete cascade,
  refresh_token text,
  access_token text,
  access_expires_at timestamptz,
  authorised_at timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  name text not null,
  sort int not null default 0,
  unique (user_id, name)
);

-- No account numbers, sort codes or card numbers are ever stored.
create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  provider text not null,
  plan_name text,
  category_id uuid references public.categories on delete set null,
  amount numeric(10,2) not null,
  frequency text not null check (frequency in ('weekly', 'monthly', 'quarterly', 'annual')),
  payment_day int,
  payment_type text check (payment_type in ('direct_debit', 'standing_order', 'card_subscription')),
  bank_name text,
  start_date date,
  end_date date,
  contract_length text,
  notice_period text,
  customer_ref text,
  contact text,
  plan_details text,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.imports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  file_name text,
  period_start date,
  period_end date,
  row_count int,
  imported_at timestamptz not null default now()
);

create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  import_id uuid references public.imports on delete set null,
  tx_date date not null,
  description text not null,
  amount numeric(10,2) not null,                  -- negative = money out
  balance numeric(12,2),
  dedupe_key text not null,
  category_id uuid references public.categories on delete set null,
  payment_id uuid references public.payments on delete set null,
  kind text,                                      -- salary | expenses_repaid | null
  claimable boolean not null default false,
  claim_ref text,
  needs_review boolean not null default false,
  created_at timestamptz not null default now(),
  unique (user_id, dedupe_key)
);

create table if not exists public.merchant_rules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  pattern text not null,
  category_id uuid references public.categories on delete cascade,
  payment_id uuid references public.payments on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.payday_overrides (
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  scheduled_date date not null,
  actual_date date not null,
  primary key (user_id, scheduled_date)
);

-- ---------- Row Level Security ----------

do $$
declare t text;
begin
  foreach t in array array[
    'settings','layouts','checkins','phrases','weekly_reviews','key_dates',
    'playlists','categories','payments','imports','transactions',
    'merchant_rules','payday_overrides'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists owner_mfa on public.%I', t);
    execute format(
      'create policy owner_mfa on public.%I for all to authenticated
         using (user_id = auth.uid() and public.is_mfa())
         with check (user_id = auth.uid() and public.is_mfa())', t);
  end loop;
end $$;

-- Server-side only: RLS on, no policies.
alter table public.spotify_auth enable row level security;

-- ---------- Storage: private photos bucket ----------

insert into storage.buckets (id, name, public)
values ('photos', 'photos', false)
on conflict (id) do update set public = false;

drop policy if exists photos_read_mfa on storage.objects;
create policy photos_read_mfa on storage.objects for select to authenticated
  using (bucket_id = 'photos' and public.is_mfa());
