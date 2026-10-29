// Copy the Firebase web app config from Firebase Console > Project settings > Your apps.
// This file contains public client configuration only, never service-account credentials.
export const firebaseConfig = {
  apiKey: "PASTE_FIREBASE_WEB_API_KEY",
  authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT_ID.firebasestorage.app",
  messagingSenderId: "PASTE_MESSAGING_SENDER_ID",
  appId: "PASTE_FIREBASE_APP_ID"
};
export const isFirebaseConfigured =
  firebaseConfig.apiKey !== "PASTE_FIREBASE_WEB_API_KEY" &&
  firebaseConfig.projectId !== "YOUR_PROJECT_ID" &&
  firebaseConfig.appId !== "PASTE_FIREBASE_APP_ID";
