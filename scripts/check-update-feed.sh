#!/usr/bin/env bash
#
# Verify a release directory's latest-mac.yml before upload.
#
# electron-updater installs from the .zip entries in latest-mac.yml. A DMG-only
# electron-builder rerun (the usual recovery when only the DMG step fails)
# rewrites the file with DMG entries alone, which silently breaks auto-update
# for every installed copy.
#
# Usage: ./scripts/check-update-feed.sh release/0.1.0

set -euo pipefail

DIR="${1:-}"
[[ -d "$DIR" ]] || { echo "usage: $0 <release directory>" >&2; exit 64; }

YML="$DIR/latest-mac.yml"
[[ -f "$YML" ]] || { echo "check-update-feed: missing $YML" >&2; exit 1; }

urls=()
while IFS= read -r url; do
  urls+=("$url")
done < <(sed -n 's/^[[:space:]]*-[[:space:]]*url:[[:space:]]*//p' "$YML")

fail() { echo "check-update-feed: $1" >&2; exit 1; }

has_x64_zip=false
has_arm64_zip=false
for url in ${urls[@]+"${urls[@]}"}; do
  [[ -f "$DIR/$url" ]] || fail "$YML lists $url, which is not in $DIR"
  case "$url" in
    *-arm64-mac.zip) has_arm64_zip=true ;;
    *-mac.zip) has_x64_zip=true ;;
  esac
done

[[ "$has_x64_zip" == true ]] || fail "$YML has no x64 -mac.zip entry; auto-update would break. Regenerate it with all zips and DMGs."
[[ "$has_arm64_zip" == true ]] || fail "$YML has no -arm64-mac.zip entry; auto-update would break. Regenerate it with all zips and DMGs."

echo "latest-mac.yml lists ${#urls[@]} artifact(s), including both zips"
