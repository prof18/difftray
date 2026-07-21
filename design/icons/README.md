# Difftray — App Icon Source

Source assets for Difftray's macOS app icon (**Stacked Hunks** on the
**Indigo Brand** tile). The actual build inputs live at `resources/` in the
repo root; this folder is the regeneration source.

## Contents

```
design/icons/
├── icon.svg          ← master source (1024×1024, baked squircle)
├── icon-dev.svg      ← dev-channel variant with a visible DEV badge
├── icon.iconset/     ← Apple iconset (10 PNGs) consumed by iconutil
└── build-icns.sh     ← turns icon.iconset/ into icon.icns
```

## Regenerating `resources/icon.icns`

```sh
cd design/icons
./build-icns.sh
cp icon.icns ../../resources/icon.icns
cp icon.iconset/icon_512x512.png ../../resources/icon.png
cp icon.svg ../../resources/icon.svg
```

`iconutil` is a built-in Apple tool — nothing to install. `resources/icon.png`
is the runtime Dock icon used by the dev override in
`apps/desktop/src/main/index.ts` (the packaged `.app` reads the `.icns` from
its bundle).

If `icon.svg` itself needs to change, the iconset PNGs must be re-rasterized
out of band (this folder does not include an SVG-to-PNG pipeline). After
re-rasterizing into `icon.iconset/`, re-run `build-icns.sh`.

The packaged dev channel uses `resources/icon-dev.icns`. Regenerate it from
`icon-dev.svg` at the same standard macOS iconset sizes whenever the dev source
changes.

## Color reference

| Token       | Hex / RGBA               | Used for                        |
| ----------- | ------------------------ | ------------------------------- |
| Tile top    | `#3e4a92`                | indigo background, gradient top |
| Tile bot    | `#2c3672`                | indigo background, gradient bot |
| Highlight   | `rgba(255,255,255,0.10)` | 2px inner top highlight         |
| Add top     | `#3ad373`                | addition bar (top)              |
| Add bot     | `#28a456`                | addition bar (bottom)           |
| Del top     | `#ff6f73`                | deletion bar (top)              |
| Del bot     | `#e34a4f`                | deletion bar (bottom)           |
| Neutral top | `#e8e6dc`                | pending bar (top)               |
| Neutral bot | `#cfccbe`                | pending bar (bottom)            |
| Review dot  | `rgba(255,255,255,0.95)` | dot on add bar                  |

Bar corner radius `40px` (≈ 3.9% of 1024). Tile corner radius `229px`
(22.37%, standard macOS squircle approximation).

## Notes

- The `.icns` has a defined background (indigo) and intentionally does not
  opt into macOS 26's tinted/clear/dark icon treatments — system tinting is
  not applied.
- Windows `.ico` and Linux `AppImage` icons are deliberately unsupported;
  `build-icns.sh` retains the `magick`-based `.ico` branch for completeness
  but the Difftray build does not consume it.
