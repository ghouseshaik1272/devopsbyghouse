const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { initializeApp } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');

initializeApp();
const db = getFirestore();

exports.createAdminPasswordResetLink = onCall({ region: 'asia-south1' }, async request => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in first.');
  const adminRef = db.doc(`glabAdmins/${request.auth.uid}`);
  const admin = await adminRef.get();
  if (!admin.exists || admin.data().role !== 'admin') {
    throw new HttpsError('permission-denied', 'GLab administrator access is required.');
  }

  const targetUid = request.data?.targetUid;
  if (typeof targetUid !== 'string' || targetUid.length < 1 || targetUid.length > 128) {
    throw new HttpsError('invalid-argument', 'Choose a valid GLab account.');
  }
  const target = await db.doc(`glabUsers/${targetUid}`).get();
  if (!target.exists || typeof target.data().email !== 'string') {
    throw new HttpsError('not-found', 'That GLab account could not be found.');
  }

  const email = target.data().email;
  const link = await getAuth().generatePasswordResetLink(email, {
    url: 'https://devopsbyghouse.co.in/GLab/login.html',
    handleCodeInApp: false
  });
  await db.collection('glabAdminActions').add({
    action: 'password_reset_link_created',
    adminUid: request.auth.uid,
    targetUid,
    occurredAt: FieldValue.serverTimestamp()
  });
  return { email, link };
});
