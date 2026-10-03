# EPYVRA production setup guide

This guide intentionally uses placeholders. Do not commit production credentials. EPYVRA must not be released until every Critical and High security gate in `SECURITY_AUDIT.md` is closed and the build checklist passes.

## 1. Domain and DNS

1. Register or control `epyvra.com` and decide the canonical web origin, normally `https://epyvra.com`.
2. Point DNS only after the VPS is prepared and explicit production-deployment approval is given.
3. Issue a trusted TLS certificate, force HTTPS, and redirect the alternate `www` hostname consistently.
4. Set `<EPYVRA_PUBLIC_URL>` wherever the installer or Admin requests the site URL.
5. Publish `https://epyvra.com/.well-known/assetlinks.json` using the final Play signing certificate SHA-256 fingerprint before enabling verified Android App Links.

## 2. VPS

Use a supported Ubuntu LTS host with a non-root deployment account, firewall rules allowing only SSH/HTTP/HTTPS, automatic security updates, Node.js matching the repository engine requirements, PM2 or a systemd unit, Nginx, and encrypted backups. Upload the repository to `<APP_DIRECTORY>`, run the supplied installer only after reviewing its variables, and never paste secrets into shell history. Do not deploy from a working tree with uncommitted changes.

## 3. MongoDB

Run MongoDB as a replica set because monetary operations require transactions. The installer generates `<MONGO_APP_PASSWORD>` and creates an application user with `readWrite` only on `<MONGO_DATABASE>`. Store the resulting URI in a root-readable runtime environment file, restrict MongoDB to loopback/private networking, enable authentication, rotate the installer bootstrap credential, and test transaction rollback and concurrent reward claims before release.

## 4. Bunny.net and storage

Create a dedicated EPYVRA storage zone and pull zone. Configure `<BUNNY_STORAGE_ZONE>`, `<BUNNY_STORAGE_HOST>`, `<BUNNY_ACCESS_KEY>`, and `<BUNNY_PULL_ZONE_URL>` only in server-side settings. Add exact required hosts to `EPYVRA_REMOTE_FETCH_HOSTS`. Enable Bunny Token Authentication on the pull zone and set its token key as the server-only `BUNNY_CDN_TOKEN_KEY`; set `BUNNY_CDN_HOST` to the hostname only. Keep `PREMIUM_MEDIA_TOKEN_TTL_SECONDS` between 30 and 600 seconds and keep IP binding enabled unless its mobile-network tradeoff is explicitly accepted. Premium HLS/DASH assets must use a unique directory containing the immutable episode ID, for example `/premium/<episode-id>/master.m3u8`; sharing directories between episodes is rejected. The API emits Bunny path tokens, so master manifests, variants, and relative segments retain the same short-lived directory authorization without proxying video bytes through Next.js. Disable anonymous/origin bypasses and verify that unsigned direct manifest and segment requests return 401/403 at the CDN before release. Verify uploads, deletes, subtitles, range requests, HLS segments, DASH segments, token expiry, and cache invalidation.

## 5. Firebase

Create a fresh Firebase project and Android app with package `com.epyvra.app`. Add SHA-1 and SHA-256 fingerprints for the final release certificate, download the real `google-services.json` into `Android App/app/` without committing it, configure the web app values in the runtime environment/Admin, and store the Admin service-account JSON only on the backend. Enable only intended authentication providers and configure their authorized domains and OAuth redirects. Test token revocation and UID ownership failures.

## 6. OneSignal

Create a fresh OneSignal application. Configure `<ONESIGNAL_APP_ID>` in the Android/runtime configuration and keep `<ONESIGNAL_REST_API_KEY>` server-only. Connect the Firebase Cloud Messaging credentials, use Firebase UID as the authenticated external user ID, and test opt-in, logout identity removal, Arabic notifications, deep links, and token refresh.

## 7. Google Play Console

