# EPYVRA rebrand report

## Repository baseline

- Untouched source commit: `9a8db8c`
- Permanent tag: `upstream-snapreels-v1.1.9`
- Development branch: `develop/epyvra`
- Android identity migration commit: `e892e27`

## Identifier map

| Original | EPYVRA target | Status |
| --- | --- | --- |
| `com.example` namespace/source package | `com.epyvra.app` | Completed |
| `com.snapreels.devsnaplix` application ID | `com.epyvra.app` | Completed |
| `SnapReelsApplication` | `EpyvraApplication` | Completed |
| `SnapReelsRepository` | `EpyvraRepository` | Completed |
| `SnapReelsViewModel` | `EpyvraViewModel` | Completed |
| `SnapReels` product name | `EPYVRA` | Android completed; web/docs pending |
| `snapreels://` | `epyvra://` | Android completed; web coordination pending |
| old hosted share domain | configurable site URL, default `https://epyvra.com` | In progress |
| new `SNAP-<UID>` referrals | `EPY-<UID>` | Android completed; backend pending |

## Baseline verification

- `npm ci`: passed; npm reported 101 dependency vulnerabilities (3 critical, 30 high, 65 moderate, 3 low).
- `npm run typecheck`: passed.
- `npm run lint`: failed because no ESLint configuration exists and `next lint` opens an interactive setup prompt.
- `npm run build`: exited successfully, but skipped type/lint validation and logged repeated MongoDB connection failures during prerendering.
- Android baseline: blocked before configuration because `plugins-artifacts.gradle.org` could not resolve while fetching the Foojay resolver plugin.

## External inputs still required

See `RELEASE_CHECKLIST.md`. No production credentials have been added.

## Compatibility notes

- EPYVRA intentionally uses a new Android application ID and Play listing; no prior SnapReels app-data migration is required.
- Vendor licensing references must remain unchanged until the upstream vendor authorizes replacements.
- Third-party provider names and logos are not EPYVRA brand residue.
