# EPYVRA security audit

Status: remediation in progress. Production release is prohibited while Critical or High findings remain open.

| ID | Severity | Finding | Status |
| --- | --- | --- | --- |
| SCR-001 | Critical | Unauthenticated user creation accepts caller-controlled UID/coins | Implemented: Firebase UID and server bonus are authoritative; negative tests pending |
| SCR-002 | Critical | Extractable mobile API key is treated as user authorization | Implemented for UID-scoped/mobile monetary APIs with Firebase Admin token verification and UID binding; negative tests pending |
| SCR-003 | Critical | Reward/ad claims lack trustworthy proof and atomic anti-replay | Core flow remediated: transactional idempotency, unverified providers fail closed, LevelPlay official reward callback plus signed S2S event verification and unique atomic credit; dashboard/device/runtime replay tests pending |
| SCR-004 | Critical | Firestore rules permit client entitlement/balance writes | Remediated: monetary, entitlement, purchase, profile and settings writes fail closed |
| SCR-005 | Critical | Sensitive settings can be returned to browser clients without consistent redaction | Remediated in code: explicit public projections, server-only raw access, and cryptographically verified admin sessions; deployment secret/runtime negative tests pending |
| SCR-006 | Critical | Admin/install authorization is incomplete | Remediated in code: signed expiring admin sessions with server-side revocation and one-time install token gates; runtime negative tests pending |
| SCR-007 | Critical | Video signing/proxy permits SSRF/open-proxy behavior | Remediated in code: HTTP(S)-only exact-host allowlist, public DNS/IP validation, redirect revalidation, and reserved/private range blocking; runtime rebinding/redirect tests pending |
| SCR-008 | Critical | Purchase crediting lacks authenticated binding, uniqueness, and atomicity | Core flow remediated: Firebase UID binding, purchaseToken verification, obfuscated account binding, atomic unique grant, server consume/acknowledgement, pending handling, and client reconciliation; RTDN/voided-purchase production reconciliation tests pending |
| SCR-009 | High | HLS/DASH premium delivery can be accessed by URL possession | Open |
| SCR-010 | High | Billing uses order ID instead of purchase token and lacks lifecycle handling | Remediated in code: purchaseToken, pending/cancel/error states, resume reconciliation, and server consume/acknowledgement implemented; device tests pending |
| SCR-011 | High | Payment WebView success/navigation validation is weak | Open |
| SCR-012 | High | Release signing can silently fall back to debug key | Remediated in code: release tasks fail closed unless all explicit signing inputs and keystore are present; no debug fallback |
| SCR-013 | High | Android cleartext/mixed-content WebView exposure | Remediated in code: manifest cleartext disabled; checkout and video WebViews reject mixed content and local file/content access; checkout entry URL requires HTTPS |
| SCR-014 | High | VPS installer ships static overprivileged MongoDB credentials | Remediated in code: generated or operator-supplied secret, root-only persistence, app-database `readWrite` role, replica set, and protected application environment file; fresh-host test pending |
| SCR-015 | High | Next build suppresses TypeScript/ESLint failures | Open |

Every remediation must include negative authorization tests, replay/race tests where applicable, and evidence in this document before closure.

## Verification evidence

- `npm run test:security`: 16/16 security regression checks pass, covering identity/UID binding, transactional monetary operations, Firestore entitlements, secret projections, admin/install authorization, SSRF/storage targets, Play Billing, Android release/WebView policy, installer least privilege, and LevelPlay S2S replay protection.
- `npm run typecheck`: passes after the authentication and coin-operation changes.
- Changed security modules and routes pass targeted ESLint.
- Runtime concurrency tests remain required against a MongoDB replica set before SCR-003 can be closed.
