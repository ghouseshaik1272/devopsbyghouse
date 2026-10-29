-- Shopkeeper page-level authorization, persistent notifications and cart activity
-- Apply after SETUP_ALL.sql in the dedicated Supabase project.
create table if not exists public.shopkeeper_user_page_access (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('store_admin','inventory_manager','order_manager','customer','restricted_user')),
  allowed_pages text[] not null default '{}',
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  constraint shopkeeper_page_access_valid_pages check (allowed_pages <@ array[
    'storefront','customer_app','own_orders','admin_dashboard','products','inventory','orders',
    'customer_details','user_management','coupons','platform_controls','audit_logs'
  ]::text[])
);
alter table public.shopkeeper_user_page_access enable row level security;
revoke all on public.shopkeeper_user_page_access from public, anon, authenticated;
grant select, insert, update, delete on public.shopkeeper_user_page_access to authenticated;
drop policy if exists "Superadmins manage page access" on public.shopkeeper_user_page_access;
create policy "Superadmins manage page access" on public.shopkeeper_user_page_access
 for all to authenticated using (public.is_shopkeeper_superadmin()) with check (public.is_shopkeeper_superadmin());

create or replace function public.shopkeeper_has_page_access(p_page text)
returns boolean language plpgsql stable security definer set search_path = ''
as $$
declare v_uid uuid := auth.uid(); v_role text; v_pages text[];
begin
 if v_uid is null then return false; end if;
 if public.is_shopkeeper_superadmin() then return true; end if;
 if p_page not in ('storefront','customer_app','own_orders','admin_dashboard','products','inventory','orders','customer_details','user_management','coupons','platform_controls','audit_logs') then return false; end if;
 select role, allowed_pages into v_role, v_pages
 from public.shopkeeper_user_page_access where user_id = v_uid;
 if found then return p_page = any(coalesce(v_pages, array[]::text[])); end if;
 if exists(select 1 from public.shopkeeper_admins a where a.user_id = v_uid) then
   return p_page = any(array['admin_dashboard','products','inventory','orders','customer_details','user_management']::text[]);
 end if;
 if p_page = 'own_orders' then
   return exists(select 1 from public.shopkeeper_customer_access c where c.user_id = v_uid and c.status = 'approved');
 end if;
 return p_page = any(array['storefront','customer_app']::text[]);
end $$;
revoke all on function public.shopkeeper_has_page_access(text) from public, anon;
grant execute on function public.shopkeeper_has_page_access(text) to authenticated;

-- Notifications are durable database records, not just browser pop-ups.
create table if not exists public.shopkeeper_notifications (
 id uuid primary key default gen_random_uuid(),
 recipient_user_id uuid references auth.users(id) on delete cascade,
 recipient_role text not null check (recipient_role in ('superadmin','admin','customer')),
 event_type text not null,
 title text not null,
 body text not null default '',
 details jsonb not null default '{}'::jsonb,
 read_at timestamptz,
 created_at timestamptz not null default now()
);
create index if not exists shopkeeper_notifications_recipient_created_idx
 on public.shopkeeper_notifications(recipient_user_id, created_at desc);
create index if not exists shopkeeper_notifications_role_created_idx
 on public.shopkeeper_notifications(recipient_role, created_at desc);
alter table public.shopkeeper_notifications enable row level security;
revoke all on public.shopkeeper_notifications from public, anon, authenticated;
grant select on public.shopkeeper_notifications to authenticated;
grant update (read_at) on public.shopkeeper_notifications to authenticated;
drop policy if exists "Recipients read Shopkeeper notifications" on public.shopkeeper_notifications;
create policy "Recipients read Shopkeeper notifications" on public.shopkeeper_notifications for select to authenticated
 using (
   (recipient_user_id = auth.uid())
   or (recipient_role = 'superadmin' and public.is_shopkeeper_superadmin())
   or (recipient_role = 'admin' and (public.shopkeeper_has_page_access('orders') or public.shopkeeper_has_page_access('customer_details') or public.shopkeeper_has_page_access('user_management')))
 );
drop policy if exists "Recipients mark own notifications read" on public.shopkeeper_notifications;
create policy "Recipients mark own notifications read" on public.shopkeeper_notifications for update to authenticated
 using (
   recipient_user_id = auth.uid()
   or (recipient_role = 'superadmin' and public.is_shopkeeper_superadmin())
   or (recipient_role = 'admin' and public.is_shopkeeper_admin())
 )
 with check (
   recipient_user_id = auth.uid()
   or (recipient_role = 'superadmin' and public.is_shopkeeper_superadmin())
   or (recipient_role = 'admin' and public.is_shopkeeper_admin())
 );

