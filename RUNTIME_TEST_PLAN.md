# EPYVRA monetization runtime test plan

Use only Play license-test accounts, LevelPlay test mode, isolated Firebase users, and a disposable MongoDB replica-set database. Capture client logs, HTTP correlation data, `purchases`, `coin-operations`, and `coin-transactions` records for each case. Never mark a case passed without executing it against the named sandbox.

Evidence labels: **CODE VERIFIED**, **AUTOMATED TEST VERIFIED**, **SANDBOX VERIFIED**, **REAL DEVICE VERIFIED**, and **PRODUCTION CREDENTIAL REQUIRED**.

## Google Play Billing

| Case | Action | Expected client state | Expected server state | Expected ledger entry | Expected balance |
| --- | --- | --- | --- | --- | --- |
| Buy coin pack | Purchase configured consumable with a Play license tester. | Purchased state is sent with `purchaseToken`; UI waits for server verification, then refreshes. | Token verified for `com.epyvra.app`, configured product and obfuscated UID; one purchase record; token consumed. | Exactly one `purchase` credit using the server pack quantity. | Previous balance plus configured quantity once. |
| Pending payment | Use a delayed/pending test instrument. | Pending message; no success display and reconciliation remains enabled. | No grant and no ledger write while Play reports pending. | None. | Unchanged. |
| Cancellation | Cancel Play purchase sheet. | Cancelled state; retry remains available. | No purchase/grant mutation. | None. | Unchanged. |
| Invalid purchase | Submit malformed or Play-invalid token through the authenticated test API. | Generic verification failure. | Request rejected; no purchase record. | None. | Unchanged. |
| Repeated token | Resubmit a successfully processed token for the same UID. | Idempotent already-processed response. | Existing purchase returned; no second grant; finalization may retry. | Original entry only. | Unchanged by retry. |
| Kill after payment | Kill app after Play completes but before confirmation, then restart. | Owned-purchase reconciliation submits the token and eventually displays refreshed balance. | One verified atomic grant and finalization. | Exactly one entry. | Credited once. |
| Server unavailable | Interrupt backend during verification, then restore and retry/restart. | No local credit; recoverable error/pending state. | No partial grant, or committed grant remains idempotently discoverable if response was lost. | Zero or exactly one according to committed transaction. | Zero or one credit, never duplicate. |
| Consumption | Complete consumable purchase and inspect Play/DB state. | Item can be purchased again only after successful consumption. | `finalizationState=complete`; retry worker can finish a previously pending consume. | One entry per unique purchase token. | One credit per unique token. |
| Duplicate callback/request | Send concurrent verification requests for one token. | Both calls converge on one result. | Unique token key and Mongo transaction permit one winner. | Exactly one entry. | Credited once. |
| Wrong UID | Submit another tester account’s token while authenticated as a different UID. | Verification rejected. | Obfuscated account mismatch or prior-token owner mismatch; no mutation. | None for attacker. | Both balances unchanged by attack. |
| Refund/revocation | Refund/void in Play Console and deliver authenticated RTDN, then reconcile. | Entitlement/balance policy outcome is surfaced on refresh. | RTDN event recorded idempotently; VIP revoked or compensating coin action applied according to owner policy. | One auditable reversal/adjustment if policy requires. | Matches documented refund policy, never silently re-credited. |

Release evidence required: Play Console product screenshots/IDs, device/build version, tester identity hash, timestamps, sanitized request outcomes, before/after database records, and RTDN message ID. RTDN/refund handling remains **PRODUCTION CREDENTIAL REQUIRED** until the Pub/Sub sandbox is configured.

## LevelPlay rewarded ads

| Case | Action | Expected client state | Expected server state | Expected ledger entry | Expected balance |
| --- | --- | --- | --- | --- | --- |
| SDK initialization | Launch signed test build with LevelPlay test app key and authenticated UID. | Initialization callback succeeds once; ad controls remain disabled until ready. | No reward request. | None. | Unchanged. |
| Rewarded load/show/completion | Load and show a test rewarded ad; watch through official reward callback. | Repeated taps disabled; completion waits for verified S2S reward and refreshes balance. | Valid signed callback maps hashed user, configured amount, fresh timestamp and unique event. | Exactly one `ad_reward`. | Increased once by configured reward. |
| Close early | Close before the official reward callback. | No success or coin animation. | No accepted S2S event. | None. | Unchanged. |
| No-fill/load failure | Force no-fill or use test failure condition. | Recoverable unavailable state; no reward claim. | No monetary mutation. | None. | Unchanged. |
| Network loss | Disconnect before/during show and restore. | Error/dismissal handled; UI does not synthesize reward. | Only a later valid S2S event may grant. | Zero or one for a verified event. | Unchanged unless verified callback arrives. |
| Repeated tapping | Tap reward control rapidly while loading/showing. | One show attempt; control locked until terminal callback. | At most one vendor event accepted. | At most one entry. | At most one reward. |
| Callback replay | Replay identical valid callback/event ID. | No client-visible duplicate reward. | Unique `levelplay:<eventId>` operation rejects duplicate atomically. | Original only. | Unchanged by replay. |
| Invalid signature | Alter signature or signed field. | No reward. | HTTP 403; no mutation. | None. | Unchanged. |
| Expired callback | Send correctly signed callback outside five-minute window. | No reward. | HTTP 403 `Expired callback`; no mutation. | None. | Unchanged. |
| Wrong user | Use unknown or mismatched hashed user ID. | No reward. | Transaction aborts because user mapping is absent/disabled. | None. | Unchanged. |
| Duplicate event ID | Use an existing event ID with otherwise valid fields. | No duplicate UI credit. | Unique operation/ledger IDs converge idempotently. | Original only. | Unchanged by duplicate. |

Release evidence required: LevelPlay dashboard test-device configuration, SDK initialization/load/show/reward/dismiss logs, sanitized S2S requests/responses, and before/after database records. These cases remain **PRODUCTION CREDENTIAL REQUIRED** or **SANDBOX VERIFIED** only after owner-supplied console configuration is available.

## Firebase, OneSignal, and Bunny/CDN

- Firebase: real-device sign-in, revoked-token rejection, UID mismatch, logout/cache clearing, and English/Arabic auth flows require the fresh EPYVRA project.
- OneSignal: consent, authenticated external UID association/removal, token refresh, foreground/background delivery, Arabic content, and deep links require the fresh EPYVRA application.
- Bunny/CDN: signed premium master/variant/DASH/segment access, expiry, tamper, wrong episode, and shared URL behavior require a test pull zone and token-auth key. Free media must remain accessible according to catalog policy.
