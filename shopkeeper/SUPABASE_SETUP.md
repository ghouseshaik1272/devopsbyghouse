# Shopkeeper — Supabase Free setup

This switches the Shopkeeper app to Supabase Free. The existing website/domain and GitHub Pages hosting remain in use; no new domain is needed.

## 1. Create your free project

1. Open https://supabase.com/dashboard and sign in.
2. Create a new organization if prompted, then create a project named **Shopkeeper Production**.
3. Select the **Free** plan. Supabase's published free tier includes a 500 MB database and 50,000 monthly active users, subject to current limits. Free projects may pause after one week of inactivity. See https://supabase.com/pricing.
4. Save the database password in your password manager. Do not paste it into GitHub or this chat.

## 2. Create the database schema

1. Open the project → **SQL Editor** → **New query**.
2. Open `supabase/schema.sql` in this repository and copy its entire contents.
3. Paste into the SQL Editor, review it, and click **Run**.
4. Confirm tables `shopkeeper_products`, `shopkeeper_orders`, and `shopkeeper_admins` exist under Table Editor.

The SQL uses Row Level Security. Public visitors can read active products; customers can read their own orders; only admins can manage products or update order statuses. Checkout calls a database function that checks live prices and stock and updates inventory inside a transaction. Read and review the SQL before running it.

## 3. Configure sign-in and website domain

1. In Supabase, open **Authentication → URL Configuration**.
2. Set Site URL to `https://devopsbyghouse.co.in` (or the exact canonical hostname your website uses).
3. Add redirect URLs including `https://devopsbyghouse.co.in/**` and, if used, `https://www.devopsbyghouse.co.in/**`.
4. For a first test, consider disabling email confirmation under Authentication settings if available for your project; for public launch, configure proper email delivery and keep confirmation enabled.

## 4. Add the public browser configuration

Open **Project Settings → API Keys** (or the project's Connect dialog). Copy:
- Project URL, like `https://your-project-ref.supabase.co`
- The **publishable** key (or legacy anon key)

Update `shopkeeper/supabase-config.js` with these two values. The publishable/anon key is intended for browser use when Row Level Security is enabled. **Never use the secret key or service_role key in browser code.**

## 5. Create your administrator account

1. Open `https://devopsbyghouse.co.in/shopkeeper/app.html` and create an account using your own email.
2. If email confirmation is enabled, confirm the email and sign in.
3. In Supabase → Authentication → Users, copy that user's UUID.
4. In SQL Editor, run this statement with the actual UUID from the dashboard:

```sql
insert into public.shopkeeper_admins (user_id)
values ('PASTE-YOUR-AUTH-USER-UUID-HERE')
on conflict (user_id) do nothing;
```

Never let a public page grant admin access. Only a trusted project owner should insert into the admin table.

## 6. Test

- Add a few test products from `https://devopsbyghouse.co.in/shopkeeper/admin.html`.
- Confirm signed-out visitors can see active products but cannot edit products or orders.
- Place a cash-on-delivery test order and confirm stock decreases exactly once.
- Verify one customer cannot read another customer's orders.
- Test invalid product IDs, insufficient stock, inactive products, repeated items, and cancellation flows.
- The current implementation does not automatically restock cancelled orders; handle this manually until a reviewed cancellation workflow is added.

## Links

- Customer app: https://devopsbyghouse.co.in/shopkeeper/app.html
- Admin: https://devopsbyghouse.co.in/shopkeeper/admin.html
- Storefront: https://devopsbyghouse.co.in/shopkeeper/
- Supabase dashboard: https://supabase.com/dashboard

## Cost and launch notes

The Supabase Free plan has no monthly subscription fee within its limits, but free projects can pause after inactivity and do not include every production feature. The domain is already owned by you, so this plan does not require a new domain purchase. No online payments are configured; checkout is cash on delivery only.

Do not advertise this as fully production-ready until the project is connected and the auth, RLS policies, stock concurrency, order access, admin permissions, backups/recovery needs, privacy notice, terms, delivery area, customer support, and cancellation process have been tested.
