# Release

Difftray uses `electron-builder` for local release builds. Production builds use
`com.prof18.difftray`; Alpha builds use `com.prof18.difftray.dev` and the
`Difftray Alpha` product name so they install side by side instead of replacing
the production build. Production uses the `Difftray` user-data directory; Alpha
uses the distinct `Difftray Dev` directory. On first packaged Alpha launch,
Difftray imports a sanitized copy of the production database: review data and
preferences are retained, while companion devices and companion credentials are
removed. Use the explicit import option to replace an existing Alpha database;
Difftray preserves the previous Alpha database as a backup.

The Alpha build keeps app id `com.prof18.difftray.dev` and the `Difftray Dev`
data folder so its companion identity and phone pairings survive the rename.
Unpackaged `pnpm dev` runs are the Dev flavour.

The App Store Connect bundle IDs have been created under team `Q7CUB3RNAK`:

- `com.prof18.difftray`: `64V6W55ZG6`
- `com.prof18.difftray.dev`: `2DL3Z5R624`

Run `pnpm release:setup-app-ids` to verify or recreate the bundle IDs on a new
account. It uses `asc bundle-ids`.

## Local Build

The packaged app includes the Node-free CLI at
`Contents/Resources/bin/difftray`; the agent skill at
`integrations/agents/difftray` uses that path through its resolver. Before a
release, run `pnpm --filter @difftray/desktop test:agent-package` to check the
copied plugin package and resolver fixtures, and
`pnpm --filter @difftray/desktop test:cli:bundle` to check the temporary bundled
CLI. These local checks do not install plugins, exercise agent accounts, or
validate a signed release. Confirm agent-host sessions separately during the
final user validation pass. General Settings offers an optional terminal
command installation; the agent skill does not depend on it.

The full gate runs bounded CLI process acceptance after visual tests with
`test:cli:e2e --skip-build`, reusing its built outputs. This exercises actual
fixture processes and shared review storage; it is distinct from the heavier
`test:cli:bundle` archive check above. The process harness has a global ten-minute
deadline and cleans up only its owned fixture profiles and processes.

M6 acceptance and coordinated handoff remain pending. Before declaring release
compatibility, the user still needs actual Codex/Claude/Pi host sessions and
signed arm64 and x64 archive checks; optional Antigravity remains unverified.
Fixture checks do not authorize publication. Uploading archives, publishing the
agent package, or installing it into a user's host requires an explicit request.

```sh
pnpm package:mac
pnpm package:mac:alpha
```

Release scripts run the full gate first:

```sh
pnpm release:mac
pnpm release:alpha:mac
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
`release/<version>-alpha/` for Alpha builds.

macOS produces both `arm64` and `x64` `.dmg` + `.zip` files; the dmg name
encodes the architecture (`Difftray-arm64.dmg`, `Difftray-x64.dmg`). Linux and
Windows are not supported targets.

## Rebuilding only the DMGs

If `release:mac` fails only at the DMG step (for example `hdiutil` reports
`Resource busy` because a wedged `simdiskimaged` blocks every detach; a reboot
clears it), the signed, notarized apps and the zips are already in
`release/<version>/`. Rebuild just the DMGs from them:

```sh
pnpm exec electron-builder --config electron-builder.config.cjs --mac dmg --arm64 \
  --prepackaged release/<version>/mac-arm64/Difftray.app --publish never
pnpm exec electron-builder --config electron-builder.config.cjs --mac dmg --x64 \
  --prepackaged release/<version>/mac/Difftray.app --publish never
```

Each run rewrites `release/<version>/latest-mac.yml` with only its DMG entry. Rebuild
the file with all four artifacts (both `-mac.zip` entries first, `path` set to the x64
zip) in the format of the previous release's `latest-mac.yml`. The upload script runs
`scripts/check-update-feed.sh` and refuses a feed without both zips.

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
./scripts/release-upload.sh v0.1.0 alpha --draft
```

The alpha form reads artifacts from `release/0.1.0-alpha` and publishes them
under the distinct GitHub tag `v0.1.0-alpha`; production uses `v0.1.0`. This
allows both channels to publish the same base version without competing for one
GitHub tag.

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
