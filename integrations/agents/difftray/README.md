# Difftray agent skill

This folder is the contributor source for Difftray's portable agent skill. Packaged apps bundle its `skills` folder at `Contents/Resources/skills`, next to the CLI at `Contents/Resources/bin/difftray`.

The `skills` folder holds the canonical `difftray` skill and the typed-only command skills (`difftray-open`, `difftray-read`, `difftray-fix`, `difftray-review`, `difftray-label`). Each command skill loads the canonical skill and narrows the request. The app's **Settings → Agents** page creates a symlink from each agent's skills folder to every bundled skill folder. Installed skills therefore follow app updates at the same location.

For setup from an installed app, open **Settings → Agents**; see the [agent integration guide](https://github.com/prof18/difftray/blob/main/docs/agent-integration.md#in-app-setup).

The resolver uses `DIFFTRAY_APP_PATH` when it is set. Otherwise it identifies the owning app from the installed skill symlink, which also works for Alpha and custom-named bundles. When run from the repository source checkout, it keeps the default lookup of `/Applications/Difftray.app`, then `~/Applications/Difftray.app`. It validates the app bundle before launch. The optional terminal command is a convenience that the skill does not need.

The app's install flow needs only the skill and the CLI, with no repository plugin wrappers or marketplace catalogs. Agent-specific frontmatter and references stay in the canonical skill tree. See the [public agent integration guide](https://github.com/prof18/difftray/blob/main/docs/agent-integration.md#agent-skill-setup) for installation and resolver details.