Create the new application `com.epyvra.app`, enable Play App Signing, register the final certificate fingerprints with Firebase and Digital Asset Links, configure license testers, and create a least-privilege Play Developer API service account. Set server-only `<GOOGLE_PLAY_SERVICE_ACCOUNT_EMAIL>`, `<GOOGLE_PLAY_PRIVATE_KEY>`, and package/product configuration. Never use client purchase status as credit authority.

## 8. Billing products

Create each consumable coin product and any subscription/VIP product in Play Console. In Admin, map each exact `<PLAY_PRODUCT_ID>` to an authorized server-side coin quantity or entitlement; do not derive coins from client price or client-supplied amount. Test purchase, pending, cancel, error, retry, restart reconciliation, consume/acknowledge, duplicate token, wrong UID, refund, revoke, and void. Configure authenticated RTDN/Pub/Sub processing before production monetization.

## 9. LevelPlay

Create a LevelPlay application for `com.epyvra.app`, configure mediation networks and placements, and begin in test mode. Supply `LEVELPLAY_APP_KEY`, a random `LEVELPLAY_S2S_PRIVATE_KEY` of at least 32 characters, and configured reward quantities through the deployment secret store. Configure the HTTPS S2S callback and verify invalid signature, stale timestamp, wrong user/app, missing event ID, and replay all fail without credit. Do not add production network credentials to Git.

## 10. Release keystore

Generate and back up an EPYVRA release keystore outside the repository. Provide `<RELEASE_STORE_FILE>`, `<RELEASE_STORE_PASSWORD>`, `<RELEASE_KEY_ALIAS>`, and `<RELEASE_KEY_PASSWORD>` only through the approved local/CI secret mechanism. The release build intentionally fails when any input is missing and must never fall back to the debug key.

## 11. Privacy Policy

Publish an owner-reviewed policy at `<PRIVACY_POLICY_URL>` covering accounts, analytics, advertising, purchases, notifications, storage, deletion, children/age rules, retention, processors, and contact details. Configure the URL in Admin and Play Console and verify it opens in English and Arabic.

## 12. Terms

Publish owner-reviewed terms at `<TERMS_URL>` covering digital goods, coins, premium access, refunds, acceptable use, content licensing, account termination, and governing law. Do not reuse template legal text without legal review.

## 13. Support identity

Create `<SUPPORT_EMAIL>` on the production domain, configure SPF/DKIM/DMARC and SMTP credentials, update Admin/site/Play listing references, and test delivery without exposing SMTP secrets to browser settings.

## 14. Play Store release

Replace every placeholder asset listed in `IMAGE_GENERATION_REQUESTS.md` with owner-approved EPYVRA artwork. Complete Data safety, content rating, ads, app access, privacy, and account-deletion declarations. Run clean Android unit tests, lint, debug and release builds; backend clean install, tests, TypeScript, ESLint and production build; device tests for English/Arabic, RTL, streaming, billing, ads, auth, notifications, and deep links. Upload first to internal testing. Production publishing requires explicit owner approval.

## Required runtime secrets and placeholders

- `ADMIN_SESSION_SECRET=<32+ random characters>`
- `INSTALL_SETUP_TOKEN=<one-time 32+ random characters>`; remove after installation
- `MONGODB_URI=<least-privilege replica-set URI>`
- `EPYVRA_REMOTE_FETCH_HOSTS=<comma-separated exact hosts>`
- `FIREBASE_SERVICE_ACCOUNT_JSON=<server-only JSON>`
- `NEXT_PUBLIC_FIREBASE_*` values for the fresh web application
- `ONESIGNAL_APP_ID=<owner supplied>` and server-only API credential
- `GOOGLE_PLAY_SERVICE_ACCOUNT_EMAIL=<owner supplied>`
- `GOOGLE_PLAY_PRIVATE_KEY=<owner supplied>`
- `LEVELPLAY_APP_KEY=<owner supplied>`
- `LEVELPLAY_S2S_PRIVATE_KEY=<owner supplied random secret>`
- storage, SMTP, CAPTCHA, and enabled payment-provider secrets

After configuration, perform a secret scan of the working tree and Git history and keep the scan evidence with the release record.
