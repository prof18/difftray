#!/usr/bin/env bash
set -euo pipefail

export pnpm_config_verify_deps_before_run=false

pnpm format
pnpm lint
pnpm typecheck
pnpm test
pnpm --filter @difftray/companion-diff-surface test:browser
pnpm test:visual
