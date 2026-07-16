# Release

Difftray uses `electron-builder` for local release builds. Production builds use
`com.prof18.difftray`; dev/debug builds use `com.prof18.difftray.dev` and the
`Difftray Dev` product name so a debug app installs side by side instead of
replacing the production build. Both variants intentionally use the same
`Difftray` user-data directory.

The App Store Connect bundle IDs have been created under team `Q7CUB3RNAK`:

- `com.prof18.difftray`: `64V6W55ZG6`
- `com.prof18.difftray.dev`: `2DL3Z5R624`

Run `pnpm release:setup-app-ids` to verify or recreate the bundle IDs on a new
account. It uses `asc bundle-ids`.

## Local Build

```sh
pnpm package:mac
pnpm package:mac:dev
```

Release scripts run the full gate first:

```sh
pnpm release:mac
pnpm release:dev:mac
```

macOS release builds require:

```sh
export APPLE_KEYCHAIN_PROFILE="difftray-notarization"
export CSC_NAME="Marco Gomiero (Q7CUB3RNAK)"
```

Create the notarization profile once. Omitting `--password` makes `notarytool`
prompt securely instead of placing the app-specific password in shell history or
the process arguments:

```sh
xcrun notarytool store-credentials difftray-notarization \
  --apple-id "<apple-id@example>" \
  --team-id "Q7CUB3RNAK"
```

`CSC_NAME` is the common-name portion only. Do not include the
`Developer ID Application:` prefix.

## Signing

Use `pnpm release:setup-signing -- prepare` to generate a Developer ID CSR. After
creating the certificate in the Apple Developer portal, import it with:

```sh
pnpm release:setup-signing -- install ~/Downloads/developerID_application.cer
```

Artifacts are written to `release/<version>/` for production and
`release/<version>-dev/` for dev/debug builds.

macOS produces both `arm64` and `x64` `.dmg` + `.zip` files; the dmg name
encodes the architecture (`Difftray-arm64.dmg`, `Difftray-x64.dmg`). Linux and
Windows are not supported targets.

## Upload

Uploads target the source repo `prof18/difftray` — the same repo hosts both
the open-source code and the GitHub Releases that `electron-updater` reads
from. The repo must be public for `electron-updater` to fetch
`latest-mac.yml` and the `.zip` artifacts (the in-app updater authenticates
anonymously).

Production builds check this feed shortly after launch, every 24 hours while the
app remains open, and whenever the user presses the review toolbar update check
button.

```sh
./scripts/release-upload.sh v0.1.0
./scripts/release-upload.sh v0.1.0 --draft
./scripts/release-upload.sh v0.1.0 dev --draft
```

Use the script directly for uploads. With pnpm script argument forwarding, the
`--` separator can be passed through to `release-upload.sh` as the tag value.

After publishing, update the GitHub release notes from the matching
`CHANGELOG.md` entry instead of leaving only the generated compare link:

```sh
gh release edit v0.1.0 --repo prof18/difftray --notes-file <release-notes.md>
```

## Landing Page

The static landing page publishes from `site/` through the `Deploy landing page`
GitHub Actions workflow. GitHub Pages must be enabled with the GitHub Actions
publishing source and the custom domain `difftray.app`.

Cloudflare DNS should contain these records for GitHub Pages:

- `A @ 185.199.108.153`
- `A @ 185.199.109.153`
- `A @ 185.199.110.153`
- `A @ 185.199.111.153`
- `AAAA @ 2606:50c0:8000::153`
- `AAAA @ 2606:50c0:8001::153`
- `AAAA @ 2606:50c0:8002::153`
- `AAAA @ 2606:50c0:8003::153`
- `CNAME www prof18.github.io`

Keep the GitHub Pages records DNS-only in Cloudflare while GitHub provisions the
certificate. After the certificate is issued, enable HTTPS enforcement in the
repository Pages settings.
