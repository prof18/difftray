# Professional UI Redesign

## Purpose

Difftray should look and feel like a professional local review console for engineers. The current direction allows too much visual drama: heavy gradients, bright accent surfaces, badge-like controls, and decorative shapes can make the app feel like a game interface instead of a trusted review tool.

This document defines the next UI direction before implementation starts. It is the design brief for the redesign and the acceptance standard for future UI changes.

## Product Positioning

Difftray is not an IDE, an agent runner, a pull request platform, or a merge tool. It is a local-first diff review workspace that helps an engineer answer four questions quickly:

- What project am I reviewing?
- What changed?
- What still needs review?
- Did anything change after I reviewed it?

The interface should feel closer to a command center for focused engineering work than a dashboard, landing page, or game HUD.

## Reference Direction

The Codex app is the primary inspiration for the level of polish and density, not a skin to copy. The relevant qualities are:

- A calm multi-pane workspace for real developer workflows.
- Clear organization by project, thread, file, and artifact.
- Dense but readable information hierarchy.
- Review surfaces that keep code and change state central.
- Restraint: the UI supports long work sessions without competing with the content.

Public reference material:

- https://openai.com/index/introducing-the-codex-app/
- https://openai.com/index/codex-for-almost-everything/

## Design Principles

### Professional Before Expressive

The app can be opinionated, but it must first look dependable. Visual identity should come from proportions, typography, spacing, and state clarity. It should not rely on glow, high-saturation gradients, novelty shapes, or decorative marks.

### Review State Is The Main Signal

Color is reserved for product-critical state:

- reviewed
- unreviewed
- changed after review
- generated or hidden
- errors and warnings

Decorative color must never compete with review state.

### Dense, Not Cramped

Difftray is used repeatedly by engineers who scan paths, hunks, and state. The UI should be compact enough to show useful context without feeling compressed. Rows, toolbars, and panels should have stable dimensions and predictable alignment.

### Panels, Not Cards

The app should be composed from persistent work surfaces:

- project rail
- file queue
- diff canvas
- details or inspector panel
- command bar

Avoid stacked cards, nested cards, floating marketing panels, and decorative content boxes. Repeated items such as file rows can have subtle row containers, but page sections should not be cardified.

### Quiet Motion

Motion should confirm state changes and navigation. It should not make review feel playful. Use short, low-amplitude transitions for selection, panel reveal, and mark-reviewed progress. Avoid bouncing, pulsing, particle-like motion, and animated backgrounds.

## Information Architecture

### App Shell

Use a single-window, multi-pane layout:

```text
project rail | file queue | diff canvas | optional inspector
------------------------------------------------------------
global command bar / status line integrated into the frame
```

The project rail owns project switching and progress. The file queue owns file-level review flow. The diff canvas owns code review. The optional inspector owns metadata, settings, and contextual actions.

### Project Rail

The rail should be narrow and stable. It should show:

- project name
- current review mode
- compact progress state
- dirty or invalidated status when relevant

Avoid large brand blocks, oversized logos, and decorative project glyphs. Selection can use a subtle background and a thin accent line.

### File Queue

The file queue is the worklist. It should support fast scanning:

- path first
- status second
- review state always visible
- changed-after-review state unmistakable
- generated files visually de-emphasized when shown

Rows should be compact and stable. Avoid pill-heavy metadata and large icons. Use iconography only where it improves scanning.

### Diff Canvas

The diff canvas is the visual center of the app. It should have the calmest background and the strongest alignment. Code should not sit inside a decorative frame.

Required qualities:

- readable side-by-side diff columns
- strong line-number and gutter alignment
- clear added, removed, and changed-line states
- enough contrast for long sessions
- no saturated background washes behind large code regions

### Command Bar

The command bar should be utilitarian:

- filter
- refresh
- open in editor
- mark reviewed
- review mode switch, when available
- settings

Prefer icon buttons with tooltips for repeated commands. Use text buttons only for high-importance actions that need a label.

### Inspector

Use an inspector instead of modal-heavy settings where possible. The inspector can show:

- file metadata
- review target details
- generated-file reason
- editor launch target
- project settings

It should be collapsible or contextual so it does not steal room from the diff.

## Visual System

### Color

Use a restrained neutral base with one low-saturation operational accent.

Recommended token direction:

