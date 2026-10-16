# Salah Reminder Firebase setup (no-cost plan)

The app uses Firebase email/password sign-in and Cloud Firestore. It does not use phone SMS or Cloud Functions. Keep the Firebase project on the Spark plan and do not link a billing account. Firebase includes no-cost email/password authentication and limited Firestore quotas; if a Spark quota is exceeded, that Firebase product can stop serving requests until its quota resets. See [Firebase pricing plans](https://firebase.google.com/docs/projects/billing/firebase-pricing-plans).

## Before project setup

Firebase Console requires the Google account owner to enable Google 2-Step Verification. Complete it in Google Account security settings. Never share passwords or verification codes.

## Create the project

1. Create a Firebase project named `Salah Reminder`. Analytics is optional; it is not used by this app.
2. Add a Web app. Copy its `apiKey`, `authDomain`, `projectId`, and `appId` values into `salah/firebase-config.js`.
3. In Authentication → Sign-in method, enable **Email/Password**.
4. In Authentication settings → Authorized domains, add `devopsbyghouse.co.in` (and `www.devopsbyghouse.co.in` only if you serve the app on that host).
5. Create a Cloud Firestore database. Deploy the included `firestore.rules` from the repository root, or paste the rules in Firebase Console → Firestore → Rules and Publish.
6. Leave the project on the **Spark** plan. Do not link Cloud Billing. GitHub Pages serves the website; Firebase Hosting is not needed.

## Make your account an admin

1. Publish the site changes and sign in once at `https://devopsbyghouse.co.in/salah/login.html`.
2. In Firebase Console → Authentication → Users, copy your email account's Firebase UID.
3. In Firestore, create `admins/<YOUR_UID>` with a string field `role` set to `admin`.
4. Open `https://devopsbyghouse.co.in/salah/admin.html`. You can review users and recent activity and export CSV files.

Only a project owner should create documents in the `admins` collection. The app rules prohibit users from granting themselves admin access.

## Data, limits, and reminders

The app stores a user's chosen name/email, prayer times, selected tone, and activity such as page opens, reminder activation, and “I’m in” check-ins. Passwords are handled by Firebase Authentication and are not visible to admins. User profiles are private to their owner and admin accounts. Admin exports show up to 500 recent users and 500 recent activity records.

Firestore Security Rules enforce the maximum of three prayer-time changes per UTC calendar month. Initial time entry is free. Page-open audio and reminders work in the app; closed-page web push requires the optional OneSignal + Cloudflare Worker setup in [PUSH-SETUP.md](PUSH-SETUP.md). Background notification delivery follows browser/OS permission, network, and battery settings. It is not a Clock app alarm.

## Publish on GitHub Pages

Commit and push the updated `salah/` files, `firestore.rules`, and `firebase.json` to the `main` branch. GitHub Pages will publish the static app. Publish Firestore rules separately using Firebase Console or Firebase CLI; pushing GitHub files alone does not deploy database rules.
