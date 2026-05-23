# Decision 0011: Electron Security And Editor Launch

## Status

Accepted

## Decision

Use a locked-down Electron renderer and a narrow typed preload API.

External editor launch must use tokenized command configuration and direct process spawning, not raw shell execution.

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

External editors are configured as structured launch configs:

```json
{
  "command": "code",
  "args": ["--goto", "{path}:{line}"]
}
```

Supported tokens:

- `{path}`
- `{line}`
- `{column}`
- `{path}:{line}`
- `{path}:{line}:{column}`

The main process expands tokens after validating the target path belongs to the selected project.

The main process launches the editor with an executable and argument array. It must not pass the command through a shell.

Built-in editor presets should be preferred for common editors:

- system default
- VS Code
- Cursor
- Zed

## Consequences

Positive:

- Reduces Electron attack surface.
- Prevents renderer-originated shell execution.
- Keeps custom editor support without unsafe raw command strings.

Negative:

- Custom editor configuration is less free-form.
- Some unusual editor commands may need explicit support or careful token parsing.
