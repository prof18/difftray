# Difftray — Website Assets

Drop the favicon files in this folder into your site's `public/` (or `static/`) root, then paste the snippet below into your HTML `<head>`.

## Files

```
website-assets/
├── favicons/
│   ├── favicon.svg                    ← modern browsers (scales to any size)
│   ├── favicon-16x16.png
│   ├── favicon-32x32.png
│   ├── favicon-48x48.png
│   ├── favicon-96x96.png
│   ├── apple-touch-icon.png           (180×180, iOS home screen)
│   ├── android-chrome-192x192.png     (Android home screen)
│   ├── android-chrome-512x512.png     (Android splash)
│   └── site.webmanifest               (PWA manifest)
└── logo/
    ├── logo.svg                       ← customizable (flat colors, CSS vars)
    ├── logo-mark.svg                  ← customizable, no tile (bars only)
    ├── logo-gradient.svg              ← matches the macOS app icon exactly
    ├── logo-1024.png
    ├── logo-512.png
    └── logo-256.png
```

## HTML — paste into `<head>`

```html
<link rel="icon" type="image/svg+xml" href="/favicon.svg" />
<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png" />
<link rel="icon" type="image/png" sizes="16x16" href="/favicon-16x16.png" />
<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />
<link rel="manifest" href="/site.webmanifest" />
<meta name="theme-color" content="#353f82" />
```

If you serve assets from a subpath (e.g. `/static/`), prefix every `href` accordingly.

## Customizing the logo

`logo.svg` and `logo-mark.svg` use CSS custom properties for every color. Override them in your stylesheet to retheme without touching the SVG:

```css
.difftray-logo {
  --tile: #1c1c20; /* deep ink instead of indigo */
  --add: #5dc28a;
  --del: #f0555a;
  --neutral: #d4d0c2;
}

.difftray-mark {
  --add: currentColor; /* inherit page text color */
  --del: currentColor;
  --neutral: currentColor;
  --dot: var(--page-bg);
}
```

Inline-embed the SVG (don't use `<img>`) if you want CSS to reach inside it:

```html
<!-- React / JSX: import as a component, or… -->
<!-- Plain HTML: paste the SVG inline -->
<div class="difftray-logo" style="width:96px;height:96px">
  <!-- contents of logo.svg here -->
</div>
```

> Loading via `<img src="logo.svg">` works but external CSS won't reach the custom properties inside the SVG. Inline the markup, or use a build step / component framework that embeds the SVG.

## Optional — `.ico` (legacy IE / Windows shortcuts)

Modern browsers don't need `favicon.ico`. If you want one anyway:

```sh
brew install imagemagick   # if not installed
magick \
  favicons/favicon-16x16.png \
  favicons/favicon-32x32.png \
  favicons/favicon-48x48.png \
  favicons/favicon.ico
```

Then add to `<head>`: `<link rel="icon" type="image/x-icon" href="/favicon.ico">`.

## Color reference

| Token   | Hex       | Used for                        |
| ------- | --------- | ------------------------------- |
| Tile    | `#353f82` | indigo background (theme color) |
| Add     | `#2eb564` | addition bar                    |
| Del     | `#ee5258` | deletion bar                    |
| Neutral | `#ddd9c8` | pending bar                     |
| Dot     | `#ffffff` | review dot on add bar           |

(These are the flat-color values used in `logo.svg`. The gradient variant in `logo-gradient.svg` uses the same two-stop gradients as the app icon — see `icon-export/README.md` for the gradient stops.)
