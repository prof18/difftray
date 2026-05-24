# Decision 0011: Electron Security And Editor Launch

## Status

Accepted

## Decision

Use a locked-down Electron renderer and a narrow typed preload API.

Development renderer URLs are allowed only for unpackaged builds and must point
to loopback HTTP origins.

External editor launch must use system default opening or built-in editor preset
configuration. Arbitrary custom editor commands are disabled until there is an
explicit product and security decision to support them.

## Electron Security

Renderer windows must use:

- `contextIsolation: true`
- `nodeIntegration: false`
- `sandbox: true` where compatible with the required preload behavior
- no remote module
- no direct filesystem access
- no direct SQLite access
- no direct shell/process execution

The preload layer exposes only typed Difftray APIs required by the renderer.

The main process owns:

- Git execution
- SQLite access
- filesystem watching
- external editor launch
- native dialogs

## IPC Policy

IPC channels are allowlisted and typed.

Renderer requests must be validated in the main process before use.

The renderer must not send arbitrary shell commands, SQL, or filesystem operation descriptions.

## External Editor Launch

External editors are configured as either:

- system default open
- a built-in structured launch preset

```json
{
  "command": "open",
  "args": ["-b", "com.microsoft.VSCode", "{path}"]
}
```

Supported tokens:

- `{path}`
- `{line}`
- `{column}`
- `{path}:{line}`
- `{path}:{line}:{column}`

The main process expands tokens after validating the target path belongs to the selected project.

The main process validates project containment lexically and through realpath
resolution before opening a file. Symlinks that resolve outside the selected
project are rejected.

The main process launches preset editors with an executable and argument array.
It must not pass the command through a shell.

Built-in editor presets are preferred for common editors:

- system default
- VS Code
- Cursor
- Zed

Stored editor launch configs are matched back to known presets before use. A
config that does not match a preset is treated as system default in the UI and is
not spawned as a process.

## Consequences

Positive:

- Reduces Electron attack surface.
- Prevents renderer-originated shell execution.
- Prevents persisted arbitrary command execution through corrupted or stale
  settings.
- Prevents renderer dev URL environment variables from loading remote content in
  packaged builds.

Negative:

- Custom editor configuration is not available yet.
- Some unusual editor commands need explicit preset support or a future reviewed
  custom-command design.
