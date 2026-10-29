# Shopkeeper backend readiness and role permissions

## Roles
- Superadmin: full control, including granting/removing admin roles and managing account requests.
- Admin: manage products and orders; view ordinary customer access records; approve/reject/suspend/reinstate normal customer access. Database policies exclude superadmin rows from admin customer-access changes.
- Normal user: browse and shop only while approved.

## Database setup
Run [SETUP_ALL.sql](./SETUP_ALL.sql) in the Supabase SQL Editor for the dedicated project. It creates the Shopkeeper tables, RLS policies, order RPC and 33 illustrative starter products. If the project was already initialized with the earlier version, run the latest [schema.sql](./schema.sql) and [account-requests-migration.sql](./account-requests-migration.sql) to apply the policy changes and request table. Do not assume GitHub commits execute SQL automatically.

## Admin console
The admin page includes product and order controls plus invitation, profile edit, approve/reject/suspend/reinstate, and permanent deletion actions for ordinary users. These privileged user operations call the protected `shopkeeper-user-management` Edge Function; deploy it before using those controls. Superadmin targets are explicitly protected.

## Account creation
User identities must be created through Supabase Auth invitations or a protected server-side function, never by inserting directly into `auth.users`.
- The current `shopkeeper-create-user` Edge Function handles public account requests and is superadmin-only.
- Added a separate `shopkeeper-user-management` Edge Function source with protected operations for normal-user invitations, profile edits, access status changes, deletion, listing roles, and superadmin-only promotion/demotion of admins. The Admin and Superadmin consoles call these operations.
- Deploy both functions before using these controls. A manual GitHub Actions workflow is available at `.github/workflows/deploy-shopkeeper-functions.yml`.
- Do not grant service-role credentials to browser code or store them in GitHub.

## Validation required
- [ ] Run latest schema/migration in Supabase and confirm success.
- [ ] Verify superadmin and admin roles in the database.
- [ ] Deploy both `shopkeeper-create-user` and `shopkeeper-user-management` Edge Functions and verify invitation emails.
- [ ] Test admin can approve/suspend a normal customer but cannot change superadmin access.
- [ ] Test admin product and order management.
- [ ] Test approved and unapproved sign-in/checkout.
- [ ] Test order creation and atomic stock decrement.
- [ ] Verify public visitors can submit account requests but cannot read other requests.

Sample product prices and stock quantities are illustrative only. Confirm actual prices and inventory before selling.
