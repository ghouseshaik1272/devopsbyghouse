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
async function isAdmin(){signedIn();const {data,error}=await supabase.rpc("is_shopkeeper_admin");if(error)throw error;return data===true;}
function facadeUser(user){return {uid:user.id,email:user.email,displayName:user.user_metadata?.display_name||user.user_metadata?.full_name||user.email,getIdTokenResult:async()=>({claims:{shopkeeperAdmin:await isAdmin()}}),raw:user};}
export function onAuthStateChanged(_auth,callback){listeners.add(callback);if(currentUser!==null)Promise.resolve().then(()=>callback(facadeUser(currentUser)));else if(configured)supabase.auth.getSession().then(({data})=>callback(data.session?facadeUser(data.session.user):null));return()=>listeners.delete(callback);}
export async function signUp({name,email,password}){ready();if(!name?.trim()||!email?.trim()||!password||password.length<8)throw new Error("Enter your name, email and a password with at least 8 characters.");const {data,error}=await supabase.auth.signUp({email:email.trim(),password,options:{data:{display_name:name.trim()}}});if(error)throw error;if(data.user&&!data.session) return data.user;currentUser=data.user;return data.user;}
export async function signIn({email,password}){ready();const {data,error}=await supabase.auth.signInWithPassword({email:email.trim(),password});if(error)throw error;currentUser=data.user;return data.user;}
export async function resetPassword(email){ready();if(!email?.trim())throw new Error("Enter your email.");const {error}=await supabase.auth.resetPasswordForEmail(email.trim(),{redirectTo:location.origin+location.pathname});if(error)throw error;return true;}
export async function logout(){ready();const {error}=await supabase.auth.signOut();if(error)throw error;currentUser=null;}
export async function getActiveProducts(){ready();const {data,error}=await supabase.from("shopkeeper_products").select("id,name,category,price,stock,unit,emoji,tag,description,active").eq("active",true).order("name");if(error)throw error;return data||[];}
export async function createOrder({customerName,phone,address,area,items,paymentMethod="cod"}){signedIn();if(!Array.isArray(items)||!items.length||items.length>50)throw new Error("Your cart is empty.");if(!customerName?.trim()||!phone?.trim()||!address?.trim()||!area?.trim())throw new Error("Complete all delivery details.");if(paymentMethod!=="cod")throw new Error("Online payments are not enabled. Select cash on delivery.");const payload={p_customer_name:customerName.trim(),p_phone:phone.trim(),p_address:address.trim(),p_area:area.trim(),p_items:items.map(item=>({product_id:String(item.productId||item.id||""),quantity:Number(item.quantity)}))};const {data,error}=await supabase.rpc("create_shopkeeper_order",payload);if(error)throw error;return {id:data.id,total:data.total};}
export async function listMyOrders(){signedIn();const {data,error}=await supabase.from("shopkeeper_orders").select("id,customer_name,phone,address,area,items,subtotal,delivery_fee,total,status,payment_status,payment_method,created_at").order("created_at",{ascending:false});if(error)throw error;return (data||[]).map(o=>({...o,customerUid:currentUser.id,createdAt:{toDate:()=>new Date(o.created_at)}}));}
export async function listAllProducts(){if(!(await isAdmin()))throw new Error("Administrator access is required. Ask the project owner to add your account to shopkeeper_admins in the Supabase SQL Editor.");const {data,error}=await supabase.from("shopkeeper_products").select("*").order("name");if(error)throw error;return data||[];}
export async function adminListOrders(){if(!(await isAdmin()))throw new Error("Administrator access is required.");const {data,error}=await supabase.from("shopkeeper_orders").select("*").order("created_at",{ascending:false});if(error)throw error;return (data||[]).map(o=>({...o,createdAt:{toDate:()=>new Date(o.created_at)}}));}
export async function saveProduct(product){if(!(await isAdmin()))throw new Error("Administrator access is required.");const name=String(product.name||"").trim(),price=Number(product.price),stock=Number(product.stock);if(!name||name.length>120||!Number.isFinite(price)||price<0||!Number.isInteger(stock)||stock<0)throw new Error("Enter a product name, valid price and whole-number stock.");const data={name,category:String(product.category||"Food & Groceries").slice(0,80),price,stock,unit:String(product.unit||"item").slice(0,30),emoji:String(product.emoji||"🛍️").slice(0,8),tag:String(product.tag||"").slice(0,80),description:String(product.description||"").slice(0,250),active:product.active!==false,updated_at:new Date().toISOString()};let result;if(product.id)result=await supabase.from("shopkeeper_products").update(data).eq("id",product.id).select("id").single();else result=await supabase.from("shopkeeper_products").insert(data).select("id").single();if(result.error)throw result.error;return result.data.id;}
export async function setProductActive(id,active){if(!(await isAdmin()))throw new Error("Administrator access is required.");const {error}=await supabase.from("shopkeeper_products").update({active:!!active,updated_at:new Date().toISOString()}).eq("id",id);if(error)throw error;}
export async function updateOrderStatus(id,status){if(!(await isAdmin()))throw new Error("Administrator access is required.");if(!["pending","confirmed","packed","out_for_delivery","delivered","cancelled"].includes(status))throw new Error("Invalid order status.");const {error}=await supabase.from("shopkeeper_orders").update({status,updated_at:new Date().toISOString()}).eq("id",id);if(error)throw error;}
export {supabase as db, supabase as auth};
window.ShopkeeperBackend={configured,get currentUser(){return currentUser;},signUp,signIn,resetPassword,logout,getActiveProducts,createOrder,listMyOrders,listAllProducts,adminListOrders,saveProduct,setProductActive,updateOrderStatus};
window.dispatchEvent(new CustomEvent("shopkeeper:backend-ready",{detail:{configured}}));
