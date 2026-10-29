-- SHOPKEEPER SUPABASE SQL CHEATSHEET
-- Run in Supabase Dashboard > SQL Editor for the Shopkeeper project.
-- First run shopkeeper/supabase/schema.sql and account-requests-migration.sql.
-- Never manually INSERT into auth.users. Use Supabase Authentication > Users > Invite user
-- (or the protected Shopkeeper superadmin invitation workflow) to create an Auth account.

-- =========================================================
-- 1) CHECK WHETHER AN AUTH USER EXISTS / CHECK CONFIRMATION
-- =========================================================
select id, email, email_confirmed_at, created_at, last_sign_in_at
from auth.users
where lower(email) = lower('shaikdigitalservicespvtltd@gmail.com');

-- Email confirmation status: a non-NULL email_confirmed_at means confirmed.
-- Do not update auth.users to confirm accounts manually unless you understand the security implications.
-- Use Supabase Auth invite/confirmation links for normal users.

-- =========================================================
-- 2) GRANT SUPERADMIN TO AN EXISTING AUTH USER
-- Run only for a trusted account after checking the email above.
-- =========================================================
insert into public.shopkeeper_superadmins(user_id)
select id from auth.users
where lower(email) = lower('shaikdigitalservicespvtltd@gmail.com')
on conflict (user_id) do nothing;

insert into public.shopkeeper_admins(user_id)
select id from auth.users
where lower(email) = lower('shaikdigitalservicespvtltd@gmail.com')
on conflict (user_id) do nothing;

insert into public.shopkeeper_customer_access(user_id,email,display_name,status,updated_at)
select id, coalesce(email,''), coalesce(raw_user_meta_data->>'display_name',''), 'approved', now()
from auth.users
where lower(email) = lower('shaikdigitalservicespvtltd@gmail.com')
on conflict(user_id) do update set status='approved', updated_at=now();

-- Verify the roles:
select u.email,
       exists(select 1 from public.shopkeeper_superadmins s where s.user_id=u.id) as is_superadmin,
       exists(select 1 from public.shopkeeper_admins a where a.user_id=u.id) as is_admin,
       ca.status as customer_status
from auth.users u
left join public.shopkeeper_customer_access ca on ca.user_id=u.id
where lower(u.email)=lower('shaikdigitalservicespvtltd@gmail.com');

-- =========================================================
-- 3) CREATE A NORMAL USER (SAFE WAY)
-- =========================================================
-- Do NOT run INSERT INTO auth.users.
-- In Supabase Dashboard > Authentication > Users, choose Invite user and enter the email.
-- Or, while signed in as superadmin, use the Shopkeeper Superadmin > Account creation requests
-- > Invite & approve button. The invitee sets their own password from the email link.
-- New signups created through Auth are automatically marked pending by the schema trigger.
-- To approve an existing account after verifying it, replace the email below:
insert into public.shopkeeper_customer_access(user_id,email,display_name,status,updated_at)
select id, coalesce(email,''), coalesce(raw_user_meta_data->>'display_name',''), 'approved', now()
from auth.users
where lower(email)=lower('customer@example.com')
on conflict(user_id) do update set status='approved', updated_at=now();

-- Suspend or reject an existing customer:
update public.shopkeeper_customer_access
set status='suspended', updated_at=now()
where lower(email)=lower('customer@example.com');
-- To reinstate:
-- update public.shopkeeper_customer_access set status='approved', updated_at=now()
-- where lower(email)=lower('customer@example.com');

-- =========================================================
-- 4) PRODUCT SEED DATA: CATEGORY, PRICE, QUANTITY/STOCK
-- Prices are illustrative INR starter values, not live market quotes.
-- Review/update prices and stock before activating these products.
-- Upsert by product name + category (uses the unique index created below).
-- =========================================================
create unique index if not exists shopkeeper_products_name_category_uq
on public.shopkeeper_products (lower(name), lower(category));

