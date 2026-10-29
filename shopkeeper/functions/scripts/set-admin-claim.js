// Run only from a trusted operator environment with Firebase Admin permissions.
// Never expose this script as a public endpoint or commit service-account credentials.
const { initializeApp, applicationDefault } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");

const projectId = process.env.GCLOUD_PROJECT || process.env.FIREBASE_PROJECT_ID;
const uid = process.argv[2];
if (!projectId || !uid) {
  console.error("Usage: FIREBASE_PROJECT_ID=your-project-id node scripts/set-admin-claim.js FIREBASE_AUTH_UID");
  process.exit(1);
}
initializeApp({ credential: applicationDefault(), projectId });
(async () => {
  const auth = getAuth();
  const user = await auth.getUser(uid);
  await auth.setCustomUserClaims(uid, { ...(user.customClaims || {}), shopkeeperAdmin: true });
  console.log("Granted shopkeeperAdmin to UID:", uid);
  console.log("The user must sign out and sign back in (or refresh their ID token) before the claim is reflected.");
})().catch(err => {
  console.error("Could not grant admin claim:", err.message);
  process.exit(1);
});
