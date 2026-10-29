-- Run this migration once in the dedicated Shopkeeper Supabase project.
-- Creates the public request form table; only superadmins can read/review requests.
create table if not exists public.shopkeeper_account_requests (
  id uuid primary key default gen_random_uuid(),
  full_name text not null check (length(trim(full_name)) between 2 and 100),
  email text not null,
  phone text not null default '',
  message text not null default '',
  status text not null default 'pending' check (status in ('pending','invited','rejected')),
  created_at timestamptz not null default now(),
  handled_at timestamptz,
  handled_by uuid references auth.users(id) on delete set null,
  invited_user_id uuid references auth.users(id) on delete set null
);
alter table public.shopkeeper_account_requests enable row level security;
revoke all on public.shopkeeper_account_requests from public, anon, authenticated;
grant insert on public.shopkeeper_account_requests to anon, authenticated;
grant select, update on public.shopkeeper_account_requests to authenticated;

drop policy if exists "Visitors submit account requests" on public.shopkeeper_account_requests;
create policy "Visitors submit account requests"
  on public.shopkeeper_account_requests for insert to anon, authenticated
  with check (
    status = 'pending' and handled_at is null and handled_by is null and invited_user_id is null
    and length(trim(full_name)) between 2 and 100
    and length(trim(email)) between 5 and 254
    and position('@' in email) > 1
    and length(trim(phone)) <= 30
    and length(trim(message)) <= 1000
  );
drop policy if exists "Superadmins view account requests" on public.shopkeeper_account_requests;
create policy "Superadmins view account requests"
  on public.shopkeeper_account_requests for select to authenticated
  using (public.is_shopkeeper_superadmin());
drop policy if exists "Superadmins update account requests" on public.shopkeeper_account_requests;
create policy "Superadmins update account requests"
  on public.shopkeeper_account_requests for update to authenticated
  using (public.is_shopkeeper_superadmin())
  with check (public.is_shopkeeper_superadmin());
