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
| `SnapReels` product name | `EPYVRA` | Android, web, admin, server runtime, and installer completed; historical/vendor documentation classified below |
| `snapreels://` | `epyvra://` | Android and web runtime completed |
| old hosted share domain | configurable site URL, default `https://epyvra.com` | In progress |
| new `SNAP-<UID>` referrals | `EPY-<UID>` | Android and backend defaults completed |

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

## Visual system

- Web and Android use deep near-black/charcoal surfaces with violet primary and magenta/pink accent lighting; gold remains reserved for coin/premium affordances.
- The approved logo source is not present. Existing image files have not been presented as final EPYVRA artwork. Exact export requests and destinations are in `IMAGE_GENERATION_REQUESTS.md`.
- English remains the source locale. Arabic retains its human translation, uses the canonical `EPYVRA` brand name, and Android continues to opt into RTL layout direction.

## Residue classification (2026-10-03)

The repository-wide scan used `SnapReels`, `snapreels`, `SNAP-`, `com.snapreels`, `devsnaplix`, `snapreels://`, `gadohost`, legacy Play/domain/email strings, and logo references.

| Location/pattern | Classification | Justification/action |
| --- | --- | --- |
| `changelog.txt` historical SnapReels names, package, scheme, cache, referral, and domains | DOCUMENTATION | Immutable upstream release history describing behavior before the EPYVRA fork; not runtime configuration. |
| `REBRAND_REPORT.md`, `SECURITY_AUDIT.md`, and regression-test negative strings | DOCUMENTATION | Audit evidence must name the removed identifiers and prove old schemes/passwords are rejected. |
| `Documontation/*.html` SnapReels setup prose | UNRESOLVED | Bundled upstream manuals require a separate editorial rewrite and replacement screenshots; they must not be shipped as EPYVRA owner documentation. Use `EPYVRA_SETUP_GUIDE.md` for this branch. |
| `Documontation/*.html` and image filenames containing GadoHost | VENDOR-REQUIRED / DOCUMENTATION | GadoHost is a third-party hosting vendor described by the upstream manuals, not the EPYVRA brand. |
| `DEVSNAPLIX_API_URL`, DevSnaplix license copy, and `devsnaplix-api.gadohost.com` | VENDOR-REQUIRED | Upstream license-verification mechanism. Renaming/removing it without vendor authorization could bypass or break licensing. URL fetching remains SSRF-constrained. |
| `tiksnap.pro` mentioned in the release checklist | VENDOR-REQUIRED / UNRESOLVED | Requires owner/vendor confirmation before removal or replacement. |
| `upstream-snapreels-v1.1.9` Git tag | LEGACY-COMPATIBILITY | Permanent clean-upstream snapshot explicitly required by the owner. |
| Current legacy logo/image files | UNRESOLVED | Must be replaced only with the separately approved logo-derived exports listed in `IMAGE_GENERATION_REQUESTS.md`; do not claim them as EPYVRA release assets. |

There are no unexplained legacy occurrences in active Android/web product identity. Unresolved documentation and artwork remain release blockers and are explicitly listed in `RELEASE_CHECKLIST.md`.
