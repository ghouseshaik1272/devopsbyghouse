import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import { getFirestore, collection, addDoc, getDocs, query, where, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";
const configured = !!(firebaseConfig?.projectId && firebaseConfig.projectId !== "YOUR_PROJECT_ID" && firebaseConfig?.apiKey && !firebaseConfig.apiKey.startsWith("PASTE_"));
let auth = null, db = null;
if (configured) { const app = initializeApp(firebaseConfig); auth = getAuth(app); db = getFirestore(app); }
export { configured, auth, db, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, collection, addDoc, getDocs, query, where, serverTimestamp };
export async function getActiveProducts() {
  if (!configured) return null;
  const snap = await getDocs(query(collection(db, "shopkeeperProducts"), where("active", "==", true)));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}
export async function createOrder({ customerName, phone, address, items, total }) {
  if (!configured) throw new Error("Shopkeeper backend is not configured yet.");
  if (!auth.currentUser) throw new Error("Please sign in before placing an order.");
  if (!Array.isArray(items) || !items.length) throw new Error("Your cart is empty.");
  if (!customerName?.trim() || !phone?.trim() || !address?.trim()) throw new Error("Please complete all delivery details.");
  return addDoc(collection(db, "shopkeeperOrders"), {
    customerUid: auth.currentUser.uid, customerEmail: auth.currentUser.email || "",
    customerName: customerName.trim().slice(0,100), phone: phone.trim().slice(0,30), address: address.trim().slice(0,500),
    items: items.map(x => ({ productId: String(x.productId), name: String(x.name).slice(0,100), quantity: Math.max(1, Math.min(99, Number(x.quantity)||1)), unitPrice: Math.max(0, Number(x.unitPrice)||0) })),
    total: Math.max(0, Number(total)||0), status: "pending", createdAt: serverTimestamp()
  });
}
