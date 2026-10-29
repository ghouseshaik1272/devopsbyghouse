import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";
import { supabaseConfig, isSupabaseConfigured } from "./supabase-config.js";
export const configured = isSupabaseConfigured;
export const supabase = configured ? createClient(supabaseConfig.url, supabaseConfig.publishableKey) : null;
let currentUser = null;
const listeners = new Set();
if (supabase) {
  supabase.auth.onAuthStateChange((_event, session) => {
    currentUser = session?.user || null;
    const user = currentUser ? facadeUser(currentUser) : null;
    for (const callback of listeners) Promise.resolve().then(() => callback(user));
    window.dispatchEvent(new CustomEvent("shopkeeper:auth", { detail: { user: user ? { uid:user.uid, email:user.email, displayName:user.displayName } : null } }));
  });
  supabase.auth.getSession().then(({data}) => {
    currentUser = data.session?.user || null;
    for (const callback of listeners) Promise.resolve().then(() => callback(currentUser ? facadeUser(currentUser) : null));
  });
}
function ready(){if(!configured)throw new Error("Supabase is not configured yet. Follow SUPABASE_SETUP.md and add the project URL and publishable key to supabase-config.js.");}
function signedIn(){ready();if(!currentUser)throw new Error("Please sign in first.");return currentUser;}
async function rpcBool(name){signedIn();const {data,error}=await supabase.rpc(name);if(error)throw error;return data===true;}
async function isAdmin(){return rpcBool("is_shopkeeper_admin");}
async function isSuperadmin(){return rpcBool("is_shopkeeper_superadmin");}
function facadeUser(user){return {uid:user.id,email:user.email,displayName:user.user_metadata?.display_name||user.user_metadata?.full_name||user.email,getIdTokenResult:async()=>({claims:{shopkeeperAdmin:await isAdmin(),shopkeeperSuperadmin:await isSuperadmin()}}),raw:user};}
function normalizeOrder(o){return {...o,customerUid:o.user_id,customerName:o.customer_name,customerId:o.user_id,paymentStatus:o.payment_status,paymentMethod:o.payment_method,createdAt:{toDate:()=>new Date(o.created_at),seconds:Math.floor(new Date(o.created_at).getTime()/1000)}};}
export function onAuthStateChanged(_auth,callback){listeners.add(callback);if(currentUser!==null)Promise.resolve().then(()=>callback(facadeUser(currentUser)));else if(configured)supabase.auth.getSession().then(({data})=>callback(data.session?facadeUser(data.session.user):null));return()=>listeners.delete(callback);}
export async function signUp({name,email,password}){ready();if(!name?.trim()||!email?.trim()||!password||password.length<8)throw new Error("Enter your name, email and a password with at least 8 characters.");const {data,error}=await supabase.auth.signUp({email:email.trim(),password,options:{data:{display_name:name.trim()}}});if(error)throw error;return data.user;}
export async function signIn({email,password}){ready();const {data,error}=await supabase.auth.signInWithPassword({email:email.trim(),password});if(error)throw error;currentUser=data.user;const [admin,approvedResult]=await Promise.all([isAdmin(),supabase.rpc("is_shopkeeper_customer_approved")]);if(approvedResult.error){await supabase.auth.signOut();throw approvedResult.error;}if(!admin&&approvedResult.data!==true){await supabase.auth.signOut();currentUser=null;throw new Error("Your Shopkeeper registration is pending approval or has been declined. Contact the store administrator.");}return data.user;}
export async function resetPassword(email){ready();if(!email?.trim())throw new Error("Enter your email.");const {error}=await supabase.auth.resetPasswordForEmail(email.trim(),{redirectTo:location.origin+location.pathname});if(error)throw error;return true;}
export async function logout(){ready();const {error}=await supabase.auth.signOut();if(error)throw error;currentUser=null;}
export async function getActiveProducts(){ready();const {data,error}=await supabase.from("shopkeeper_products").select("id,name,category,price,stock,unit,emoji,tag,description,active").eq("active",true).order("name");if(error)throw error;return data||[];}
export async function createOrder({customerName,phone,address,area,items,paymentMethod="cod"}){signedIn();if(!(await rpcBool("is_shopkeeper_customer_approved"))&&!(await isAdmin()))throw new Error("Your registration is pending approval.");if(!Array.isArray(items)||!items.length||items.length>50)throw new Error("Your cart is empty.");if(!customerName?.trim()||!phone?.trim()||!address?.trim()||!area?.trim())throw new Error("Complete all delivery details.");if(paymentMethod!=="cod")throw new Error("Online payments are not enabled. Select cash on delivery.");const payload={p_customer_name:customerName.trim(),p_phone:phone.trim(),p_address:address.trim(),p_area:area.trim(),p_items:items.map(item=>({product_id:String(item.productId||item.id||""),quantity:Number(item.quantity)}))};const {data,error}=await supabase.rpc("create_shopkeeper_order",payload);if(error)throw error;return {id:data.id,total:data.total};}
export async function listMyOrders(){signedIn();const {data,error}=await supabase.from("shopkeeper_orders").select("id,user_id,customer_name,phone,address,area,items,subtotal,delivery_fee,total,status,payment_status,payment_method,created_at").order("created_at",{ascending:false});if(error)throw error;return (data||[]).map(normalizeOrder);}
export async function listAllProducts(){if(!(await isAdmin()))throw new Error("Administrator access is required. Ask the project owner to add your account to shopkeeper_admins in Supabase.");const {data,error}=await supabase.from("shopkeeper_products").select("*").order("name");if(error)throw error;return data||[];}
export async function adminListOrders(){if(!(await isAdmin()))throw new Error("Administrator access is required.");const {data,error}=await supabase.from("shopkeeper_orders").select("*").order("created_at",{ascending:false});if(error)throw error;return (data||[]).map(normalizeOrder);}
export async function saveProduct(product){if(!(await isAdmin()))throw new Error("Administrator access is required.");const name=String(product.name||"").trim(),price=Number(product.price),stock=Number(product.stock);if(!name||name.length>120||!Number.isFinite(price)||price<0||!Number.isInteger(stock)||stock<0)throw new Error("Enter a product name, valid price and whole-number stock.");const data={name,category:String(product.category||"Food & Groceries").slice(0,80),price,stock,unit:String(product.unit||"item").slice(0,30),emoji:String(product.emoji||"🛍️").slice(0,8),tag:String(product.tag||"").slice(0,80),description:String(product.description||"").slice(0,250),active:product.active!==false,updated_at:new Date().toISOString()};let result;if(product.id)result=await supabase.from("shopkeeper_products").update(data).eq("id",product.id).select("id").single();else result=await supabase.from("shopkeeper_products").insert(data).select("id").single();if(result.error)throw result.error;return result.data.id;}
export async function setProductActive(id,active){if(!(await isAdmin()))throw new Error("Administrator access is required.");const {error}=await supabase.from("shopkeeper_products").update({active:!!active,updated_at:new Date().toISOString()}).eq("id",id);if(error)throw error;}
export async function updateOrderStatus(id,status){if(!(await isAdmin()))throw new Error("Administrator access is required.");if(!["pending","confirmed","packed","out_for_delivery","delivered","cancelled"].includes(status))throw new Error("Invalid order status.");const {error}=await supabase.from("shopkeeper_orders").update({status,updated_at:new Date().toISOString()}).eq("id",id);if(error)throw error;}
export async function submitAccountRequest({fullName,email,phone,message=""}) {
  ready();
  const name=String(fullName||"").trim(), mail=String(email||"").trim().toLowerCase(), tel=String(phone||"").trim(), note=String(message||"").trim();
  if(name.length<2||name.length>100) throw new Error("Enter your full name (2–100 characters).");
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail)||mail.length>254) throw new Error("Enter a valid email address.");
  if(tel.length>30||note.length>1000) throw new Error("Phone or message is too long.");
  const {error}=await supabase.from("shopkeeper_account_requests").insert({full_name:name,email:mail,phone:tel,message:note});
  if(error) throw error;
  return true;
}
export async function listAccountRequests() {
  if(!(await isSuperadmin())) throw new Error("Superadmin access is required.");
  const {data,error}=await supabase.from("shopkeeper_account_requests").select("*").order("created_at",{ascending:false});
  if(error) throw error;
  return data||[];
}
export async function rejectAccountRequest(requestId) {
  if(!(await isSuperadmin())) throw new Error("Superadmin access is required.");
  const {data,error}=await supabase.from("shopkeeper_account_requests").update({status:"rejected",handled_at:new Date().toISOString(),handled_by:currentUser.id}).eq("id",requestId).eq("status","pending").select("id").maybeSingle();
  if(error) throw error;
  if(!data) throw new Error("Request was already handled or no longer exists.");
}
export async function inviteAccountRequest(requestId) {
  if(!(await isSuperadmin())) throw new Error("Superadmin access is required.");
  const {data,error}=await supabase.functions.invoke("shopkeeper-create-user",{body:{requestId}});
  if(error) throw error;
  if(data?.error) throw new Error(data.error);
  return data;
}
export async function manageShopkeeperUser(payload) {
  signedIn();
  const {data,error}=await supabase.functions.invoke("shopkeeper-user-management",{body:payload});
  if(error) throw error;
  if(data?.error) throw new Error(data.error);
  return data;
}
export async function listNormalCustomers() {
  if(!(await isAdmin())) throw new Error("Administrator access is required.");
  const {data,error}=await supabase.from("shopkeeper_customer_access").select("user_id,email,display_name,status,created_at,updated_at").order("created_at",{ascending:false});
  if(error) throw error;
  return data||[];
}
export async function setNormalCustomerStatus(userId,status) {
  if(!(await isAdmin())) throw new Error("Administrator access is required.");
  if(!["approved","rejected","suspended","pending"].includes(status)) throw new Error("Invalid customer status.");
  return manageShopkeeperUser({operation:"set_status",userId,status});
}
export async function listShopkeeperCoupons(){
  if(!(await isSuperadmin())) throw new Error("Only superadmins can manage coupons.");
  const {data,error}=await supabase.from("shopkeeper_coupons").select("*").order("created_at",{ascending:false});
  if(error) throw error;
  return data||[];
}
export async function saveShopkeeperCoupon(coupon){
  if(!(await isSuperadmin())) throw new Error("Only superadmins can manage coupons.");
  const name=String(coupon.name||"").trim();
  const code=String(coupon.code||"").trim().toUpperCase().replace(/\s+/g,"");
  const validTill=String(coupon.valid_till||"");
  const excludedCategories=[...new Set((Array.isArray(coupon.excluded_categories)?coupon.excluded_categories:String(coupon.excluded_categories||"").split(",")).map(x=>String(x).trim()).filter(Boolean))];
  if(name.length<2||name.length>100) throw new Error("Coupon name must be between 2 and 100 characters.");
  if(!/^[A-Z0-9_-]{3,40}$/.test(code)) throw new Error("Coupon code must be 3–40 characters using letters, numbers, hyphens or underscores.");
  if(!/^\d{4}-\d{2}-\d{2}$/.test(validTill)||Number.isNaN(Date.parse(validTill))||validTill<new Date().toISOString().slice(0,10)) throw new Error("Choose a valid expiry date that is today or later.");
  if(excludedCategories.some(x=>x.length>80)) throw new Error("Category names must be 80 characters or fewer.");
  const row={name,code,valid_till:validTill,excluded_categories:excludedCategories,updated_at:new Date().toISOString()};
  let query;
  if(coupon.id) query=supabase.from("shopkeeper_coupons").update(row).eq("id",coupon.id);
  else query=supabase.from("shopkeeper_coupons").insert({...row,created_by:currentUser.id});
  const {data,error}=await query.select("*").single();
  if(error) throw error;
  return data;
}
export async function deleteShopkeeperCoupon(id){
  if(!(await isSuperadmin())) throw new Error("Only superadmins can manage coupons.");
  const {error}=await supabase.from("shopkeeper_coupons").delete().eq("id",id);
  if(error) throw error;
  return true;
}
export async function listCustomerRegistrations(){if(!(await isSuperadmin()))throw new Error("Superadmin access is required.");const {data,error}=await supabase.from("shopkeeper_customer_access").select("*").order("created_at",{ascending:false});if(error)throw error;return data||[];}
export async function decideCustomerRegistration(userId,status){if(!(await isSuperadmin()))throw new Error("Superadmin access is required.");if(!["approved","rejected","suspended","pending"].includes(status))throw new Error("Invalid registration status.");const {error}=await supabase.from("shopkeeper_customer_access").update({status,updated_at:new Date().toISOString()}).eq("user_id",userId);if(error)throw error;}
export {supabase as db, supabase as auth};
window.ShopkeeperBackend={configured,get currentUser(){return currentUser;},signUp,signIn,resetPassword,logout,getActiveProducts,createOrder,listMyOrders,listAllProducts,adminListOrders,saveProduct,setProductActive,updateOrderStatus,listCustomerRegistrations,decideCustomerRegistration,listShopkeeperCoupons,saveShopkeeperCoupon,deleteShopkeeperCoupon,submitAccountRequest,listAccountRequests,rejectAccountRequest,inviteAccountRequest,listNormalCustomers,setNormalCustomerStatus,manageShopkeeperUser};
window.dispatchEvent(new CustomEvent("shopkeeper:backend-ready",{detail:{configured}}));
