-- Shopkeeper Superadmin access profiles and audit foundation
-- Run in Supabase SQL Editor for project koyjdbajetikgzobpcfj.
create table if not exists public.shopkeeper_user_page_access (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('store_admin','inventory_manager','order_manager','customer','restricted_user')),
  allowed_pages text[] not null default '{}',
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  constraint shopkeeper_page_access_valid_pages check (
    allowed_pages <@ array['storefront','customer_app','own_orders','admin_dashboard','products','inventory','orders','customer_details','user_management','coupons','platform_controls','audit_logs']::text[]
  )
);
alter table public.shopkeeper_user_page_access enable row level security;
revoke all on public.shopkeeper_user_page_access from public, anon, authenticated;
grant select, insert, update, delete on public.shopkeeper_user_page_access to authenticated;
drop policy if exists "Superadmins manage page access" on public.shopkeeper_user_page_access;
create policy "Superadmins manage page access"
  on public.shopkeeper_user_page_access for all to authenticated
  using (public.is_shopkeeper_superadmin())
  with check (public.is_shopkeeper_superadmin());

create table if not exists public.shopkeeper_superadmin_audit (
  id bigint generated always as identity primary key,
  actor_user_id uuid references auth.users(id) on delete set null,
  action text not null,
  target_user_id uuid references auth.users(id) on delete set null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
alter table public.shopkeeper_superadmin_audit enable row level security;
revoke all on public.shopkeeper_superadmin_audit from public, anon, authenticated;
grant select, insert on public.shopkeeper_superadmin_audit to authenticated;
drop policy if exists "Superadmins view audit" on public.shopkeeper_superadmin_audit;
create policy "Superadmins view audit" on public.shopkeeper_superadmin_audit
  for select to authenticated using (public.is_shopkeeper_superadmin());
drop policy if exists "Superadmins write audit" on public.shopkeeper_superadmin_audit;
create policy "Superadmins write audit" on public.shopkeeper_superadmin_audit
  for insert to authenticated
  with check (public.is_shopkeeper_superadmin() and actor_user_id = auth.uid());

comment on table public.shopkeeper_user_page_access is 'Superadmin-managed page access profiles. Each app page and privileged server function must enforce grants before production.';
comment on table public.shopkeeper_superadmin_audit is 'Audit events for privileged Shopkeeper operations.';
