#!/usr/bin/env bash
#
# Upload locally-built artifacts to prof18/difftray.
#
# Usage:
#   ./scripts/release-upload.sh v0.1.0
#   ./scripts/release-upload.sh v0.1.0 --draft
#   ./scripts/release-upload.sh v0.1.0 dev --draft

set -euo pipefail

cd "$(dirname "$0")/.."

if [[ -t 1 ]]; then
  BOLD=$'\033[1m'; GREEN=$'\033[32m'; RED=$'\033[31m'; RESET=$'\033[0m'
else
  BOLD=''; GREEN=''; RED=''; RESET=''
fi

fail() { printf '%sFAIL %s%s\n' "$RED" "$1" "$RESET"; exit 1; }
ok() { printf '%sOK %s%s\n' "$GREEN" "$1" "$RESET"; }

TAG="${1:-}"
[[ -n "$TAG" ]] || fail "usage: ./scripts/release-upload.sh vX.Y.Z [dev] [--draft]"
shift

CHANNEL="production"
if [[ "${1:-}" == "dev" ]]; then
  CHANNEL="dev"
  shift
fi

VERSION="${TAG#v}"
DIR="release/${VERSION}"
if [[ "$CHANNEL" == "dev" ]]; then
  DIR="${DIR}-dev"
fi

[[ -d "$DIR" ]] || fail "no artifacts at $DIR; run ./scripts/release.sh first"
command -v gh >/dev/null 2>&1 || fail "gh CLI not on PATH"

FILES=()
while IFS= read -r file; do
  FILES+=("$file")
done < <(find "$DIR" -maxdepth 2 -type f \
  \( -name '*.dmg' -o -name '*.zip' -o -name 'latest*.yml' -o -name '*.blockmap' \) | sort)

[[ ${#FILES[@]} -gt 0 ]] || fail "no shippable artifacts found under $DIR"

TITLE="Difftray $TAG"
if [[ "$CHANNEL" == "dev" ]]; then
  TITLE="Difftray Dev $TAG"
fi

printf '%sUploading %d artifact(s) to prof18/difftray @ %s:%s\n' \
  "$BOLD" "${#FILES[@]}" "$TAG" "$RESET"
printf '  %s\n' "${FILES[@]}"

gh release create "$TAG" \
  --repo prof18/difftray \
  --title "$TITLE" \
  --generate-notes \
  "$@" \
  "${FILES[@]}"

ok "release $TAG published"
