import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const allowedOrigin = "https://devopsbyghouse.co.in";
const corsHeaders = {
  "Access-Control-Allow-Origin": allowedOrigin,
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
type Operation = "invite_normal" | "promote_admin" | "demote_admin" | "list_users" | "set_status" | "update_profile" | "delete_user";
Deno.serve(async (req) => {
  const respond = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return respond({ error: "Method not allowed." }, 405);

  const url = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !anonKey || !serviceKey) return respond({ error: "Missing server-side Supabase secrets." }, 500);
  const authorization = req.headers.get("Authorization");
  if (!authorization) return respond({ error: "Sign in first." }, 401);

  const caller = createClient(url, anonKey, { global: { headers: { Authorization: authorization } } });
  const { data: callerData, error: callerError } = await caller.auth.getUser();
  if (callerError || !callerData.user) return respond({ error: "Invalid session." }, 401);
  const [{ data: superadmin }, { data: adminRole }] = await Promise.all([
    caller.rpc("is_shopkeeper_superadmin"),
    caller.rpc("is_shopkeeper_admin"),
  ]);
  const isSuperadmin = superadmin === true;
  const isAdmin = adminRole === true;
  if (!isAdmin) return respond({ error: "Admin or superadmin access is required." }, 403);

  let body: { operation?: Operation; email?: string; displayName?: string; userId?: string; status?: string };
  try { body = await req.json(); } catch { return respond({ error: "Invalid JSON." }, 400); }
  const operation = body.operation;
  const service = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });

  if (operation === "list_users") {
    if (!isSuperadmin) return respond({ error: "Only the superadmin can list platform roles." }, 403);
    const { data: customers, error: customerError } = await service.from("shopkeeper_customer_access").select("user_id,email,display_name,status,created_at").order("created_at", { ascending: false });
    if (customerError) return respond({ error: customerError.message }, 400);
    const [{ data: admins, error: adminsError }, { data: superadmins, error: supersError }] = await Promise.all([
      service.from("shopkeeper_admins").select("user_id"),
      service.from("shopkeeper_superadmins").select("user_id"),
    ]);
    if (adminsError || supersError) return respond({ error: adminsError?.message || supersError?.message }, 400);
    const adminIds = new Set((admins || []).map((x: {user_id:string}) => x.user_id));
    const superIds = new Set((superadmins || []).map((x: {user_id:string}) => x.user_id));
    return respond({ success: true, users: (customers || []).map((u: {user_id:string;email:string;display_name:string;status:string;created_at:string}) => ({...u, role: superIds.has(u.user_id) ? "superadmin" : adminIds.has(u.user_id) ? "admin" : "customer"})) });
  }

  if (operation === "invite_normal") {
    const email = String(body.email || "").trim().toLowerCase();
    const displayName = String(body.displayName || "").trim();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return respond({ error: "Enter a valid email." }, 400);
    if (displayName.length < 2 || displayName.length > 100) return respond({ error: "Enter a name between 2 and 100 characters." }, 400);
    const { data, error } = await service.auth.admin.inviteUserByEmail(email, {
      data: { display_name: displayName },
      redirectTo: "https://devopsbyghouse.co.in/shopkeeper/app.html",
    });
    if (error || !data.user) return respond({ error: error?.message || "Invitation failed." }, 400);
    const { error: accessError } = await service.from("shopkeeper_customer_access").upsert({
      user_id: data.user.id, email, display_name: displayName, status: "approved", updated_at: new Date().toISOString(),
    }, { onConflict: "user_id" });
    if (accessError) return respond({ error: "Invitation sent but access record failed: " + accessError.message }, 500);
    return respond({ success: true, userId: data.user.id, email, message: "Invitation sent to normal user." });
  }

  if ((operation === "promote_admin" || operation === "demote_admin") && !isSuperadmin) return respond({ error: "Only the superadmin can change admin roles." }, 403);
  if (!body.userId || !/^[0-9a-f-]{36}$/i.test(body.userId)) return respond({ error: "A valid userId is required." }, 400);
  const userId = body.userId;
  const { data: targetAdmin } = await service.from("shopkeeper_admins").select("user_id").eq("user_id", userId).maybeSingle();
  const { data: targetSuperadmin } = await service.from("shopkeeper_superadmins").select("user_id").eq("user_id", userId).maybeSingle();
  if (targetSuperadmin) return respond({ error: "Protected account: superadmin users cannot be changed or deleted by this function." }, 403);
  if (!isSuperadmin && targetAdmin) return respond({ error: "Admins can manage normal users only; only the superadmin can manage admin accounts." }, 403);

  if (operation === "promote_admin") {
    const { data: target, error: targetError } = await service.auth.admin.getUserById(userId);
    if (targetError || !target.user) return respond({ error: "Target user not found." }, 404);
    const { error } = await service.from("shopkeeper_admins").upsert({ user_id: userId }, { onConflict: "user_id" });
    if (error) return respond({ error: error.message }, 400);
    const { error: accessError } = await service.from("shopkeeper_customer_access").upsert({
      user_id: userId, email: target.user.email || "", display_name: String(target.user.user_metadata?.display_name || ""), status: "approved", updated_at: new Date().toISOString(),
    }, { onConflict: "user_id" });
    if (accessError) return respond({ error: accessError.message }, 400);
    return respond({ success: true, message: "User promoted to admin." });
  }

  if (operation === "demote_admin") {
    if (!targetAdmin) return respond({ error: "This user is not an admin." }, 404);
    const { error } = await service.from("shopkeeper_admins").delete().eq("user_id", userId);
    if (error) return respond({ error: error.message }, 400);
    return respond({ success: true, message: "Admin role removed. The account remains a normal user." });
  }

  if (operation === "set_status") {
    if (!["approved", "rejected", "suspended", "pending"].includes(String(body.status))) return respond({ error: "Invalid status." }, 400);
    const { error } = await service.from("shopkeeper_customer_access").update({ status: body.status, updated_at: new Date().toISOString() }).eq("user_id", userId);
    if (error) return respond({ error: error.message }, 400);
    return respond({ success: true, message: "User status updated." });
  }

  if (operation === "update_profile") {
    const { data: target, error: targetError } = await service.auth.admin.getUserById(userId);
    if (targetError || !target.user) return respond({ error: "Target user not found." }, 404);
    const email = body.email === undefined ? target.user.email : String(body.email).trim().toLowerCase();
    const displayName = body.displayName === undefined ? String(target.user.user_metadata?.display_name || "") : String(body.displayName).trim();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return respond({ error: "Enter a valid email." }, 400);
    if (displayName.length < 2 || displayName.length > 100) return respond({ error: "Enter a name between 2 and 100 characters." }, 400);
    const { error } = await service.auth.admin.updateUserById(userId, { email, user_metadata: { ...target.user.user_metadata, display_name: displayName } });
    if (error) return respond({ error: error.message }, 400);
    const { error: accessError } = await service.from("shopkeeper_customer_access").update({ email, display_name: displayName, updated_at: new Date().toISOString() }).eq("user_id", userId);
    if (accessError) return respond({ error: accessError.message }, 400);
    return respond({ success: true, message: "User profile updated. Supabase may require the user to confirm an email change." });
  }

  if (operation === "delete_user") {
    if (userId === callerData.user.id) return respond({ error: "You cannot delete your own signed-in account." }, 400);
    const { error } = await service.auth.admin.deleteUser(userId);
    if (error) return respond({ error: error.message }, 400);
    return respond({ success: true, message: "User account deleted." });
  }
  return respond({ error: "Unsupported operation." }, 400);
});
