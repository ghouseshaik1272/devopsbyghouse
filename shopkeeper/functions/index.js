const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");

initializeApp();
const db = getFirestore();

exports.createShopkeeperOrder = onCall({ enforceAppCheck: false, maxInstances: 10 }, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Please sign in before placing an order.");
  const input = request.data || {};
  const customerName = String(input.customerName || "").trim().slice(0, 100);
  const phone = String(input.phone || "").trim().slice(0, 30);
  const address = String(input.address || "").trim().slice(0, 500);
  const area = String(input.area || "").trim().slice(0, 120);
  const paymentMethod = input.paymentMethod || "cod";
  const items = input.items;
  if (!customerName || !phone || !address || !area) throw new HttpsError("invalid-argument", "Complete all delivery details.");
  if (paymentMethod !== "cod") throw new HttpsError("failed-precondition", "Only cash on delivery is enabled.");
  if (!Array.isArray(items) || items.length < 1 || items.length > 50) throw new HttpsError("invalid-argument", "Your cart is empty or too large.");

  const quantities = new Map();
  for (const item of items) {
    const productId = String(item.productId || "");
    const quantity = Number(item.quantity);
    if (!/^[A-Za-z0-9_-]{1,150}$/.test(productId) || !Number.isInteger(quantity) || quantity < 1 || quantity > 99) {
      throw new HttpsError("invalid-argument", "Invalid cart item.");
    }
    quantities.set(productId, (quantities.get(productId) || 0) + quantity);
  }
  if (quantities.size > 50) throw new HttpsError("invalid-argument", "Too many unique products.");

  const orderRef = db.collection("shopkeeperOrders").doc();
  const productRefs = [...quantities.keys()].map(id => db.collection("shopkeeperProducts").doc(id));
  const settingsRef = db.collection("shopkeeperSettings").doc("public");

  return db.runTransaction(async tx => {
    const productSnaps = [];
    for (const ref of productRefs) productSnaps.push(await tx.get(ref));
    const settingsSnap = await tx.get(settingsRef);
    let subtotal = 0;
    const safeItems = [];
    for (let i = 0; i < productRefs.length; i++) {
      const snap = productSnaps[i];
      const quantity = quantities.get(productRefs[i].id);
      if (!snap.exists || snap.data().active !== true) throw new HttpsError("failed-precondition", "A product is no longer available.");
      const p = snap.data();
      const price = Number(p.price);
      const stock = Number(p.stock);
      if (!Number.isFinite(price) || price < 0) throw new HttpsError("failed-precondition", "A product has an invalid price.");
      if (!Number.isInteger(stock) || stock < quantity) throw new HttpsError("failed-precondition", "Insufficient stock for " + String(p.name || "a product").slice(0, 80) + ".");
      subtotal += price * quantity;
      safeItems.push({ productId: productRefs[i].id, name: String(p.name || "Product").slice(0, 100), quantity, unitPrice: price, unit: String(p.unit || "item").slice(0, 30) });
      tx.update(productRefs[i], { stock: stock - quantity, updatedAt: FieldValue.serverTimestamp() });
    }
    subtotal = Math.round(subtotal * 100) / 100;
    const feeRaw = settingsSnap.exists ? Number(settingsSnap.data().deliveryFee) : 0;
    const deliveryFee = Number.isFinite(feeRaw) ? Math.max(0, feeRaw) : 0;
    const total = Math.round((subtotal + deliveryFee) * 100) / 100;
    if (!Number.isFinite(total) || total > 1000000) throw new HttpsError("failed-precondition", "Order total exceeds the supported limit.");
    tx.set(orderRef, {
      customerUid: request.auth.uid,
      customerEmail: String(request.auth.token.email || "").slice(0, 254),
      customerName, phone, address, area, items: safeItems,
      subtotal, deliveryFee, total, status: "pending", paymentStatus: "unpaid",
      paymentMethod: "cod", createdAt: FieldValue.serverTimestamp()
    });
    return { id: orderRef.id, total };
  });
});
