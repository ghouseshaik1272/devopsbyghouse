// Supabase project URL and publishable key from Project Settings → API Keys.
// Publishable/anon keys are designed for browser use when Row Level Security is enabled.
// NEVER put a service_role or secret key in this file.
export const supabaseConfig = {
  url: "https://koyjdbajetikgzobpcfj.supabase.co",
  publishableKey: "YOUR_SUPABASE_PUBLISHABLE_KEY"
};
export const isSupabaseConfigured =
  /^https:\/\/[^/]+\.supabase\.co$/.test(supabaseConfig.url) &&
  !supabaseConfig.url.includes("YOUR_PROJECT_REF") &&
  supabaseConfig.publishableKey !== "YOUR_SUPABASE_PUBLISHABLE_KEY";
