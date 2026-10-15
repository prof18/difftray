# Difftray agent skill

This repository folder is the contributor source for Difftray's portable agent skill. Packaged apps bundle only `skills/difftray` at `Contents/Resources/skills/difftray`, alongside the CLI at `Contents/Resources/bin/difftray`. The app's **Settings → Agents** page creates a symlink from each agent's skill location to the bundled folder, so the installed skill follows app updates at the same location.

For setup from an installed app, open **Settings → Agents**; see the [agent integration guide](https://github.com/prof18/difftray/blob/main/docs/agent-integration.md#in-app-setup).

The resolver uses `DIFFTRAY_APP_PATH` when set, otherwise it identifies the owning app from the installed skill symlink. This supports Alpha and custom-named bundles. When run from the repository source checkout, it retains the default lookup of `/Applications/Difftray.app`, then `~/Applications/Difftray.app`. It validates the app bundle before launch. The optional terminal command is a convenience; the skill does not need it.

The skill and CLI are sufficient for the app's install flow; repository plugin wrappers and marketplace catalogs are not needed. Agent-specific frontmatter and references remain in the canonical skill tree. See the [public agent integration guide](https://github.com/prof18/difftray/blob/main/docs/agent-integration.md#agent-skill-setup) for installation and resolver details.
