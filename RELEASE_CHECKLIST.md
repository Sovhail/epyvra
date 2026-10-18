# EPYVRA production release checklist

## Owner-supplied items

- [ ] Approved EPYVRA SVG/high-resolution logo package and derived assets from `IMAGE_GENERATION_REQUESTS.md`.
- [ ] Production domain, API base URL, DNS/TLS access, privacy URL, terms URL, support URL, and update URL.
- [ ] Firebase project for `com.epyvra.app`, Android `google-services.json`, web config, Admin service account, enabled auth providers, OAuth client, SHA-1/SHA-256, and FCM setup.
- [ ] OneSignal App ID/API key and authenticated external-user-ID strategy.
- [ ] Google Play application, exact product IDs/types/base plans/offers, license testers, and Play Developer API service account.
- [ ] Google Play RTDN Pub/Sub topic/subscription and authenticated webhook or reconciliation worker for cancellations, refunds, voided purchases, and delayed state transitions.
- [ ] Release keystore path, alias, passwords, and certificate fingerprints.
- [ ] LevelPlay app key, rewarded/interstitial placements, test mode, mediation network credentials, and consent configuration.
- [ ] `LEVELPLAY_APP_KEY`, `LEVELPLAY_S2S_PRIVATE_KEY` (at least 32 random characters), and `LEVELPLAY_REWARD_COINS`; configure the HTTPS callback with timestamp, eventId, userId, rewards, signature, and appKey parameters.
- [ ] Bunny.net or alternate storage credentials and delivery/security policy.
- [ ] Bunny pull-zone hostname and an independent token-authentication key (`BUNNY_CDN_HOST`, `BUNNY_CDN_TOKEN_KEY`); enable **Advanced Token Authentication** (HMAC-SHA256) and Token IP Validation—not legacy/basic token mode—block origin bypass, and store every premium episode in its own episode-ID directory.
- [ ] SMTP/support identity, payment gateway credentials, CAPTCHA keys, and optional AI keys for enabled services.
- [ ] `ADMIN_SESSION_SECRET`: an independently generated secret of at least 32 random characters, supplied only to the backend runtime.
- [ ] `INSTALL_SETUP_TOKEN`: a one-time random value of at least 32 characters; remove it from the runtime environment after installation.
- [ ] `EPYVRA_REMOTE_FETCH_HOSTS`: comma-separated exact hostnames for license verification, remote video/CDN delivery, and configured storage endpoints; include every legitimate redirect target.
- [ ] Vendor confirmation for retained DevSnaplix licensing endpoints and the `tiksnap.pro` reference.

## Security gates

- [ ] All Critical and High findings in `SECURITY_AUDIT.md` are closed or explicitly owner-accepted with rationale.
- [ ] Every user-scoped API requires a valid Firebase bearer token and enforces UID ownership.
- [ ] Coins, rewards, referrals, unlocks, and purchases use atomic/idempotent server-side operations.
- [ ] MongoDB runs as a replica set; transactional coin/reward concurrency and rollback tests pass against the release topology.
- [ ] Firestore clients cannot write balances, VIP state, ledgers, ad counts, or entitlements.
- [ ] Admin/install routes and server actions verify a cryptographic session/setup token.
- [ ] Browser-facing settings are redacted; server secrets never enter client component props.
- [ ] SSRF, private-address, redirect, traversal, and premium-stream authorization tests pass.
- [ ] No static production passwords or excessive MongoDB roles remain.
- [ ] Secret scan covers the final tree and Git history.

## Build/release gates

- [ ] Android unit tests, lint, debug build, and a genuinely release-signed build pass.
- [ ] Release build fails closed when signing credentials are absent and never uses a debug key.
- [ ] Backend clean install, ESLint, TypeScript, production build, and startup pass without ignored errors.
- [ ] Billing purchase token, pending, cancellation, acknowledgement, consumption, reconciliation, replay, refund, and restore tests pass.
- [ ] LevelPlay official reward callback and server anti-replay tests pass; existing providers remain configurable.
- [ ] Firebase email/Google/phone auth and OneSignal notification flows pass.
- [ ] HLS, subtitles, Shorts, premium unlocks, Bunny/storage providers, Arabic and RTL regressions pass.
- [ ] `epyvra://` and verified `https://epyvra.com/share/...` links pass; `assetlinks.json` matches the release certificate.
- [ ] Final repository-wide brand residue is classified and documented in `REBRAND_REPORT.md`.

## Current verification snapshot (2026-10-17)

- [x] Security regression suites: 22 core tests and 4 premium-media tests passed.
- [x] Backend TypeScript: passed with zero errors.
- [x] Full ESLint: passed with zero errors and zero warnings; no rules were disabled.
- [x] Next.js production build: passed.
- [x] Android unit tests, lint gate, and debug APK build: passed.
- [x] Android release signing guard: passed; `bundleRelease` stopped because signing inputs were absent and did not fall back to the debug key.
- [ ] Release bundle: blocked until the owner supplies the production keystore and signing values.
- [x] Android Firebase base runtime: Firebase app `com.epyvra.app` was created and its ignored local `Android App/app/google-services.json` was validated by `processDebugGoogleServices`.
- [ ] Firebase Google Sign-In: debug SHA-1/SHA-256 are registered, but Google provider/Web OAuth client and release certificate hashes remain blocked. Email/password Firebase Auth is configured; Google login now fails closed until explicitly enabled.
- [ ] Android production configuration: the APK now has a generated catalog API key, but the matching value must be saved to the production Atlas `settings.mobile` document. OneSignal and production ad IDs also remain owner/vendor inputs.
- [x] Android API base URL points to `https://epyvra.com/api/mobile/v1`.
- [x] Production dependency audit reduced from 106 findings (3 critical, 32 high) to 7 findings (0 critical, 6 high, 1 moderate).
- [ ] Remaining dependency advisories require coordinated Tailwind 3 to 4 and Next 15 to 16 migrations; they are tracked in `RC_AUDIT_2026-10-17.md` and were not hidden or suppressed.
- [x] Storage configuration is server-allowlisted, upload size is server-capped, Bunny connection probes clean up test objects, and upload/delete security regressions pass.
- [x] PWA manifests use local EPYVRA icons and contain no remote placeholder artwork.
- [x] CODE VERIFIED / AUTOMATED TEST VERIFIED: premium HLS/DASH issuance requires Firebase entitlement, emits short-lived episode-directory Bunny path tokens, defaults to IP binding, redacts permanent premium URLs, and preserves relative manifest/segment authorization.
- [ ] SANDBOX VERIFIED / PRODUCTION CREDENTIAL REQUIRED: configure Bunny Token Authentication with the same server-side key and prove unsigned direct master/variant/DASH manifest, `.ts`, and `.m4s` requests fail while signed playback succeeds and expires. CDN/origin enforcement is not claimed without this evidence.
- [ ] LevelPlay, Play Billing, OneSignal, Firebase, Bunny.net, and deep-link lifecycle require device/vendor-console tests with owner-supplied sandbox configuration.
- [ ] Rewrite or exclude the upstream `Documontation/*.html` manuals and replace all legacy artwork before distribution.

No publish, production deployment, DNS change, or production credential activation is authorized by this checklist.
