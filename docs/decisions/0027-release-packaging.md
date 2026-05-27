# Decision 0027: Release Packaging

## Status

Accepted.

## Context

Difftray needs local release scripts and distributable Electron bundles before
the first public release. The project should stay local-first and should not add
a CI release runner or network-backed app behavior yet. CueUp uses a local
`electron-builder` release flow that signs, notarizes, and uploads artifacts to
a public GitHub Releases page. Difftray follows the same flow but publishes
into its own source repository rather than a separate release-only repo —
since Difftray is open source, the source repo doubles as the user-facing
download page and the `electron-updater` feed source.

Debug builds also need to avoid colliding with production app identity and local
state.

## Decision

Use `electron-builder` from the workspace root for packaging. Production builds
use app id `com.prof18.difftray` and product name `Difftray`. Dev/debug builds
set `DIFFTRAY_RELEASE_CHANNEL=dev`, use app id `com.prof18.difftray.dev`, product
name `Difftray Dev`, and write artifacts to `release/<version>-dev/`.

Release builds remain local. `scripts/release.sh` runs the full local gate,
builds Vite bundles, then calls `electron-builder`. `scripts/release-upload.sh`
uploads artifacts to the source repo `prof18/difftray` as a GitHub Release;
`electron-updater` in the packaged app reads `latest-mac.yml` from the same
releases. `scripts/setup-app-ids.sh` documents and verifies the App Store
Connect bundle IDs through `asc`.

The app also resolves a runtime variant in the main process so Windows can use
the dev app model id when needed. Both production and dev variants use the same
`Difftray` user-data directory; the separate dev identity exists to prevent
accidentally replacing the production build, not to isolate local data.

## Consequences

- Production and dev/debug builds can be installed side by side.
- Production and dev/debug builds share local Difftray data.
- macOS releases depend on the local Developer ID certificate and notarization
  environment, mirroring CueUp.
- Releases are published to the source repo (`prof18/difftray`). The repo must
  be public for `electron-updater` to fetch `latest-mac.yml` and the `.zip`
  artifacts anonymously. Changing the publish target requires updating the
  builder config, upload script, and this decision — and would orphan
  installed clients still pointing at the previous target.
- macOS ships both `arm64` and `x64` `.dmg` + `.zip` artifacts from the arm64
  build host (electron-builder cross-packages x64; signing/notarization covers
  both). Doubling artifacts is preferred to a universal binary so download
  size stays per-arch.
- Linux and Windows are not supported targets. Linux was dropped because the
  maintainer doesn't run Linux and can't smoke-test an AppImage built from the
  macOS host before shipping it. Reintroducing Linux means adding back the
  `linux` block in the builder config plus a `build_linux` path in
  `scripts/release.sh`, and ideally running the build inside a Linux container
  so it can be exercised before publishing.
