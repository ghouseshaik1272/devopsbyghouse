# Shopkeeper backend readiness and deployment

## Database: one-file setup
Use [SETUP_ALL.sql](./SETUP_ALL.sql) in the Supabase SQL Editor for project `koyjdbajetikgzobpcfj`. It creates the public tables, RLS policies, helper functions, order RPC, and 33 starter products. It is designed to be rerun for schema setup and inserts only seed products that do not already exist by case-insensitive name + category.

Tables created:
- `public.shopkeeper_admins`
- `public.shopkeeper_superadmins`
- `public.shopkeeper_customer_access`
- `public.shopkeeper_products`
- `public.shopkeeper_orders`
- `public.shopkeeper_account_requests`

Canonical product categories are `Pulses`, `Vegetables`, `Fruits`, `Clothing`, and `Food & Groceries`, plus the extra categories supported in the admin UI.

Starter product prices and quantities are illustrative examples only. Verify local supplier prices and actual stock before using the catalogue for real sales.

## Create users
Never create Auth users by inserting directly into `auth.users`.
1. Public visitor submits an account request on the storefront.
2. A superadmin reviews it from the superadmin console.
3. The protected `shopkeeper-create-user` Edge Function invites the email, approves the customer access record, and marks the request invited.
4. Invitee uses the email link to set their own password.
5. The frontend's sign-in function rejects customers whose access status is not approved.

## Deploy the invitation Edge Function
The source is at [functions/shopkeeper-create-user/index.ts](./functions/shopkeeper-create-user/index.ts).

In Supabase Dashboard > Edge Functions, create/deploy a function named `shopkeeper-create-user` using that source. Ensure `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` are available as server-side function secrets. Never publish the service-role key in client-side JavaScript or GitHub.

The source currently permits browser CORS from `https://devopsbyghouse.co.in`. Update that origin only if the live site uses a different origin.

## Remaining validation checklist
- [ ] Run `SETUP_ALL.sql` successfully in Supabase SQL Editor.
- [ ] Verify all six tables appear in Table Editor and inspect the category summary at the end of the script.
- [ ] Verify the intended superadmin exists in `shopkeeper_superadmins` and `shopkeeper_customer_access.status = 'approved'`.
- [ ] Deploy `shopkeeper-create-user` and test with an account request using an inbox you control.
- [ ] Verify invitation email arrives and invitee can set a password.
- [ ] Verify an unapproved account cannot sign in or place an order.
- [ ] Verify approved user can add items, place COD order, and stock decreases atomically.
- [ ] Verify admin can add/edit products, change stock/prices, and update order status.
- [ ] Verify public visitors can browse products and submit requests but cannot view requests or manage products.

GitHub Pages deployment publishes the static website only. It does not automatically execute SQL or deploy Supabase Edge Functions. Do not treat the backend as fully live until these external steps and end-to-end tests pass.
