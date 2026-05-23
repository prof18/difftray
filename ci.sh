#!/usr/bin/env bash
set -euo pipefail

pnpm format
pnpm lint
pnpm typecheck
pnpm test
pnpm test:visual
