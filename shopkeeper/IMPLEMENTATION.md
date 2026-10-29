# Shopkeeper implementation

The current customer and admin apps now use Supabase (see [SUPABASE_SETUP.md](./SUPABASE_SETUP.md)). The old Firebase template files are retained for reference only and are no longer used by the Shopkeeper frontend. Do not deploy the old Firebase rules/functions for this Supabase setup.

Follow the Supabase guide to create a free project, run the SQL schema, configure the browser publishable key, and securely grant the first administrator. Until those steps are completed, the backend is not live.

Online payments are not enabled. Cash-on-delivery checkout is the only supported payment method. Test Row Level Security, order creation, stock concurrency, and admin permissions before public launch.
