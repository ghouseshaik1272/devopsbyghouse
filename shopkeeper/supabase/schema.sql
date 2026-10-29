-- Shopkeeper Supabase schema. Run only in the dedicated Shopkeeper project.
create extension if not exists pgcrypto;

create table if not exists public.shopkeeper_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.shopkeeper_admins enable row level security;
revoke all on public.shopkeeper_admins from anon, authenticated;

create or replace function public.is_shopkeeper_admin()
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists(select 1 from public.shopkeeper_admins a where a.user_id = (select auth.uid()));
$$;
revoke all on function public.is_shopkeeper_admin() from public;
grant execute on function public.is_shopkeeper_admin() to authenticated;

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
  customer_name text not null,
  phone text not null,
  address text not null,
  area text not null,
  items jsonb not null,
  subtotal numeric(12,2) not null check (subtotal >= 0),
  delivery_fee numeric(12,2) not null default 0 check (delivery_fee >= 0),
  total numeric(12,2) not null check (total >= 0),
  status text not null default 'pending' check (status in ('pending','confirmed','packed','out_for_delivery','delivered','cancelled')),
  payment_status text not null default 'unpaid' check (payment_status in ('unpaid','paid','refunded')),
  payment_method text not null default 'cod' check (payment_method = 'cod'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
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
  v_uid uuid := auth.uid();
  v_item jsonb;
  v_product public.shopkeeper_products%rowtype;
  v_qty integer;
  v_subtotal numeric(12,2) := 0;
  v_items jsonb := '[]'::jsonb;
  v_order_id uuid;
  v_delivery_fee numeric(12,2) := 0;
begin
  if v_uid is null then raise exception 'Please sign in before placing an order.'; end if;
  if length(trim(coalesce(p_customer_name,''))) not between 1 and 100
     or length(trim(coalesce(p_phone,''))) not between 5 and 30
     or length(trim(coalesce(p_address,''))) not between 3 and 500
     or length(trim(coalesce(p_area,''))) not between 1 and 120 then
    raise exception 'Complete all delivery details.';
  end if;
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
end;
$$;
revoke all on function public.create_shopkeeper_order(text,text,text,text,jsonb) from public, anon;
grant execute on function public.create_shopkeeper_order(text,text,text,text,jsonb) to authenticated;
