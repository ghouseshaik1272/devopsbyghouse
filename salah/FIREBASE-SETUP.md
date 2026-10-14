# Configure live phone OTP

1. Create a Firebase project and add a Web app.
2. In Firebase Console, enable Authentication > Sign-in method > Phone.
3. In Authentication settings, authorize the domain serving this site (for example `devopsbyghouse.co.in` and the GitHub Pages domain used during preview).
4. Set the SMS region policy to the countries you serve.
5. Copy the Web app config values from Project settings into `salah/firebase-config.js`.
6. Firebase phone verification SMS requires the pay-as-you-go (Blaze) plan and is billed per destination. Review current pricing and test with Firebase fictional phone numbers before inviting users.

The browser Firebase config is public by design. Never place a Firebase Admin SDK service-account key or other private secret in HTML or GitHub Pages. Firebase phone sign-in also needs an authorized HTTPS domain and reCAPTCHA.

The three-change monthly allowance is currently kept in each browser's local storage. It is a user-interface limit, not server-enforced; users can reset it or use another device. Secure enforcement and cross-device sync require a database/backend.

