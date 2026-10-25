# Agent command skills

## Status

Accepted

## Context

The bundled `difftray` skill covers opening a worktree, reading and fixing
feedback, reviewing, and labeling. Each request had to be spelled out in full
because loading the skill authorizes nothing by itself. Users want short slash
commands for the common requests.

## Decision

Ship five command skills next to the canonical skill: `difftray-open`,
`difftray-read`, `difftray-fix`, `difftray-review` and `difftray-label`. Each is a
single `SKILL.md` that loads `../difftray/SKILL.md` and narrows the request. All
rules, the CLI resolver and the command reference stay in the canonical skill, so
they cannot drift apart.

Command skills set `disable-model-invocation: true` and say "Use only when the
user types" in their description, so they never compete with the canonical skill
for automatic selection. Typing a command is the authorization it names:
`/difftray-review` submits findings, `/difftray-fix` edits code, and neither
does the other's job. `/difftray-read` and `/difftray-open` write nothing.

The app bundles the whole `skills` folder. Settings → Agents links every skill
name into each agent's skills folder and reports one status per agent: installed
only when every link is in place, **Repair** when some are missing or point to a
previous app location, and blocked, with nothing linked, when any name is taken by
something the app does not own. Install receipts record each link separately.

## Consequences

Command skills appear as separate entries in an agent's skill list. Users who
installed the skill before command skills existed see **Repair** once after
updating. Adding a command means adding its folder and its name to
`agentSkillNames` in `apps/desktop/src/shared/agent-skill-names.ts`.
