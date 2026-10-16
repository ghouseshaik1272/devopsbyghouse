# Background push reminders

This optional setup uses OneSignal Web Push and a Cloudflare Worker with D1. The website stays on GitHub Pages. The Worker stores only Firebase UID, five prayer times, IANA time zone, selected tone, and reminder/check-in delivery state. The OneSignal API key stays in Cloudflare Worker secrets. Firebase ID tokens are verified before the Worker accepts a user's settings.

Both services have free plans with usage limits; this is not a lifetime price guarantee. Cloudflare's free Workers plan allows 100,000 requests per day and 5 Cron Triggers per account. D1 currently includes daily read/write quotas. If quotas are exceeded, reminders may pause until the quota resets. Check the current limits before inviting a large audience.

## Configure OneSignal

1. Create a OneSignal account and a **Web Push** app for `https://devopsbyghouse.co.in`.
2. Choose the Custom Code setup, and enter the site origin. Use HTTPS and the exact domain above.
3. Copy the OneSignal **App ID** into `salah/push-config.js` as `oneSignalAppId`.
4. In OneSignal, create a REST API key. Add it to the Worker as a secret named `ONESIGNAL_API_KEY`; never place this key in the website files.

The OneSignal SDK worker is served at `https://devopsbyghouse.co.in/salah/onesignal/OneSignalSDKWorker.js`.

## Deploy the scheduler

1. Install Wrangler and sign in to your Cloudflare account.
2. From `salah/push-worker`, create a D1 database named `salah-reminders`. Put the returned database ID into `wrangler.toml`.
3. Apply `schema.sql` to the new D1 database.
4. Add Worker secrets named `FIREBASE_PROJECT_ID`, `ONESIGNAL_APP_ID`, and `ONESIGNAL_API_KEY`. Use the same Firebase project ID and OneSignal App ID as the website. These are Worker secrets; do not commit them.
5. Deploy the Worker. Its URL will look like `https://salah-reminder-push.<your-account>.workers.dev`.
6. Set `schedulerUrl` in `salah/push-config.js` to that URL, then publish the website files.

The Worker runs once a minute and sends 15-, 5-, 1-minute, and exact-time notifications in each user's device time zone. “I’m in” records a check-in and suppresses any remaining reminders for that prayer that day. The Worker also retries temporary send failures up to three times.

## Device behavior

Users must allow browser notifications. On iPhone/iPad, add the site to the Home Screen before enabling push. Browser notifications use the device's notification sound and settings; web pages cannot force a custom sound or override Do Not Disturb, battery restrictions, or notification permission. This does not create an entry in the phone's Clock app.

The app's current tone preview still plays while the page is open. A custom tone for closed-page notifications is not supported consistently by web push.
