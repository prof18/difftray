#!/usr/bin/env bash
#
# Provision a Developer ID Application certificate for Difftray and import it
# into the login keychain so codesign/electron-builder can find it.
#
# Usage:
#   ./scripts/setup-signing.sh prepare
#   ./scripts/setup-signing.sh install /path/to/downloaded.cer [--keep-files]

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

WORK_DIR="${HOME}/.difftray-signing"

usage() {
  cat <<EOF
Usage:
  $0 prepare
  $0 install <path-to-downloaded.cer> [--keep-files]
EOF
  exit 1
}

[[ $# -ge 1 ]] || usage
PHASE="$1"
shift || true

cmd_prepare() {
  command -v asc >/dev/null 2>&1 || fail "asc CLI not on PATH"

  mkdir -p "$WORK_DIR"
  chmod 700 "$WORK_DIR"

  local ts key csr
  ts=$(date +%Y%m%d-%H%M%S)
  key="$WORK_DIR/devid-${ts}.key"
  csr="$WORK_DIR/devid-${ts}.csr"

  stage "generate key and CSR"
  asc certificates csr generate \
    --common-name "Difftray Developer ID" \
    --organization "Marco Gomiero" \
    --key-out "$key" \
    --csr-out "$csr" \
    --force \
    >/dev/null
  chmod 600 "$key"
  ok "key: $key"
  ok "csr: $csr"

  stage "next steps"
  cat <<EOF
1. Open:
     https://developer.apple.com/account/resources/certificates/add

2. Choose:
     Software -> Developer ID Application
     Profile Type -> G2 Sub-CA

3. Upload:
     $csr

4. Download the .cer, then run:
     $0 install ~/Downloads/developerID_application.cer
EOF
}

cmd_install() {
  local cer_arg="${1:-}"
  shift || true
  [[ -n "$cer_arg" ]] || usage
  [[ -f "$cer_arg" ]] || fail "cer file not found: $cer_arg"

  local keep_files=0
  if [[ "${1:-}" == "--keep-files" ]]; then
    keep_files=1
  fi

  command -v openssl >/dev/null 2>&1 || fail "openssl not on PATH"
  command -v security >/dev/null 2>&1 || fail "security not on PATH"

  [[ -d "$WORK_DIR" ]] || fail "no $WORK_DIR; run prepare first"

  local key
  key=$(ls -t "$WORK_DIR"/devid-*.key 2>/dev/null | head -1 || true)
  [[ -n "$key" ]] || fail "no devid-*.key in $WORK_DIR; run prepare first"
  ok "using key: $key"

  local ts cer pem p12 p12_pass subject cn login_kc identities team csc
  ts="${key##*devid-}"
  ts="${ts%.key}"
  cer="$WORK_DIR/devid-${ts}.cer"
  pem="$WORK_DIR/devid-${ts}.pem"
  p12="$WORK_DIR/devid-${ts}.p12"

  cp "$cer_arg" "$cer"

  stage "inspect cert"
  openssl x509 -inform DER -in "$cer" -noout -subject -issuer -dates | sed 's/^/  /'
  subject=$(openssl x509 -inform DER -in "$cer" -noout -subject)
  case "$subject" in
    *"Developer ID Application"*) ok "cert subject looks right" ;;
    *) fail "unexpected cert subject: $subject" ;;
  esac

  cn=$(openssl x509 -inform DER -in "$cer" -noout -subject -nameopt RFC2253 \
    | sed -nE 's/.*CN=([^,]+),.*/\1/p')

  stage "bundle p12"
  openssl x509 -inform DER -in "$cer" -out "$pem"
  p12_pass=$(openssl rand -hex 16)
  openssl pkcs12 -legacy -export \
    -inkey "$key" \
    -in "$pem" \
    -name "$cn" \
    -out "$p12" \
    -passout "pass:$p12_pass"
  chmod 600 "$p12"
  ok "p12: $p12"

  stage "import into login keychain"
  login_kc="${HOME}/Library/Keychains/login.keychain-db"
  [[ -f "$login_kc" ]] || login_kc="${HOME}/Library/Keychains/login.keychain"
  security import "$p12" \
    -k "$login_kc" \
    -P "$p12_pass" \
    -T /usr/bin/codesign \
    -T /usr/bin/security \
    -T /usr/bin/productsign \
    >/dev/null
  ok "imported into $login_kc"
  warn "if Keychain Access shows a dialog, choose Always Allow"

  stage "verify"
  identities=$(security find-identity -p codesigning -v "$login_kc")
  printf '%s\n' "$identities" | sed 's/^/  /'
  if ! printf '%s' "$identities" | grep -q "$cn"; then
    fail "expected identity not visible after import: $cn"
  fi
  ok "signing identity present: $cn"

  if [[ $keep_files -eq 0 ]]; then
    rm -f "$key" "$cer" "$pem" "$WORK_DIR/devid-${ts}.csr"
    ok "cleaned loose key/csr/cer/pem files; kept $p12"
  fi

  team=$(printf '%s' "$cn" | sed -nE 's/.*\(([A-Z0-9]+)\)$/\1/p')
  csc=$(printf '%s' "$cn" | sed -E 's/^Developer ID Application: //')

  stage "release env"
  cat <<EOF
export APPLE_ID="<your-apple-id@example>"
export APPLE_APP_SPECIFIC_PASSWORD="xxxx-xxxx-xxxx-xxxx"
export APPLE_TEAM_ID="$team"
export CSC_NAME="$csc"
./scripts/release.sh mac
EOF
}

case "$PHASE" in
  prepare) cmd_prepare ;;
  install) cmd_install "$@" ;;
  *) usage ;;
esac
