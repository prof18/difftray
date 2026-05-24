# Decision 0021: Installed Editor Presets

## Status

Accepted

## Context

The first settings UI exposed editor launch as only `System default` or
`Custom command`. That is safe, but it makes the common path feel generic and asks
users to know command-line launch templates before they can pick an editor they
already use.

Difftray should keep editor launching structured and shell-free while making the
selection feel like choosing a local app.

## Decision

Difftray discovers common installed editor apps in the Electron main process and
exposes them through a typed preload API. On macOS, discovery scans local
application directories and returns only known editor presets that are present.
The renderer presents those presets with app icons, plus `System default` and
`Custom command`.

Selecting a preset does not introduce a new persisted editor ID. It writes the
existing `editor_launch_config_json` command/args shape, using `open` with
structured arguments. The app also sends an exact argument array over IPC so
preset arguments do not need to be re-parsed from display text.

## Consequences

Positive:

- The settings UI can show friendly installed app choices without giving the
  renderer filesystem access.
- Presets reuse the existing editor launch path and storage model.
- Custom command support remains available for unsupported editors.

Negative:

- Preset discovery is intentionally conservative and platform-specific at first.
- Some editors may still need custom command configuration for precise line or
  column jumps.
