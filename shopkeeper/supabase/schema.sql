-- Shopkeeper Supabase schema. Run only in the dedicated Shopkeeper project.
create extension if not exists pgcrypto;

create table if not exists public.shopkeeper_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.shopkeeper_admins enable row level security;
revoke all on public.shopkeeper_admins from anon, authenticated;

create table if not exists public.shopkeeper_superadmins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.shopkeeper_superadmins enable row level security;
revoke all on public.shopkeeper_superadmins from anon, authenticated;

create or replace function public.is_shopkeeper_superadmin()
returns boolean language sql stable security definer set search_path = ''
as $$ select exists(select 1 from public.shopkeeper_superadmins s where s.user_id = (select auth.uid())); $$;
revoke all on function public.is_shopkeeper_superadmin() from public;
grant execute on function public.is_shopkeeper_superadmin() to authenticated;

create or replace function public.is_shopkeeper_admin()
returns boolean language sql stable security definer set search_path = ''
as $$ select exists(select 1 from public.shopkeeper_admins a where a.user_id = (select auth.uid())) or public.is_shopkeeper_superadmin(); $$;
revoke all on function public.is_shopkeeper_admin() from public;
grant execute on function public.is_shopkeeper_admin() to authenticated;

create table if not exists public.shopkeeper_customer_access (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null default '',
  display_name text not null default '',
  status text not null default 'pending' check (status in ('pending','approved','rejected','suspended')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.shopkeeper_customer_access enable row level security;
revoke all on public.shopkeeper_customer_access from anon, authenticated;
grant select, insert, update, delete on public.shopkeeper_customer_access to authenticated;
drop policy if exists "Customers see own access status" on public.shopkeeper_customer_access;
create policy "Customers see own access status" on public.shopkeeper_customer_access for select to authenticated using (user_id = (select auth.uid()) or public.is_shopkeeper_superadmin());
drop policy if exists "Superadmins manage customer access" on public.shopkeeper_customer_access;
create policy "Superadmins manage customer access" on public.shopkeeper_customer_access for all to authenticated using (public.is_shopkeeper_superadmin()) with check (public.is_shopkeeper_superadmin());

-- Admins can view/update ordinary customer access records, never superadmin records.
drop policy if exists "Admins view normal customer access" on public.shopkeeper_customer_access;
create policy "Admins view normal customer access"
  on public.shopkeeper_customer_access for select to authenticated
  using (
    public.is_shopkeeper_admin()
    and not exists (
      select 1 from public.shopkeeper_superadmins s
      where s.user_id = shopkeeper_customer_access.user_id
    )
  );

drop policy if exists "Admins update normal customer access" on public.shopkeeper_customer_access;
create policy "Admins update normal customer access"
  on public.shopkeeper_customer_access for update to authenticated
  using (
    public.is_shopkeeper_admin()
    and not exists (
      select 1 from public.shopkeeper_superadmins s
      where s.user_id = shopkeeper_customer_access.user_id
    )
  )
  with check (
    public.is_shopkeeper_admin()
    and not exists (
      select 1 from public.shopkeeper_superadmins s
      where s.user_id = shopkeeper_customer_access.user_id
    )
  );

create or replace function public.is_shopkeeper_customer_approved()
returns boolean language sql stable security definer set search_path = ''
as $$ select exists(select 1 from public.shopkeeper_customer_access a where a.user_id = (select auth.uid()) and a.status = 'approved'); $$;
revoke all on function public.is_shopkeeper_customer_approved() from public;
grant execute on function public.is_shopkeeper_customer_approved() to authenticated;

create or replace function public.shopkeeper_register_customer()
returns void language plpgsql security definer set search_path = ''
as $$
declare v_uid uuid := auth.uid();
begin
 if v_uid is null then raise exception 'Sign in to register your customer profile.'; end if;
 insert into public.shopkeeper_customer_access(user_id,email,display_name,status)
 select u.id, coalesce(u.email,''), coalesce(u.raw_user_meta_data->>'display_name',''), 'pending'
 from auth.users u where u.id = v_uid
 on conflict(user_id) do nothing;
end; $$;
revoke all on function public.shopkeeper_register_customer() from public, anon;
grant execute on function public.shopkeeper_register_customer() to authenticated;

-- New auth accounts are queued for approval. A trigger works even when email confirmation is enabled.
create or replace function public.shopkeeper_on_auth_user_created()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
 insert into public.shopkeeper_customer_access(user_id,email,display_name,status)
 values(new.id, coalesce(new.email,''), coalesce(new.raw_user_meta_data->>'display_name',''), 'pending')
 on conflict(user_id) do nothing;
 return new;
end; $$;
drop trigger if exists shopkeeper_auth_user_created on auth.users;
create trigger shopkeeper_auth_user_created after insert on auth.users
for each row execute function public.shopkeeper_on_auth_user_created();

create table if not exists public.shopkeeper_products (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(name) between 1 and 120),
  category text not null default 'Food & Groceries',
  price numeric(12,2) not null check (price >= 0),
  stock integer not null default 0 check (stock >= 0),
  unit text not null default 'item',
  emoji text not null default '🛍️',
  tag text not null default '',
  description text not null default '',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.shopkeeper_products enable row level security;
revoke all on public.shopkeeper_products from anon, authenticated;
grant select on public.shopkeeper_products to anon, authenticated;
grant insert, update, delete on public.shopkeeper_products to authenticated;
drop policy if exists "Public can view active products" on public.shopkeeper_products;
create policy "Public can view active products" on public.shopkeeper_products for select to anon, authenticated using (active = true or public.is_shopkeeper_admin());
drop policy if exists "Admins manage products" on public.shopkeeper_products;
create policy "Admins manage products" on public.shopkeeper_products for all to authenticated using (public.is_shopkeeper_admin()) with check (public.is_shopkeeper_admin());

create table if not exists public.shopkeeper_orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete restrict,
  customer_name text not null, phone text not null, address text not null, area text not null,
  items jsonb not null, subtotal numeric(12,2) not null check (subtotal >= 0),
  delivery_fee numeric(12,2) not null default 0 check (delivery_fee >= 0),
  total numeric(12,2) not null check (total >= 0),
  status text not null default 'pending' check (status in ('pending','confirmed','packed','out_for_delivery','delivered','cancelled')),
  payment_status text not null default 'unpaid' check (payment_status in ('unpaid','paid','refunded')),
  payment_method text not null default 'cod' check (payment_method = 'cod'),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
alter table public.shopkeeper_orders enable row level security;
revoke all on public.shopkeeper_orders from anon, authenticated;
grant select, update on public.shopkeeper_orders to authenticated;
drop policy if exists "Customers view own orders or admins view all" on public.shopkeeper_orders;
create policy "Customers view own orders or admins view all" on public.shopkeeper_orders for select to authenticated using (user_id = (select auth.uid()) or public.is_shopkeeper_admin());
drop policy if exists "Admins update orders" on public.shopkeeper_orders;
create policy "Admins update orders" on public.shopkeeper_orders for update to authenticated using (public.is_shopkeeper_admin()) with check (public.is_shopkeeper_admin());

create or replace function public.create_shopkeeper_order(
  p_customer_name text, p_phone text, p_address text, p_area text, p_items jsonb
) returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := auth.uid(); v_item jsonb; v_product public.shopkeeper_products%rowtype;
  v_qty integer; v_subtotal numeric(12,2) := 0; v_items jsonb := '[]'::jsonb;
  v_order_id uuid; v_delivery_fee numeric(12,2) := 0;
begin
  if v_uid is null then raise exception 'Please sign in before placing an order.'; end if;
  if not public.is_shopkeeper_customer_approved() and not public.is_shopkeeper_admin() then raise exception 'Your registration is pending approval.'; end if;
  if length(trim(coalesce(p_customer_name,''))) not between 1 and 100
     or length(trim(coalesce(p_phone,''))) not between 5 and 30
     or length(trim(coalesce(p_address,''))) not between 3 and 500
     or length(trim(coalesce(p_area,''))) not between 1 and 120 then raise exception 'Complete all delivery details.'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) not between 1 and 50 then raise exception 'Cart is empty or too large.'; end if;
  for v_item in select value from jsonb_array_elements(p_items) loop
    if coalesce(v_item->>'product_id','') !~ '^[0-9a-fA-F-]{36}$' or coalesce(v_item->>'quantity','') !~ '^[0-9]{1,2}$' then raise exception 'Invalid cart item.'; end if;
    v_qty := (v_item->>'quantity')::integer;
    if v_qty < 1 or v_qty > 99 then raise exception 'Invalid quantity.'; end if;
    select * into v_product from public.shopkeeper_products where id = (v_item->>'product_id')::uuid and active = true for update;
    if not found then raise exception 'A product is unavailable.'; end if;
    if v_product.stock < v_qty then raise exception 'Insufficient stock for %.', v_product.name; end if;
    update public.shopkeeper_products set stock = stock - v_qty, updated_at = now() where id = v_product.id;
    v_subtotal := v_subtotal + v_product.price * v_qty;
    v_items := v_items || jsonb_build_array(jsonb_build_object('productId',v_product.id,'name',v_product.name,'quantity',v_qty,'unitPrice',v_product.price,'unit',v_product.unit,'emoji',v_product.emoji));
  end loop;
  insert into public.shopkeeper_orders(user_id,customer_name,phone,address,area,items,subtotal,delivery_fee,total,status,payment_status,payment_method)
  values(v_uid,trim(p_customer_name),trim(p_phone),trim(p_address),trim(p_area),v_items,v_subtotal,v_delivery_fee,v_subtotal+v_delivery_fee,'pending','unpaid','cod')
  returning id into v_order_id;
  return jsonb_build_object('id',v_order_id,'total',v_subtotal+v_delivery_fee);
end; $$;
revoke all on function public.create_shopkeeper_order(text,text,text,text,jsonb) from public, anon;
grant execute on function public.create_shopkeeper_order(text,text,text,text,jsonb) to authenticated;

-- Public account requests: visitors may submit requests, but only superadmins can review them.
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
