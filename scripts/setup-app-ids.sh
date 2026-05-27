#!/usr/bin/env bash
#
# Create or verify the App Store Connect bundle IDs used for notarized macOS
# builds.

set -euo pipefail

cd "$(dirname "$0")/.."

if [[ -t 1 ]]; then
  BOLD=$'\033[1m'; GREEN=$'\033[32m'; RED=$'\033[31m'; RESET=$'\033[0m'
else
  BOLD=''; GREEN=''; RED=''; RESET=''
fi

stage() { printf '\n%s== %s ==%s\n' "$BOLD" "$1" "$RESET"; }
ok() { printf '%sOK %s%s\n' "$GREEN" "$1" "$RESET"; }
fail() { printf '%sFAIL %s%s\n' "$RED" "$1" "$RESET"; exit 1; }

command -v asc >/dev/null 2>&1 || fail "asc CLI not on PATH"

find_bundle_id() {
  local identifier="$1"

  asc bundle-ids list --paginate --output json | node -e '
const fs = require("node:fs");
const identifier = process.argv[1];
const payload = JSON.parse(fs.readFileSync(0, "utf8"));
const match = (payload.data ?? []).find((item) => item.attributes?.identifier === identifier);
if (match) {
  process.stdout.write(match.id);
}
' "$identifier"
}

ensure_bundle_id() {
  local identifier="$1"
  local name="$2"
  local existing

  existing="$(find_bundle_id "$identifier")"
  if [[ -n "$existing" ]]; then
    ok "$identifier exists ($existing)"
    return
  fi

  stage "create $identifier"
  asc bundle-ids create \
    --identifier "$identifier" \
    --name "$name" \
    --platform MAC_OS \
    --output json \
    --pretty
}

stage "asc doctor"
asc doctor

stage "bundle IDs"
ensure_bundle_id "com.prof18.difftray" "Difftray"
ensure_bundle_id "com.prof18.difftray.dev" "Difftray Dev"
