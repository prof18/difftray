#!/usr/bin/env bash
#
# Local release build. Runs the full project gate, then builds distributables.
#
# Usage:
#   ./scripts/release.sh mac
#   ./scripts/release.sh mac dev
#   SKIP_CI=1 ./scripts/release.sh mac
#
# Required env for signed mac builds:
#   APPLE_KEYCHAIN_PROFILE
#   CSC_NAME

set -euo pipefail

cd "$(dirname "$0")/.."

if [[ -t 1 ]]; then
  BOLD=$'\033[1m'; GREEN=$'\033[32m'; RED=$'\033[31m'; YELLOW=$'\033[33m'; RESET=$'\033[0m'
else
  BOLD=''; GREEN=''; RED=''; YELLOW=''; RESET=''
fi

stage() { printf '\n%s== %s ==%s\n' "$BOLD" "$1" "$RESET"; }
ok() { printf '%sOK %s%s\n' "$GREEN" "$1" "$RESET"; }
warn() { printf '%sWARN %s%s\n' "$YELLOW" "$1" "$RESET"; }
fail() { printf '%sFAIL %s%s\n' "$RED" "$1" "$RESET"; exit 1; }

TARGET="${1:-mac}"
CHANNEL="${2:-production}"

case "$TARGET" in
  mac) ;;
  *) fail "unknown target '$TARGET' (expected: mac)" ;;
esac

case "$CHANNEL" in
  production|dev) ;;
  *) fail "unknown channel '$CHANNEL' (expected: production | dev)" ;;
esac

export DIFFTRAY_RELEASE_CHANNEL="$CHANNEL"

VERSION=$(node -p "require('./package.json').version")
RELEASE_DIR="release/${VERSION}"
if [[ "$CHANNEL" == "dev" ]]; then
  RELEASE_DIR="${RELEASE_DIR}-dev"
fi

if [[ "${SKIP_CI:-0}" == "1" ]]; then
  warn "skipping ci.sh (SKIP_CI=1)"
else
  stage "ci.sh"
  ./ci.sh
  ok "quality gate passed"
fi

stage "build"
pnpm build
ok "vite bundles built"

build_mac() {
  stage "preflight mac"

  for var in APPLE_KEYCHAIN_PROFILE CSC_NAME; do
    if [[ -z "${!var:-}" ]]; then
      fail "$var is not set"
    fi
  done

  if [[ "$CSC_NAME" == "Developer ID Application:"* ]]; then
    fail "CSC_NAME must omit the 'Developer ID Application:' prefix"
  fi

  if ! security find-identity -p codesigning -v 2>/dev/null | grep -q "Developer ID Application: $CSC_NAME"; then
    fail "Developer ID Application identity not found in keychain for: $CSC_NAME"
  fi

  ok "signing identity present"
  # Force electron-builder to use notarytool's Keychain profile. Its Apple ID
  # credential mode forwards the app-specific password as a process argument,
  # where process inspection can expose it.
  unset APPLE_ID APPLE_APP_SPECIFIC_PASSWORD APPLE_TEAM_ID
  stage "electron-builder mac arm64+x64 ($CHANNEL)"
  pnpm exec electron-builder --config electron-builder.config.cjs --mac --publish never
  ok "electron-builder finished"

  local app_name="Difftray"
  if [[ "$CHANNEL" == "dev" ]]; then
    app_name="Difftray Dev"
  fi

  for arch_dir in mac-arm64 mac; do
    local app_path="${RELEASE_DIR}/${arch_dir}/${app_name}.app"
    if [[ -d "$app_path" ]]; then
      stage "gatekeeper assess ($arch_dir)"
      if spctl --assess --type execute --verbose "$app_path" 2>&1 | tee /tmp/difftray-spctl.log | grep -q "accepted"; then
        ok "$(tr '\n' ' ' < /tmp/difftray-spctl.log)"
      else
        warn "spctl did not return accepted for $arch_dir; inspect /tmp/difftray-spctl.log"
      fi
    fi
  done
}

case "$TARGET" in
  mac) build_mac ;;
esac

stage "artifacts ($RELEASE_DIR)"
if [[ -d "$RELEASE_DIR" ]]; then
  find "$RELEASE_DIR" -maxdepth 2 -type f \
    \( -name '*.dmg' -o -name '*.zip' -o -name 'latest*.yml' -o -name '*.blockmap' \) \
    -print | sort
fi

printf '\n%sRelease build complete%s (target=%s, channel=%s, version=%s)\n' \
  "$GREEN" "$RESET" "$TARGET" "$CHANNEL" "$VERSION"
printf 'Next: ./scripts/release-upload.sh v%s\n' "$VERSION"
