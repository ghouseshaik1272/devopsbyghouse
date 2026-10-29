# Shopkeeper implementation

## Current state
The storefront and admin/superadmin screens are static GitHub Pages pages. The Firebase integration files in this folder are a setup-ready starting point, not a live backend. The site's existing root `firebase.json` and `firestore.rules` belong to another feature; do not overwrite them to configure Shopkeeper.

## 1. Create a Firebase project
1. Create a project in the Firebase Console and register a Web app.
2. Enable **Authentication → Email/Password**.
3. Create a **Cloud Firestore** database in production mode.
4. Copy the web app configuration into `firebase-config.js`.
5. In Authentication settings, add your live website domain to Authorized domains.

The web config is public by design; never place service-account JSON, private keys, payment secrets, or admin SDK credentials in this folder.

## 2. Deploy Shopkeeper Firestore rules safely
The rules in `shopkeeper.rules` are a standalone rules file. Before deploying them, make sure the Firebase project is dedicated to Shopkeeper or merge the rules deliberately with every existing app's rules. Firestore allows one active ruleset per database, so replacing a ruleset can break other applications. Do not deploy blindly against the existing project.

With Firebase CLI installed and authenticated, review the target project and then deploy the rules using a separate config file or the Firebase Console Rules editor. Keep a copy of the previous ruleset and test in the Emulator Suite first.

## 3. Administrator security
The rules require a trusted custom claim `shopkeeperAdmin: true`. This claim must be set by a trusted Firebase Admin SDK environment (for example, a secured Cloud Function or a one-time local admin script run by the project owner). Never let users promote themselves, and never hard-code a shared admin password in browser code. The static superadmin screen is only a visual prototype until server-side authentication and authorization are connected.

## 4. Collections
- `shopkeeperProducts/{productId}`: name, category, price (integer paise or documented integer rupees), unit, emoji/image URL, stock, active, updatedAt.
- `shopkeeperOrders/{orderId}`: customer UID, customer contact and delivery details, item snapshots, subtotal, delivery fee, total, status, payment status/method, created timestamp.
- `shopkeeperUsers/{uid}`: customer display name, email and creation timestamp.
- `shopkeeperSettings/{settingId}`: public store configuration.

Use server-side validation for prices, stock availability, discounts, delivery fee, and order totals before accepting production orders. Firestore rules alone cannot safely validate all cross-document inventory calculations.

## 5. Real payments and delivery
Online payments are intentionally not enabled. Integrate a provider such as Razorpay only through a trusted backend: create payment orders server-side, verify signatures on the server, and verify webhooks before marking payments paid. Never trust a browser redirect or client-submitted payment status. For initial local testing, use cash on delivery only after order creation is server-validated. Confirm delivery areas, service hours, stock handling, cancellation/refund rules, privacy policy, terms, and support contact before launch.

## 6. Test checklist
- Test unauthenticated reads/writes and cross-user order access in the Firebase Emulator Suite.
- Verify customers cannot edit product prices, inventory, order totals, statuses, or payment state.
- Verify admin access works only for users with the trusted custom claim.
- Test sign-up, sign-in, password reset, order creation, and account deletion/privacy workflows.
- Configure backups, budget alerts, monitoring, and production security review.

## Important
Committing files triggers the repository's GitHub Pages workflow, but it does not configure Firebase or deploy Firestore rules. A real production launch still requires a Firebase project, its web config, a safely deployed ruleset, trusted admin provisioning, and a server-side payment/order validation path.
