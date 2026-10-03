# EPYVRA image generation requests

The canonical EPYVRA logo source has not been supplied in this repository. Do not publish generated stand-ins. These requests define the production deliverables to export from the approved EPYVRA identity.

## Canonical logo package

- Master vector: `epyvra-logo.svg`, transparent artboard, RGB, outlined/embedded shapes, no unlicensed fonts or imagery.
- Square mark: 1024 × 1024 PNG, transparent background, centered with at least 12% clear space. Text is not allowed unless it is an inseparable part of the approved mark.
- Horizontal lockup: 2048 × 512 PNG and SVG, transparent background, mark plus approved EPYVRA wordmark.
- Monochrome variants: white and black SVG/PNG for dark/light surfaces.
- Visual direction: premium cinematic short drama, modern and original; no copied Netflix, ReelShort, DramaBox, celebrity, character, or movie-poster elements.

## Android launcher assets

- Adaptive foreground: 1024 × 1024 (1:1) transparent PNG named `ic_launcher_foreground.png`, destination `Android App/app/src/main/res/drawable-nodpi/`; keep critical artwork inside the central 66% safe zone. No background or separate text.
- Adaptive background: 1024 × 1024 (1:1) opaque PNG named `ic_launcher_background.png`, destination `Android App/app/src/main/res/drawable-nodpi/`; approved violet/magenta gradient, no text.
- Legacy icon source: 512 × 512 (1:1) opaque PNG named `epyvra_launcher_master.png`, destination `brand-assets/source/`; generate `ic_launcher.png` and `ic_launcher_round.png` under each `Android App/app/src/main/res/mipmap-*` density directory. No separate text.
- Notification icon: 96 × 96 (1:1) transparent monochrome-white silhouette named `ic_stat_epyvra.png`, destination `Android App/app/src/main/res/drawable-nodpi/`; no gradients or text, at least 10% clear space.

## Android splash and authentication

- Splash mark: 1024 × 1024 (1:1) transparent PNG named `epyvra_splash_logo.png`, destination `Android App/app/src/main/res/drawable-nodpi/`; logo only inside the central 60% safe area, no additional text.
- Splash background: 1440 × 2560 (9:16) opaque WebP named `epyvra_splash_background.webp`, destination `Android App/app/src/main/res/drawable-nodpi/`; subtle cinematic lighting, empty center area, no text, posters, actors, or recognizable copyrighted content.
- Login background: 1440 × 2560 (9:16) opaque WebP named `epyvra_login_background.webp`, destination `Android App/app/src/main/res/drawable-nodpi/`; low visual noise behind form fields, no text or recognizable people.

## Onboarding and empty states

- Three onboarding illustrations: each 1080 × 1080 (1:1) transparent PNG named `onboarding_discover.png`, `onboarding_premium.png`, and `onboarding_rewards.png`, destination `Android App/app/src/main/res/drawable-nodpi/`; subject inside the central 80%, no embedded text.
- Empty states: 1024 × 1024 (1:1) transparent PNG files `empty_watchlist.png`, `empty_offline.png`, and `empty_results.png`, destination `Android App/app/src/main/res/drawable-nodpi/`; consistent line/lighting style, no text.

## Web/PWA exports

- Header/admin logo: 2048 × 512 (4:1) transparent files `epyvra-logo-horizontal.svg` and `epyvra-logo-horizontal.png`, destination `code/public/brand/`; approved mark and wordmark only.
- Favicon source: 512 × 512 (1:1) square mark named `favicon-source.png`, destination `code/public/brand/`; legible at 16 × 16, no separate text.
- PWA icons: opaque `icon-192.png`, `icon-512.png`, and `icon-maskable-512.png`, destination `code/public/icons/`; maskable artwork inside the central 66%, no separate text.
- OpenGraph default: 1200 × 630 (1.91:1) opaque JPEG named `opengraph-default.jpg`, destination `code/public/brand/`; approved logo and abstract cinematic background, brand text permitted, no catalog/movie artwork, 60 px edge safe area.
- Generic promotion: 1920 × 1080 (16:9) and 1080 × 1920 (9:16) opaque WebP files `promo-landscape.webp` and `promo-portrait.webp`, destination `code/public/brand/`; charcoal with restrained violet/magenta/pink light, no text or recognizable people, central 70% safe area.

All final assets require owner approval and must be checked for transparency, safe zones, small-size legibility, RTL-neutral composition, and licensing before replacing current files.
