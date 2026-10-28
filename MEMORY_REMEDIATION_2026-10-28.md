# Render memory remediation — 2026-10-28

## Incident evidence

Owner-provided Render events report five instance failures on October 24–26:
`Ran out of memory (used over 512MB) while running your code.`
The exact request that caused each failure is not available in those events.

## Changes

- Upload multipart bodies are streamed into unique private temporary directories.
  Only a 4KB signature prefix is read into memory. Files are streamed to Bunny/S3
  or copied to local storage, then temporary data is removed on completion/error.
- Streaming limits count actual received bytes, including requests without a
  Content-Length. File size, MIME signature, admin authentication and demo guards
  remain enforced. Upload parsing and external uploads have time limits.
- One heavy operation per Node process; overlapping uploads/backups return 429
  with Retry-After. The bulk uploader sends one file at a time. No distributed
  lock is claimed for future multi-instance deployments.
- Database JSON exports use a download route with one-document cursor batches,
  backpressure, private/no-store headers and cursor cleanup. The old unbounded
  export action is disabled. Browser imports are limited to 8MB; larger restores
  must use MongoDB tooling. Streamed exports are not transactional snapshots.
- Expired signup limiter entries are removed and the map is capped at 10,000.
- Video proxy upstream requests receive a client-disconnect signal and a
  30-minute ceiling. Denied Bunny responses are cancelled before storage retry.
- Resource logs report operation, phase, byte size, RSS/heap/external memory;
  no filenames, URLs, credentials, request bodies or account identities.

## Verification

- TypeScript: PASS.
- ESLint: PASS, zero errors/warnings.
- Production Next.js build and startup: PASS.
- Core security: 22 PASS; premium media: 6 PASS; streaming/resource tests: 9 PASS.
- A 200MB generated multipart stream passed locally, peak RSS about 116MB
  (about 85MB before upload). This is the isolated staging test process, not
  full production Next.js memory usage or an actual Bunny upload measurement.
- Local production routes: unauthenticated backup GET and upload POST return 401.
- Android lintDebug, testDebugUnitTest and assembleDebug: PASS; 7 unit tests,
  zero failures. Existing Android advisory warnings remain.
- No device attached to adb: physical-device playback testing is pending.

## Deployment and acceptance

These changes are committed locally; no push, production deployment, paid plan
change or credential rotation was performed in this pass. Existing APK API
contracts are unchanged; these backend fixes do not require a new Android APK.

After owner-approved deployment:
1. Save a copy of the latest Render Events/Logs before retention expires.
2. Upload a valid image, subtitle and near-limit video through the admin UI.
   Confirm Bunny objects, series publication and web/Android playback.
3. Confirm overlapping uploads receive 429 and retry works, temporary files are
   cleaned and backup JSON downloads can be parsed.
4. Compare resource_usage logs with Render Memory and Events for at least 24h
   under representative use. Do not claim OOM is resolved until observed.
5. Free MP4/TS playback still uses Render's streaming proxy. Direct signed CDN
   delivery is a separate bandwidth optimization requiring Bunny acceptance
   tests; premium entitlement enforcement was not replaced or relaxed here.

Rollback: revert the two memory-remediation commits and rebuild. Reverting the
upload change restores the previously demonstrated full-buffer memory risk.
