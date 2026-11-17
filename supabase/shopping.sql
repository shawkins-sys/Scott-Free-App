-- Shopping list (17/11/2026). Run once in the Supabase SQL editor.
-- Safe to re-run. Also included in schema.sql for fresh setups.
--
-- Items and staples belong to a list, so the lists can be shared with
-- family members later by adding a members table and changing these
-- policies only. IDs are created on the device so items can be added offline.

create table if not exists public.shopping_lists (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  name text not null,
  sort int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.shopping_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  list_id uuid not null references public.shopping_lists on delete cascade,
  name text not null,
  qty text,
  notes text,
  done boolean not null default false,
  done_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists shopping_items_list_idx on public.shopping_items (list_id);

create table if not exists public.shopping_staples (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  list_id uuid not null references public.shopping_lists on delete cascade,
  name text not null,
  qty text,
  created_at timestamptz not null default now()
);
create index if not exists shopping_staples_list_idx on public.shopping_staples (list_id);

do $$
declare t text;
begin
  foreach t in array array['shopping_lists','shopping_items','shopping_staples'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists owner_mfa on public.%I', t);
    execute format(
      'create policy owner_mfa on public.%I for all to authenticated
         using (user_id = auth.uid() and public.is_mfa())
         with check (user_id = auth.uid() and public.is_mfa())', t);
  end loop;
end $$;
