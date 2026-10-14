# Difftray agent skill

This package contains one portable skill and one shell resolver. Codex, Claude Code, and Pi reference the same `skills/difftray` tree. The skill calls Difftray's bundled CLI, so no separate Node or global CLI installation is needed. Installing this package into an agent is a one-time, user-controlled setup action; no host configuration is changed by this repository.

The resolver uses `DIFFTRAY_APP_PATH` when set, otherwise `/Applications/Difftray.app` then `~/Applications/Difftray.app`. It validates the app bundle before launch. For custom or moved apps, set the override explicitly. An optional desktop setting can install a terminal convenience command; the skill does not need that setting.

Local catalogs are `../../../.agents/plugins/marketplace.json` for Codex and `../.claude-plugin/marketplace.json` for Claude. Pi reads this package's `pi.skills` declaration. A plain `SKILL.md` can also be loaded by agents that support portable skills, including Antigravity; no Antigravity plugin compatibility is claimed. See the public agent integration guide for host-specific setup commands.
