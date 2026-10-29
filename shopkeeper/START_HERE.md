# Shopkeeper — start here

This guide is for the dedicated Firebase project used only by Shopkeeper. It does not require a new domain.

## A. One-time Google Console steps

1. Open https://console.firebase.google.com/ and sign in.
2. Create a project named **Shopkeeper Production** (the display name can differ if that name is unavailable).
3. Register a **Web app** named **Shopkeeper Web**.
4. Copy the Firebase web configuration shown for that app.
5. In **Build → Authentication → Get started → Sign-in method**, enable **Email/Password**.
6. In **Build → Firestore Database**, create a database in **Production mode** and choose a region appropriate for your customers. Choose carefully; database location is difficult to change later.
7. In Authentication settings, add `devopsbyghouse.co.in` to Authorized domains (and `www.devopsbyghouse.co.in` if you use that hostname).

## B. Connect the web app

Replace the placeholder values in `firebase-config.js` with the exact web configuration from the Firebase console. This web configuration is expected to be visible in a browser; never paste service-account JSON, private keys, or payment secrets into the website or GitHub.

The customer app is:
- https://devopsbyghouse.co.in/shopkeeper/app.html

The admin dashboard is:
- https://devopsbyghouse.co.in/shopkeeper/admin.html

## C. Deploy the isolated backend

The Firebase CLI config in this folder is deliberately separate from the repository-root Firebase config. Do not deploy the repository-root config for this task.

Install Node.js 20+ and Firebase CLI on a trusted computer, then from this folder run:

```sh
npm --prefix functions install
firebase login
firebase use --add
firebase deploy --only functions,firestore:rules
```

When prompted to select a project, choose the dedicated Shopkeeper project. Review the rules before confirming deployment. These rules deny direct client-side order creation; the callable Cloud Function validates prices and stock and creates orders transactionally. Do not deploy these rules to a different app's Firestore database.

If you do not have a development computer available, use Google Cloud Shell or ask me to guide you through the console/CLI steps one at a time. A person signed in to the correct Google account must approve the project and deployment prompts.

## D. Create the first admin safely

1. Open the customer app and register your own account using your own email.
2. Sign in once, then find your account UID in Firebase Console → Authentication → Users.
3. A trusted project owner must grant the `shopkeeperAdmin: true` custom claim through the Admin SDK. Never implement this as a public webpage button.

A helper script is provided in `functions/scripts/set-admin-claim.js`. It uses local Application Default Credentials and requires the account UID and project ID to be supplied by the operator. Run it only from a trusted machine/account that is authorized to administer the project.

## E. Test before launch

- Register a test customer and verify sign-in/password reset.
- Add test products from the admin dashboard with accurate prices and stock.
- Place a cash-on-delivery test order and confirm stock is reduced exactly once.
- Try to read another customer's orders and modify product/order records as a non-admin; these actions must be denied.
- Test insufficient stock, inactive products, invalid quantities, and repeated checkout attempts.
- Confirm admin can update order statuses.
- Add privacy, terms, delivery, cancellation/refund and customer support information before accepting public orders.

## Current limitations

- Cash on delivery only; online payment is not configured.
- The superadmin page remains a visual prototype and cannot grant roles or approve stores.
- The website has not been verified end-to-end against a live Firebase project yet.
- A server function currently reserves stock transactionally while creating an order. Cancellation/restock automation, delivery operations, audit logging, App Check enforcement, monitoring, backups and production review remain launch tasks.
