# EPYVRA security audit

Status: remediation in progress. Production release is prohibited while Critical or High findings remain open.

| ID | Severity | Finding | Status |
| --- | --- | --- | --- |
| SCR-001 | Critical | Unauthenticated user creation accepts caller-controlled UID/coins | Implemented: Firebase UID and server bonus are authoritative; negative tests pending |
| SCR-002 | Critical | Extractable mobile API key is treated as user authorization | Implemented for UID-scoped/mobile monetary APIs with Firebase Admin token verification and UID binding; negative tests pending |
| SCR-003 | Critical | Reward/ad claims lack trustworthy proof and atomic anti-replay | Partially remediated: transactional idempotency and timed one-use challenges added; unverified ad rewards fail closed; LevelPlay verification pending |
| SCR-004 | Critical | Firestore rules permit client entitlement/balance writes | Remediated: monetary, entitlement, purchase, profile and settings writes fail closed |
| SCR-005 | Critical | Sensitive settings can be returned to browser clients without consistent redaction | Open |
| SCR-006 | Critical | Admin/install authorization is incomplete | Open |
| SCR-007 | Critical | Video signing/proxy permits SSRF/open-proxy behavior | Open |
| SCR-008 | Critical | Purchase crediting lacks authenticated binding, uniqueness, and atomicity | Open |
| SCR-009 | High | HLS/DASH premium delivery can be accessed by URL possession | Open |
| SCR-010 | High | Billing uses order ID instead of purchase token and lacks lifecycle handling | Open |
| SCR-011 | High | Payment WebView success/navigation validation is weak | Open |
| SCR-012 | High | Release signing can silently fall back to debug key | Open |
| SCR-013 | High | Android cleartext/mixed-content WebView exposure | Partially mitigated: manifest cleartext disabled |
| SCR-014 | High | VPS installer ships static overprivileged MongoDB credentials | Open |
| SCR-015 | High | Next build suppresses TypeScript/ESLint failures | Open |

Every remediation must include negative authorization tests, replay/race tests where applicable, and evidence in this document before closure.

## Verification evidence

- `npm run test:security`: 6/6 security regression checks pass (identity binding, server-owned signup balance, transaction/idempotency structure, one-use reward challenge, legacy mutation gate, Firestore entitlement protection).
- `npm run typecheck`: passes after the authentication and coin-operation changes.
- Changed security modules and routes pass targeted ESLint.
- Runtime concurrency tests remain required against a MongoDB replica set before SCR-003 can be closed.
