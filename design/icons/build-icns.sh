#!/usr/bin/env bash
#
# build-icns.sh — turn icon.iconset/ into icon.icns and a Windows icon.ico.
#
# Run this on macOS (iconutil is a built-in Apple tool, no install needed).
# .ico generation uses ImageMagick if available; otherwise it's skipped.

set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$HERE"

if [ ! -d icon.iconset ]; then
  echo "❌ icon.iconset/ not found next to this script." >&2
  exit 1
fi

# --- macOS .icns ----------------------------------------------------------
echo "→ Building icon.icns from icon.iconset/ …"
iconutil --convert icns --output icon.icns icon.iconset
echo "✓ icon.icns"

# --- Linux 512px PNG (already produced by the design pipeline) -----------
if [ -f icon-512.png ]; then
  echo "✓ icon-512.png (Linux)"
fi

# --- Windows .ico (optional, requires ImageMagick) ------------------------
if command -v magick >/dev/null 2>&1; then
  echo "→ Building icon.ico (Windows) …"
  magick \
    icon.iconset/icon_16x16.png \
    icon.iconset/icon_32x32.png \
    icon.iconset/icon_128x128.png \
    icon.iconset/icon_256x256.png \
    icon.iconset/icon_512x512.png \
    icon.ico
  echo "✓ icon.ico"
elif command -v convert >/dev/null 2>&1; then
  echo "→ Building icon.ico (Windows, legacy convert) …"
  convert \
    icon.iconset/icon_16x16.png \
    icon.iconset/icon_32x32.png \
    icon.iconset/icon_128x128.png \
    icon.iconset/icon_256x256.png \
    icon.iconset/icon_512x512.png \
    icon.ico
  echo "✓ icon.ico"
else
  echo "ℹ ImageMagick not found — skipping icon.ico."
  echo "  Install with:  brew install imagemagick   (then re-run this script)"
fi

echo
echo "Done. Drop the files into your electron-builder config:"
echo "  mac:   icon.icns"
echo "  win:   icon.ico"
echo "  linux: icon-512.png"
