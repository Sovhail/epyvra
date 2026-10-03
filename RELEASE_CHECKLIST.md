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

No publish, production deployment, DNS change, or production credential activation is authorized by this checklist.