```text
--color-bg: #101112
--color-panel: #161719
--color-panel-raised: #1d1f22
--color-border: #2a2d31
--color-border-strong: #3a3e44
--color-text: #f1f0ec
--color-text-muted: #9c9a94
--color-text-subtle: #6f736f
--color-accent: #8aa0b5
--color-accent-strong: #a9bac9
--color-reviewed: #7aa877
--color-invalidated: #d0a45f
--color-danger: #d66f61
```

Rules:

- No radial orb backgrounds.
- No dominant purple, orange, or amber theme.
- No bright amber primary buttons.
- Amber is reserved for warnings or changed-after-review state.
- Green is reserved for reviewed or success state.
- Red is reserved for destructive, failed, or blocked state.
- Accent is for selection, focus, and active controls only.

### Typography

Use real bundled fonts, not default system fonts.

Recommended stack:

- UI: IBM Plex Sans
- Diff and code: JetBrains Mono

Type scale:

- app chrome labels: 11 to 12 px
- rows and controls: 12 to 13 px
- panel titles: 13 to 15 px
- primary workspace title: 16 to 18 px
- code: 12 to 13 px

Rules:

- Letter spacing is 0.
- Avoid oversized headings inside panels.
- Use weight and contrast before size.
- Do not scale font size with viewport width.

### Spacing And Shape

Recommended sizing:

- project rail width: 232 to 260 px
- file queue width: 300 to 380 px
- toolbar height: 44 to 52 px
- file rows: 34 to 42 px
- icon buttons: 28 to 32 px
- border radius: 4 to 6 px

Rules:

- No rounded pill-heavy interface.
- No nested cards.
- No decorative large brand mark.
- Use 1 px borders and subtle separators.
- Prefer flush panels over floating surfaces.

### Icons

Use lucide-react for common actions and status where it improves scan speed.

Rules:

- Icon-only buttons need tooltips.
- Avoid custom decorative glyphs.
- Keep status icons small and aligned.
- Do not use icons as decoration.

### Diff Styling

Diff colors should be legible and subdued:

- additions: muted green background, stronger green gutter
- deletions: muted red background, stronger red gutter
- changed-after-review: amber marker, not full-row amber paint
- selected line: neutral highlight unless the line itself has semantic diff color

The diff area should be the clearest part of the app. Decoration around it should be minimal.

## Interaction Model

### Review Flow

The happy path should stay keyboard-first:

1. Select project.
2. Scan unreviewed file queue.
3. Open file in diff canvas.
4. Review.
5. Mark reviewed.
6. Advance to next unreviewed file.
7. Surface invalidated files immediately when a reviewed diff changes.

### Empty States

Empty states should be compact and operational. They should explain what is missing and provide the next action.

Avoid large illustrations, hero copy, and celebratory states. A clean "No unreviewed files" state is enough.

### Settings

Settings should feel like an inspector panel or compact sheet, not a showcase area. Settings controls should be aligned, labeled, and predictable.

Do not use visible instructional prose for obvious controls.

## Implementation Guardrails

- Keep CSS Modules and CSS custom properties.
- Keep Radix UI only for primitives that need accessibility behavior.
- Keep lucide-react for standard icons.
- Do not add a broad component framework.
- Do not add network-backed UI dependencies.
- Keep renderer logic separate from Git, SQLite, and filesystem access.
- Preserve Electron security defaults.

## Redesign Scope

The first redesign pass should cover:

- app shell layout
- project rail
- file queue
- diff toolbar
- empty and loading states
- settings surface
- theme tokens
- typography setup

The first pass should not add:

- editing
- PR concepts
- agent concepts
- commit creation
- branch graph visualization
- merge conflict tooling
- decorative charts

## Acceptance Checklist

A UI change is not ready until it satisfies these checks:

- The app looks like a professional engineering tool in the first screenshot.
- Review state is more visually prominent than decoration.
- No videogame-like glow, animated background, saturated gradient, or achievement-style badge is present.
- The diff canvas is the dominant work surface.
- The layout remains stable while loading, filtering, selecting, and marking reviewed.
- Text does not clip or overlap at common desktop window sizes.
- The app remains usable with the keyboard.
- Visual verification has been run for UI-facing changes.
- Screenshots show no blank, unreadable, clipped, or overlapped states.
