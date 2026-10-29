# Shopkeeper account request workflow

## What this adds
- The public storefront has a **Requests** button and an account request form.
- Visitors can browse products but cannot add items to the public storefront cart.
- Self-service account creation is removed from the customer app. Users must request access.
- The superadmin console lists pending requests after the superadmin signs in.
- **Invite & approve** calls a protected Supabase Edge Function. The function checks the signed-in superadmin role, sends a Supabase Auth invitation email, approves the customer account, and marks the request as invited.
- The invitee sets their own password from the email link. Passwords are never collected by the public request form.

## 1. Apply the request-table migration
Open the Shopkeeper project's SQL Editor and run the complete contents of [account-requests-migration.sql](./account-requests-migration.sql). This is a separate migration; there is no need to rerun the full schema.

## 2. Deploy the Edge Function
Deploy the source file [shopkeeper-create-user/index.ts](./functions/shopkeeper-create-user/index.ts) as a Supabase Edge Function named **shopkeeper-create-user** in project `koyjdbajetikgzobpcfj`.

In the Supabase dashboard:
1. Open **Edge Functions**.
2. Create a function named `shopkeeper-create-user`.
3. Paste the contents of `shopkeeper/supabase/functions/shopkeeper-create-user/index.ts` and deploy.
4. In the function's secrets/settings, confirm `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` are available. Add the service-role key as a server-side secret if the dashboard does not provide it automatically.
5. Never put the service-role key in any website JavaScript, GitHub file, or public setting.

The function allows browser calls only from `https://devopsbyghouse.co.in`. If the storefront uses a different origin, update the CORS allow-origin value in the function source before deploying.

## 3. Test the workflow
1. Visit `https://devopsbyghouse.co.in/shopkeeper/` and click **Requests**.
2. Submit a test request with an email inbox you control.
3. Sign in to `https://devopsbyghouse.co.in/shopkeeper/superadmin.html` using the verified superadmin account.
4. Review the **Account creation requests** table.
5. Click **Invite & approve**. Confirm that the invite email arrives and the request status becomes `invited`.
6. The invited user sets a password using the email link, then signs in at `https://devopsbyghouse.co.in/shopkeeper/app.html`.
7. Verify that unauthenticated or unapproved users cannot add to cart or place orders.

## Notes
- GitHub Pages deploys the static HTML/JavaScript, but it does not deploy Supabase database migrations or Edge Functions automatically.
- Do not mark the workflow production-ready until the migration, Edge Function deployment, invitation email, login, and cart/order permissions are tested end to end.
