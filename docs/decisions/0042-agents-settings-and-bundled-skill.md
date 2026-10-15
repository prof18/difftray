# 0042: Agents settings and bundled portable skill

Status: Accepted

## Context

Coding agents on the same Mac can open worktrees, read review feedback and post
findings through Difftray's bundled CLI. A packaged app should make this
integration available without requiring users to find a repository checkout or
install a repository plugin.

## Decision

Keep one canonical portable skill in the public repository at
`integrations/agents/difftray/skills/difftray`. Package only that folder at
`Contents/Resources/skills/difftray`, alongside the existing CLI at
`Contents/Resources/bin/difftray`. Claude Code and Codex plugin wrappers and
marketplace catalogs are not part of the installation path. The shared skill and
CLI provide the required agent integration.

Add an Agents settings page between Repositories and Phone companion. Its Install
actions create app-owned symlinks to the bundled skill for Claude Code
(`~/.claude/skills/difftray`), Codex (`~/.agents/skills/difftray`), and Pi
(`~/.pi/agent/skills/difftray`). Other agents use the native folder chooser, to
which the app appends `difftray`. Preserve unrelated folders, files, and
symlinks; replace only links recorded as owned by the installer. An app-owned link can be
repaired after the app moves, while custom destinations can always be chosen
again. Links follow skill changes when the app updates at its current path; an
agent host may need a restart or reload to see an update.

The app resolves its owning bundle from the installed skill symlink, including
Alpha and custom-named bundles. An explicit `DIFFTRAY_APP_PATH` remains the
highest-priority override for manual or developer use. Repository-source use
retains the default lookup of `/Applications/Difftray.app`, then
`~/Applications/Difftray.app`. Unpackaged development runs do not offer skill
installation. An isolated profile override cannot install into real agent
directories.

Keep the Check action on the bundled CLI's `doctor --json`, using the current
profile and a 20-second timeout. Keep the optional terminal CLI installer in
Agents settings. The app does not run agent commands or modify unrelated host
configuration.

## Consequences

User-owned links to safe skills directories are supported. Installation receipts
identify destinations by their canonical paths so shared Claude Code and Codex
skills directories remain repairable through either agent's settings row.

Users install the portable skill from the app without a separate Node runtime,
global CLI command, repository clone, or shell-profile change. App updates at the
same location update the linked skill files; moving the app requires Repair.
Plugin wrappers and catalogs are removed from this integration. The repository
remains the canonical contributor source. Host-specific live installation and
session validation must be reported only when performed; this decision does not
claim either has happened.
