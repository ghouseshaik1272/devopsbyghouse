-- Superadmin-only coupon management for Shopkeeper.
create table if not exists public.shopkeeper_coupons (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 2 and 100),
  code text not null unique check (code = upper(code) and code ~ '^[A-Z0-9_-]{3,40}$'),
  valid_till date not null,
  excluded_categories text[] not null default '{}',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.shopkeeper_coupons enable row level security;
revoke all on public.shopkeeper_coupons from public, anon, authenticated;
grant select, insert, update, delete on public.shopkeeper_coupons to authenticated;
drop policy if exists "Superadmins manage coupons" on public.shopkeeper_coupons;
create policy "Superadmins manage coupons"
  on public.shopkeeper_coupons for all to authenticated
  using (public.is_shopkeeper_superadmin())
  with check (public.is_shopkeeper_superadmin());
