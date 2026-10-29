import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "https://devopsbyghouse.co.in",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const respond = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  if (req.method !== "POST") return respond({ error: "Method not allowed." }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !anonKey || !serviceRoleKey) return respond({ error: "Server is missing Supabase environment secrets." }, 500);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return respond({ error: "Sign in as superadmin first." }, 401);

  const caller = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
  const { data: isSuperadmin, error: roleError } = await caller.rpc("is_shopkeeper_superadmin");
  if (roleError || isSuperadmin !== true) return respond({ error: "Superadmin access is required." }, 403);

  let body: { requestId?: string };
  try { body = await req.json(); } catch { return respond({ error: "Invalid JSON body." }, 400); }
  if (!body.requestId || !/^[0-9a-f-]{36}$/i.test(body.requestId)) return respond({ error: "A valid requestId is required." }, 400);

  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: request, error: requestError } = await admin.from("shopkeeper_account_requests").select("*").eq("id", body.requestId).single();
  if (requestError || !request) return respond({ error: "Account request not found." }, 404);
  if (request.status !== "pending") return respond({ error: "This request has already been handled." }, 409);

  const { data: invite, error: inviteError } = await admin.auth.admin.inviteUserByEmail(request.email, {
    data: { display_name: request.full_name, shopkeeper_account_request: request.id },
    redirectTo: "https://devopsbyghouse.co.in/shopkeeper/app.html",
  });
  if (inviteError || !invite.user) return respond({ error: inviteError?.message || "Could not invite this user." }, 400);

  const userId = invite.user.id;
  const { error: accessError } = await admin.from("shopkeeper_customer_access").upsert({
    user_id: userId, email: request.email, display_name: request.full_name, status: "approved", updated_at: new Date().toISOString(),
  }, { onConflict: "user_id" });
  if (accessError) return respond({ error: "Invitation sent, but customer access could not be updated: " + accessError.message }, 500);

  const { error: requestUpdateError } = await admin.from("shopkeeper_account_requests").update({
    status: "invited", handled_at: new Date().toISOString(), handled_by: (await caller.auth.getUser()).data.user?.id ?? null, invited_user_id: userId,
  }).eq("id", request.id);
  if (requestUpdateError) return respond({ error: "Invitation sent, but request status could not be updated: " + requestUpdateError.message }, 500);

  return respond({ success: true, message: "Invitation email sent and customer access approved.", email: request.email });
});
