# GLab

GLab is planned for `https://devopsbyghouse.co.in/GLab/`. The main DevOps by Ghouse page links here. This folder contains the landing page, email/password account flow, member workspace, admin grants, mentoring chat, and the dedicated GLab Firebase configuration.

## Account and access model

- Registration uses name, email address, password, and an optional learning note. Users verify their email before account approval or lab access. Firebase Authentication handles passwords; GLab never stores them in Firestore.
- New accounts start pending with no lab or chat permissions. The administrator approves or suspends accounts, selects individual labs, and grants mentoring chat in `admin.html`.
- Firestore rules enforce the administrator-only access changes and check lab/chat grants. The first `glabAdmins/<Firebase UID>` document must be created out of band by the project owner with `role: "admin"`.
- An administrator can create a one-time Firebase password-reset link for an account. The link is shown only in the admin page and must be sent privately to that account's owner.
- Chat recipients only see names of active members whom the administrator has enabled for chat. Emails and learning notes remain private to the account owner and administrators. GLab administrators can access mentoring messages for moderation and support.

## Set up the separate GLab Firebase project

1. Create a new Firebase project for GLab. Do not reuse the Salah Reminder project or its user accounts.
2. Add a web app and copy its public web-app configuration into `firebase-config.js`.
3. Enable Email/Password in Authentication. Add `devopsbyghouse.co.in` to authorized domains. Require email verification, use a strong password policy, and enable abuse protections.
4. Create Firestore and deploy `GLab/firestore.rules` using `GLab/firebase.json` and this project. Do not replace the root site's existing Salah Reminder rules.
5. Register Ghouse's email once. In Authentication, copy that account UID; in Firestore, create `glabAdmins/<UID>` with a string `role` field set to `admin`. In `glabUsers/<UID>`, approve the account, assign all eight labs, and enable chat. Update the matching `glabMembers/<UID>` entry to active with chat enabled.
6. Deploy the password-reset callable function from this folder. Firebase Functions deployment requires a billing-enabled Firebase project. Review expected usage and billing before enabling it.
7. Configure the trusted execution service before enabling code runs. It must verify Firebase ID tokens, check the account and lab grant on every request, and execute untrusted code in isolated, disposable containers with time, CPU, memory, filesystem, and network limits. Linux needs a separate interactive terminal service; SQL needs an isolated database runner.
8. Add the contact numbers once Ghouse provides them.

## Current integration status

GitHub Pages can publish these browser files. Email/password sign-in, Firestore accounts, admin grants, mentoring chat, and admin-started reset links become active after the dedicated Firebase project is configured and deployed. The code runner is intentionally not connected until a secure execution service is available. The Linux terminal and compiler output are not live in this static preview.