create or replace function public.shopkeeper_notify_privileged(
 p_event_type text, p_title text, p_body text, p_details jsonb default '{}'::jsonb
) returns void language plpgsql security definer set search_path = ''
as $$
begin
 insert into public.shopkeeper_notifications(recipient_user_id,recipient_role,event_type,title,body,details)
 select s.user_id,'superadmin',p_event_type,p_title,p_body,coalesce(p_details,'{}'::jsonb)
 from public.shopkeeper_superadmins s;
 insert into public.shopkeeper_notifications(recipient_user_id,recipient_role,event_type,title,body,details)
 select a.user_id,'admin',p_event_type,p_title,p_body,coalesce(p_details,'{}'::jsonb)
 from public.shopkeeper_admins a
 where not exists(select 1 from public.shopkeeper_superadmins s where s.user_id=a.user_id);
end $$;
revoke all on function public.shopkeeper_notify_privileged(text,text,text,jsonb) from public, anon, authenticated;

create or replace function public.shopkeeper_notify_new_account_request()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
 perform public.shopkeeper_notify_privileged(
  'account_request','New account request','A new Shopkeeper account request was submitted.',
  jsonb_build_object('request_id',new.id,'full_name',new.full_name,'email',new.email)
 );
 return new;
end $$;
drop trigger if exists shopkeeper_account_request_notification on public.shopkeeper_account_requests;
create trigger shopkeeper_account_request_notification after insert on public.shopkeeper_account_requests
for each row execute function public.shopkeeper_notify_new_account_request();

create or replace function public.shopkeeper_notify_new_order()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
 perform public.shopkeeper_notify_privileged(
  'new_order','New Shopkeeper order','A new order has been placed.',
  jsonb_build_object('order_id',new.id,'user_id',new.user_id,'total',new.total,'area',new.area)
 );
 return new;
end $$;
drop trigger if exists shopkeeper_order_notification on public.shopkeeper_orders;
create trigger shopkeeper_order_notification after insert on public.shopkeeper_orders
for each row execute function public.shopkeeper_notify_new_order();

create table if not exists public.shopkeeper_cart_events (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 event_type text not null check (event_type in ('cart_updated','item_added','item_removed','checkout_started')),
 items_count integer not null default 0 check (items_count between 0 and 500),
 cart_value numeric(12,2) not null default 0 check (cart_value between 0 and 100000000),
 created_at timestamptz not null default now()
);
create index if not exists shopkeeper_cart_events_created_idx on public.shopkeeper_cart_events(created_at desc);
alter table public.shopkeeper_cart_events enable row level security;
revoke all on public.shopkeeper_cart_events from public, anon, authenticated;
grant select on public.shopkeeper_cart_events to authenticated;
drop policy if exists "Admins view cart events" on public.shopkeeper_cart_events;
create policy "Admins view cart events" on public.shopkeeper_cart_events for select to authenticated
 using (public.is_shopkeeper_superadmin() or public.shopkeeper_has_page_access('orders') or public.shopkeeper_has_page_access('customer_details'));

create or replace function public.shopkeeper_track_cart_event(
 p_event_type text, p_items_count integer default 0, p_cart_value numeric default 0
) returns uuid language plpgsql security definer set search_path = ''
as $$
declare v_id uuid;
begin
 if auth.uid() is null then raise exception 'Sign in to track cart activity.'; end if;
 if p_event_type not in ('cart_updated','item_added','item_removed','checkout_started') then raise exception 'Invalid cart event.'; end if;
 if coalesce(p_items_count,0) not between 0 and 500 or coalesce(p_cart_value,0) not between 0 and 100000000 then raise exception 'Invalid cart totals.'; end if;
 insert into public.shopkeeper_cart_events(user_id,event_type,items_count,cart_value)
 values(auth.uid(),p_event_type,coalesce(p_items_count,0),coalesce(p_cart_value,0)) returning id into v_id;
 if p_event_type in ('checkout_started','item_added','item_removed') then
  perform public.shopkeeper_notify_privileged(
   'cart_activity','Shopkeeper cart activity',
   case p_event_type when 'checkout_started' then 'A customer started checkout.' when 'item_added' then 'A customer added an item to a cart.' else 'A customer removed an item from a cart.' end,
   jsonb_build_object('event_id',v_id,'user_id',auth.uid(),'event_type',p_event_type,'items_count',p_items_count,'cart_value',p_cart_value)
  );
 end if;
 return v_id;
end $$;
revoke all on function public.shopkeeper_track_cart_event(text,integer,numeric) from public, anon;
grant execute on function public.shopkeeper_track_cart_event(text,integer,numeric) to authenticated;

