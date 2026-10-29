# Shopkeeper backend setup

This directory adds optional Firebase Authentication + Cloud Firestore backend files and an admin dashboard.

## Current status
- Storefront: static product catalogue and cart preview.
- Backend code: prepared, but **not live until a Firebase project is configured and deployed**.
- No real payments are enabled. Do not accept money until payment verification, refunds, privacy terms, tax/shipping rules and fulfilment are implemented and tested.
- The repository root already has Firebase configuration/rules for another app. These Shopkeeper rules are deliberately separate; do not replace the root rules without checking other apps.

## Configure Firebase
1. Create a Firebase project at https://console.firebase.google.com/ and add a Web App.
2. Enable Authentication → Email/Password.
3. Create a Cloud Firestore database.
4. Copy firebase-config.example.js to firebase-config.js and fill in the Web App config.
5. Publish shopkeeper/firestore.rules to this project's Firestore database. Do not overwrite the root project's rules unless you confirm that is the intended Firebase project.
6. Create your first admin user in Firebase Authentication. In Firestore, manually create shopkeeperAdmins/{AUTH_UID} with fields email (string) and role: "admin". Get the UID from Authentication. Browser clients cannot grant themselves admin.
7. Add documents to shopkeeperProducts. Required fields: name (string), category (string), price (number, INR), unit (string), emoji (string), description (string), active (boolean). Optional: tag (string).
8. Set Firebase authorized domains to include devopsbyghouse.co.in and test with a separate customer account.

## Files
- firebase-config.example.js: Web app config template.
- firestore.rules: isolated Shopkeeper data access rules.
- backend.js: Firebase initialization and order/product helpers.
- admin.html: admin product/order dashboard.

## Before launch
- Configure secure registration/password reset, admin recovery and MFA.
- Add payment gateway with server-side order and payment verification; never trust a browser-submitted total.
- Add delivery zones, minimum order, inventory reservation, cancellation/refund flow, privacy policy, terms and support contacts.
- Test Firestore rules with Firebase Emulator Suite before taking real orders.
