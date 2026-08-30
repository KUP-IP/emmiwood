# Emmiwood brand system

The operator-provided logo sheet is the brand source of truth. All letterforms in shipped assets are deterministic crops or resizes of that sheet; do not redraw or regenerate them.

## Repository masters and reusable exports

| Asset | Size | Intended use |
| --- | ---: | --- |
| `source/ewb-approved-source-sheet.png` | 1536×1024 | Approved source sheet; immutable brand reference |
| `masters/ewb-horizontal-master.png` | 1250×420 | Lossless horizontal lockup crop |
| `masters/ewb-app-icon-source-crop-390.png` | 390×390 | Exact approved square-mark crop |
| `masters/ewb-app-icon-master-1536.png` | 1536×1536 | Deterministic high-resolution square master |
| `exports/ewb-app-icon-1024.png` | 1024×1024 | General app-store/source export |
| `exports/ewb-banner-1600x500.webp` | 1600×500 | Wide campaign banner |
| `exports/ewb-social-avatar-1080.png` | 1080×1080 | Social profile export |
| `exports/ewb-monogram-round-512.png` | 512×512 | Round monogram alternative |

`rejected/ewb-generated-app-icon-master-1536.png` is retained only as provenance for the replaced generated reconstruction. It must never be used to create runtime assets.

## Public runtime assets

Only assets required by the running site live in `client/public/emmiwood/brand/`:

- `ewb-horizontal-header.webp` — site lockup.
- `ewb-app-icon-192.png`, `ewb-app-icon-512.png` — PWA icons and compact brand mark.
- `ewb-maskable-512.png` — safely padded maskable PWA icon.
- `ewb-apple-touch-icon-180.png` — Apple touch icon.
- `ewb-favicon-16.png`, `ewb-favicon-32.png`, `ewb-favicon-48.png`, `favicon.ico` — browser icons.
- `ewb-social-og-1200x630.png` — link preview.
- `manifest.webmanifest` — install metadata.

## Derivative recipe

The approved square mark is cropped from the source sheet at `390x390+568+550`. The horizontal master is the approved top lockup crop. Resize with a high-quality Lanczos filter; never substitute a font or an AI-generated glyph.
