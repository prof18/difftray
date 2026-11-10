# Product

<!-- impeccable:product-schema 1 -->

## Platform

web (this record covers the marketing site in `site/`; the desktop app is Electron, the companion is React Native in a private repository)

## Users

Developers who review local Git changes before they commit, push or open a pull
request, most often changes written by a coding agent (Claude Code, Codex, Pi). They
iterate with the agent in a terminal and need to know which files they already read
and which changed afterwards. A second audience reviews the same changes from an
iPhone, iPad or Android device while away from the Mac.

## Product Purpose

Difftray is a local-first macOS app for reviewing Git diffs across many repositories
and worktrees. A reviewed mark holds only while the file's diff stays the same; when
the agent changes the file again, Difftray flags it for another look. Success: the
user never has to reconstruct from memory what they already reviewed.

## Positioning

Review state the user can trust, shared with the agent. The user leaves line, range,
file and overall comments; the agent reads them through the bundled `difftray` CLI and
skill, fixes the code, and can write its own review comments back, attributed to the
agent by name. Difftray is not an IDE, an agent host or a pull-request platform.

## Operating Context

- An agent runs in a terminal next to Difftray on the same Mac.
- Agent skills install from Settings → Agents for Claude Code, Codex and Pi, or any
  agent with a skills folder. Slash commands: `/difftray-open`, `/difftray-read`,
  `/difftray-fix`, `/difftray-review`, `/difftray-label`.
- The companion app pairs over Wi-Fi or Tailscale with an end-to-end encrypted
  channel. There is no cloud backend.

## Capabilities and Constraints

- Mac app: free. macOS 13 or later, Apple silicon (`Difftray-arm64.dmg`) and Intel
  (`Difftray-x64.dmg`) builds from GitHub releases.
- Companion (App Store id6789255782, Google Play `com.prof18.difftray.companion`): free
  for one project; Difftray Pro (annual or lifetime) unlocks every project. Prices vary
  by storefront and are not stated on the site.
- Review targets: working tree, branch against a base, single commit.
- Agents can open the worktree, read every feedback page, export a prompt, and submit
  line, range, file and overall feedback. Loading the skill alone authorizes no write.
- Copy for agent still exports all feedback as a prompt for tools without the skill.

## Brand Commitments

- Name: Difftray. Domain: difftray.app. Source: github.com/prof18/difftray.
- App icon and favicons in `site/assets/` and `design/`.
- Voice: plain, direct, developer to developer. No hype.

## Evidence on Hand

- Real captures of the current app (dark theme) with agent comments and drift:
  `site/assets/agent-review.webp`, `site/assets/drift-flagged.webp`.
- Companion captures: `site/assets/companion-*.png`.
- No testimonials, customer logos, user counts or benchmarks exist. Do not invent them.

## Product Principles

1. A reviewed mark is never stale.
2. The agent and the human review the same diff in the same place.
3. Everything stays on the user's machines.
4. Show the real app, never a mockup that claims more than it does.