insert into public.shopkeeper_products
(name,category,price,stock,unit,emoji,tag,description,active)
values
-- Pulses
('Toor Dal','Pulses',145.00,40,'1 kg','🫘','Pantry staple','Toor dal, 1 kg pack',true),
('Moong Dal','Pulses',125.00,35,'1 kg','🫘','Pantry staple','Moong dal, 1 kg pack',true),
('Chana Dal','Pulses',85.00,35,'1 kg','🫘','','Chana dal, 1 kg pack',true),
('Masoor Dal','Pulses',105.00,30,'1 kg','🫘','','Masoor dal, 1 kg pack',true),
('Urad Dal','Pulses',120.00,25,'1 kg','🫘','','Urad dal, 1 kg pack',true),
('Kabuli Chana','Pulses',115.00,25,'1 kg','🫘','','White chickpeas, 1 kg pack',true),
('Rajma','Pulses',130.00,20,'1 kg','🫘','','Kidney beans, 1 kg pack',true),
-- Vegetables
('Tomatoes','Vegetables',35.00,60,'1 kg','🍅','Fresh pick','Fresh tomatoes, 1 kg',true),
('Potatoes','Vegetables',30.00,70,'1 kg','🥔','','Potatoes, 1 kg',true),
('Onions','Vegetables',40.00,70,'1 kg','🧅','','Onions, 1 kg',true),
('Green Chillies','Vegetables',25.00,25,'250 g','🌶️','','Green chillies, 250 g',true),
('Spinach','Vegetables',25.00,30,'bunch','🥬','Fresh pick','Fresh spinach bunch',true),
('Carrots','Vegetables',45.00,35,'1 kg','🥕','','Carrots, 1 kg',true),
('Cucumbers','Vegetables',35.00,30,'1 kg','🥒','','Cucumbers, 1 kg',true),
('Cauliflower','Vegetables',40.00,20,'piece','🥦','','One cauliflower',true),
-- Fruits
('Bananas','Fruits',60.00,40,'1 dozen','🍌','','Bananas, one dozen',true),
('Apples','Fruits',160.00,30,'1 kg','🍎','Popular','Apples, 1 kg',true),
('Oranges','Fruits',90.00,30,'1 kg','🍊','Seasonal','Oranges, 1 kg',true),
('Mangoes','Fruits',120.00,20,'1 kg','🥭','Seasonal','Mangoes, 1 kg; adjust for season',true),
('Grapes','Fruits',100.00,25,'500 g','🍇','','Grapes, 500 g',true),
('Pomegranates','Fruits',150.00,20,'1 kg','🍎','','Pomegranates, 1 kg',true),
-- Clothing
('Classic Cotton T-Shirt','Clothing',349.00,20,'piece','👕','Everyday','Cotton T-shirt; choose size at fulfilment',true),
('Cotton Socks','Clothing',99.00,40,'pair','🧦','','Cotton socks, one pair',true),
('Cotton Towel','Clothing',199.00,20,'piece','🧺','','Cotton bath towel',true),
('Cotton Scarf','Clothing',149.00,15,'piece','🧣','','Cotton scarf',true),
-- Food & Groceries
('Rice','Food & Groceries',299.00,40,'5 kg','🍚','Value pick','Rice, 5 kg bag',true),
('Whole Wheat Atta','Food & Groceries',215.00,35,'5 kg','🌾','','Whole wheat flour, 5 kg',true),
('Sugar','Food & Groceries',48.00,50,'1 kg','🧂','','Sugar, 1 kg',true),
('Salt','Food & Groceries',25.00,50,'1 kg','🧂','','Iodized salt, 1 kg',true),
('Sunflower Oil','Food & Groceries',145.00,30,'1 L','🫗','','Sunflower oil, 1 litre',true),
('Tea Powder','Food & Groceries',120.00,25,'500 g','🍵','','Tea powder, 500 g',true),
('Milk','Food & Groceries',32.00,40,'500 ml','🥛','','Milk, 500 ml pack',true),
('Biscuits','Food & Groceries',30.00,40,'pack','🍪','','Biscuits, one pack',true)
on conflict (lower(name), lower(category)) do update set
 price=excluded.price,
 stock=excluded.stock,
 unit=excluded.unit,
 emoji=excluded.emoji,
 tag=excluded.tag,
 description=excluded.description,
 active=excluded.active,
 updated_at=now();

-- =========================================================
-- 5) ADD ONE CUSTOM PRODUCT
-- =========================================================
insert into public.shopkeeper_products
(name,category,price,stock,unit,emoji,tag,description,active)
values ('Example Product','Vegetables',50.00,20,'1 kg','🥬','','Replace with real product details',true);

-- =========================================================
-- 6) EDIT PRICE / STOCK / CATEGORY / AVAILABILITY
-- =========================================================
update public.shopkeeper_products
set price=55.00, stock=25, updated_at=now()
where name='Example Product' and category='Vegetables';

-- Hide a product without deleting its history:
update public.shopkeeper_products set active=false, updated_at=now()
where name='Example Product' and category='Vegetables';

-- View all active products:
select name, category, price, stock, unit, active
from public.shopkeeper_products
where active=true
order by category, name;

-- Category inventory summary:
select category, count(*) as product_count, sum(stock) as total_units
from public.shopkeeper_products
group by category
order by category;

-- =========================================================
-- 7) ACCOUNT REQUESTS (after account-requests-migration.sql)
-- =========================================================
-- Only a superadmin should run this query while signed into SQL Editor as project owner.
select id, full_name, email, phone, message, status, created_at
from public.shopkeeper_account_requests
order by created_at desc;

-- Reject one pending request by ID (replace UUID):
-- update public.shopkeeper_account_requests
-- set status='rejected', handled_at=now()
-- where id='00000000-0000-0000-0000-000000000000' and status='pending';

-- =========================================================
-- 8) ORDER MONITORING
-- =========================================================
select id, user_id, customer_name, phone, area, total, status, payment_status, created_at
from public.shopkeeper_orders
order by created_at desc
limit 100;

-- Update one order status:
-- update public.shopkeeper_orders set status='confirmed', updated_at=now()
-- where id='00000000-0000-0000-0000-000000000000';

