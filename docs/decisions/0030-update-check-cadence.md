# 0030 Update Check Cadence

Date: 2026-06-08

## Status

Accepted

## Context

Difftray already checks for app updates through `electron-updater` in production
builds shortly after launch. Users who leave the app open for days would not
receive another automatic check until restarting the app.

## Decision

Production builds should keep the launch check and then check for updates every
24 hours while the app remains open. Manual checks should be available from the
review toolbar and the native menu bar, and should reuse the same updater
scheduler so multiple triggers do not overlap network requests.

The renderer can request a manual check through a narrow preload IPC API. The
main process remains responsible for loading and driving `electron-updater`.

## Consequences

- Long-running app sessions can discover new releases without requiring a
  restart.
- Users can explicitly check for updates while reviewing a file or from the
  menu bar.
- Update behavior remains disabled in non-production variants.
- The updater feed continues to be the GitHub Releases feed documented in the
  release packaging decision.