create or replace function public.shopkeeper_mark_notifications_read()
returns void language plpgsql security invoker set search_path = ''
as $$
begin
 update public.shopkeeper_notifications set read_at=now()
 where read_at is null and (
   recipient_user_id=auth.uid()
   or (recipient_role='superadmin' and public.is_shopkeeper_superadmin())
   or (recipient_role='admin' and (public.shopkeeper_has_page_access('orders') or public.shopkeeper_has_page_access('customer_details') or public.shopkeeper_has_page_access('user_management')))
 );
end $$;
revoke all on function public.shopkeeper_mark_notifications_read() from public, anon;
grant execute on function public.shopkeeper_mark_notifications_read() to authenticated;

-- Replace broad admin data policies with page-grant-aware policies.
drop policy if exists "Admins manage products" on public.shopkeeper_products;
drop policy if exists "Authenticated users view permitted products" on public.shopkeeper_products;
drop policy if exists "Authorized page users manage products" on public.shopkeeper_products;
drop policy if exists "Public can view active products" on public.shopkeeper_products;
create policy "Public can view active products" on public.shopkeeper_products for select to anon using (active = true);
create policy "Authenticated users view permitted products" on public.shopkeeper_products for select to authenticated
 using (active = true or public.shopkeeper_has_page_access('products'));
create policy "Authorized page users manage products" on public.shopkeeper_products for all to authenticated
 using (public.shopkeeper_has_page_access('products'))
 with check (public.shopkeeper_has_page_access('products'));

drop policy if exists "Customers view own orders or admins view all" on public.shopkeeper_orders;
drop policy if exists "Authorized users view permitted orders" on public.shopkeeper_orders;
create policy "Authorized users view permitted orders" on public.shopkeeper_orders for select to authenticated
 using (user_id = auth.uid() or public.shopkeeper_has_page_access('orders') or public.shopkeeper_has_page_access('customer_details'));
drop policy if exists "Admins update orders" on public.shopkeeper_orders;
drop policy if exists "Authorized order managers update orders" on public.shopkeeper_orders;
create policy "Authorized order managers update orders" on public.shopkeeper_orders for update to authenticated
 using (public.shopkeeper_has_page_access('orders')) with check (public.shopkeeper_has_page_access('orders'));

drop policy if exists "Superadmins manage coupons" on public.shopkeeper_coupons;
create policy "Superadmins manage coupons" on public.shopkeeper_coupons for all to authenticated
 using (public.is_shopkeeper_superadmin()) with check (public.is_shopkeeper_superadmin());

-- Customer records: only users with the relevant granted pages or superadmins.
drop policy if exists "Admins view normal customer access" on public.shopkeeper_customer_access;
drop policy if exists "Authorized users view customer access" on public.shopkeeper_customer_access;
create policy "Authorized users view customer access" on public.shopkeeper_customer_access for select to authenticated
 using (
   user_id = auth.uid()
   or public.shopkeeper_has_page_access('customer_details')
   or public.shopkeeper_has_page_access('user_management')
 );
drop policy if exists "Admins update normal customer access" on public.shopkeeper_customer_access;
drop policy if exists "Authorized users update customer access" on public.shopkeeper_customer_access;
create policy "Authorized users update customer access" on public.shopkeeper_customer_access for update to authenticated
 using (public.shopkeeper_has_page_access('user_management'))
 with check (public.shopkeeper_has_page_access('user_management'));

-- Write an audit entry whenever an access profile is changed.
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
grant select on public.shopkeeper_superadmin_audit to authenticated;
drop policy if exists "Superadmins view audit" on public.shopkeeper_superadmin_audit;
create policy "Superadmins view audit" on public.shopkeeper_superadmin_audit for select to authenticated
 using (public.is_shopkeeper_superadmin());

create or replace function public.shopkeeper_audit_page_access_change()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
 insert into public.shopkeeper_superadmin_audit(actor_user_id,action,target_user_id,details)
 values(auth.uid(),
   case when tg_op='DELETE' then 'page_access_deleted' else 'page_access_saved' end,
   coalesce(new.user_id,old.user_id),
   jsonb_build_object('role',case when tg_op='DELETE' then old.role else new.role end,
                      'allowed_pages',case when tg_op='DELETE' then old.allowed_pages else new.allowed_pages end));
 if tg_op='DELETE' then return old; else return new; end if;
end $$;
drop trigger if exists shopkeeper_page_access_audit on public.shopkeeper_user_page_access;
create trigger shopkeeper_page_access_audit after insert or update or delete on public.shopkeeper_user_page_access
for each row execute function public.shopkeeper_audit_page_access_change();


-- Reinstall order RPC with a database-enforced customer-app permission check.
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
  if not public.shopkeeper_has_page_access('customer_app') then raise exception 'Your account does not have access to the customer app.'; end if;
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
