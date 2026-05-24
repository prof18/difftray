# Handoff: Difftray Redesign

A complete UI redesign for Difftray — a local-first macOS desktop app for reviewing Git changes across multiple repositories, with auto-invalidating per-file review state.

## About the Design Files

The files in this bundle are **design references implemented in HTML/React** — high-fidelity prototypes showing intended look, layout, and behavior. They are **not production code to copy directly.** They live in a single bundled HTML doc (`Difftray.html`) that loads JSX via Babel for fast iteration; that scaffolding is not appropriate to ship.

Your task is to **recreate these designs in the existing Difftray codebase** (`github.com/prof18/difftray`) using its established patterns: TypeScript + React, the existing pnpm workspaces (`apps/`, `packages/`), and whatever component primitives / styling solution it already uses. Don't introduce a new design system or styling library; lift the visual tokens listed below into whatever the codebase already has.

If a token or spacing decision conflicts with existing repo conventions, **prefer the existing convention** and flag the conflict for the maintainer.

## Fidelity

**High-fidelity.** All colors, type, spacing, borders, and states are pinned to specific values. Where the prototype omits a hover/focus/disabled state, follow native macOS conventions (subtle hover lift, focus ring on accent color) — don't invent novel behavior. Recreate pixel-for-pixel where reasonable; substitute only when the repo's existing primitives dictate.

## Tech Posture

Difftray is a **macOS desktop app** (Tauri or Electron, depending on what the repo settles on). The prototype uses standard CSS + flex/grid; everything maps cleanly to whatever React renderer the desktop shell embeds. Keyboard navigation is a first-class concern — every interactive surface should have a keyboard equivalent.

---

## Design System (Tokens)

All values pulled from `src/styles.css`. Use these as the source of truth.

### Typography

- **UI sans**: `Geist` (Google Fonts) — weights 400, 500, 600, 700.
- **Mono**: `Geist Mono` (Google Fonts) — weights 400, 500, 600. Used for paths, diff content, line numbers, branch names, kbd shortcuts, status counts.
- Feature settings on the body: `'cv11', 'ss01'`. On mono spans use `'zero', 'ss02'`.
- `letter-spacing: -0.005em` on most UI labels; `-0.01em` to `-0.02em` on headings.

Common type sizes:

| Use | Size | Weight |
|---|---|---|
| Window titlebar title | 13px | 500 |
| Tab label | 12.5px | 500 (active) / 400 |
| Section header in side panes | 14px | 600 |
| Body / row text | 12.5px | 400–500 |
| File path (mono) | 11.5px | 500 |
| Stats / pills | 10.5–11px | 500–600 |
| Section labels (uppercase) | 10.5px | 600, letter-spacing 0.06em |
| kbd | 10.5px | 500 |
| Code in diff | 12px | 400 (line-height 20px) |
| Empty-state title | 22px | 600 |

### Colors — Dark theme

```
--bg:            #0c0c0e   /* tab bar, file list header, diff toolbar, sidebar */
--bg-deep:       #08080a
--panel:         #131316   /* window body, file list body, diff pane */
--panel-2:       #16161a
--elev:          #1c1c21   /* segmented buttons, dropdowns */
--hover:         #1f1f25
--selected:      #25252c
--border:        #26262c
--border-soft:   #1d1d22
--border-strong: #34343c
--text:          #ececef
--text-2:        #c5c5cc
--text-muted:    #898992
--text-dim:      #5b5b63
--accent:        #8a99f7
--accent-2:      #6c7df0
--accent-soft:   rgba(138,153,247,0.12)
--accent-line:   rgba(138,153,247,0.35)
--ok:            #5dc28a   /* reviewed state */
--ok-soft:       rgba(93,194,138,0.14)
--warn:          #e9b04a   /* attention state */
--warn-soft:     rgba(233,176,74,0.14)
--add-bg:        rgba(80,200,120,0.10)   /* diff add row */
--add-mark:      rgba(80,200,120,0.85)
--del-bg:        rgba(240,85,90,0.10)    /* diff delete row */
--del-mark:      rgba(240,85,90,0.85)
--kbd-bg:        #1f1f25
--kbd-border:    #2e2e36
```

### Colors — Light theme

```
--bg:            #fafaf8
--panel:         #ffffff
--panel-2:       #fbfbf9
--elev:          #ffffff
--hover:         #f3f3ef
--selected:      #ebebe5
--border:        #e6e6df
--border-soft:   #efefe9
--border-strong: #d4d4cc
--text:          #181819
--text-2:        #3a3a3d
--text-muted:    #6d6d75
--text-dim:      #a3a3aa
--accent:        #4a5ce0
--accent-2:      #3848c8
--accent-soft:   rgba(74,92,224,0.10)
--accent-line:   rgba(74,92,224,0.35)
--ok:            #1f9b54
--warn:          #b06800
--add-bg:        rgba(40,160,90,0.10)
--add-mark:      rgba(40,160,90,0.85)
--del-bg:        rgba(210,70,70,0.10)
--del-mark:      rgba(210,70,70,0.85)
--kbd-bg:        #f3f3ef
--kbd-border:    #dcdcd4
```

### Spacing & Radii

- Window radius: `12px`.
- Card / panel radius: `8–10px`.
- Button radius: `6px`.
- Pill radius: `4px`.
- kbd radius: `4px`.
- Common paddings: `8px / 10px / 12px / 14px / 18px` — no smaller scale.
- Gap between flex children: `4 / 6 / 8 / 10 / 12 / 16`.

### Shadows

```
--shadow-sm:     0 1px 0 rgba(0,0,0,0.4)                        /* dark */
                 0 1px 0 rgba(0,0,0,0.04)                       /* light */
--shadow-md:     0 8px 24px rgba(0,0,0,0.45), 0 2px 6px rgba(0,0,0,0.25)
                 0 8px 24px rgba(0,0,0,0.10), 0 2px 6px rgba(0,0,0,0.06)
--shadow-pop:    0 16px 48px rgba(0,0,0,0.55), 0 4px 12px rgba(0,0,0,0.35)
                 0 16px 48px rgba(0,0,0,0.15), 0 4px 12px rgba(0,0,0,0.08)
```

The window itself uses `0 0 0 0.5px rgba(0,0,0,0.4), shadow-md`.

---

## Review State Model

This is the **conceptual heart of the redesign**. Three states per file:

| State | Trigger | Visual |
|---|---|---|
| **Pending** | Default for a changed file. | Empty ring (1.5px stroke, `--text-dim`). |
| **Reviewed** | User clicks "Mark reviewed" or hits `R`. | Solid green dot (`--ok`) with 2px soft glow. |
| **Attention** | A previously-reviewed file's diff content changes (drifts). The system auto-flips it back from Reviewed → Attention. | Solid amber dot (`--warn`) with 2px soft glow, plus a pulsing 5px amber halo dot next to the filename. |

**No "Skipped" state. No manual "Flag" action.** The model intentionally has one user verb (`R` — mark reviewed) and one auto-trigger (diff drift → attention).

The drift detection compares content hashes of the file's diff between the last review timestamp and now. Implementation detail for the developer: a stable hash of the unified diff text (after normalizing line endings / whitespace per Settings → "Hide whitespace-only changes") is the simplest contract.

---

## Screens

### 1. Main diff view (the hero)

**File**: `src/layouts.jsx` → `HeroLayout`. Composes `ProjectTabBar` + `FileList` + `DiffToolbar` + `DiffPane`.

#### Window chrome
- macOS-native window: 12px radius, traffic lights top-left (12px dots: `#ff5f57 / #febc2e / #28c840`, 0.5px inner border).
- Centered title: "Difftray", 13px/500, `--text-2`.
- Height 38px, padding `0 12px`, bottom border `1px var(--border)`.

#### Project tab bar (below titlebar)
- Height 38px, `--bg` background, bottom border `1px var(--border)`, padding `0 8px`, gap 1px between tabs.
- Leading: 22px square logo, gradient `linear-gradient(135deg, var(--accent), var(--accent-2))`, white "D" letter in Geist Mono 700/11px, 5px radius.
- Tabs are flex children; horizontal scroll if overflowing.
- Each tab: 28px tall, 6px radius, padding `0 12px`, gap 7px. Folder icon (14×14) + project name + (if drifted) 5px pulsing amber dot + small mono count "0/8" or "3/3".
- Active tab: `--panel` background, 1px `--border`, `border-bottom: 1px var(--panel)` with `margin-bottom: -1px` to fuse with the body below.
- Inactive tab: transparent, `--text-muted` text, no border.
- Trailing: "+" icon button to add a project, then a Settings cog (no Search button — `⌘K` is the primary search affordance and isn't surfaced as an icon).

#### File list (left pane)
- Default width **340px**, resizable **220–540px** by dragging its right edge (5px hit area, accent-colored on hover, `cursor: col-resize`).
- Collapsible: hide button (panel-left icon) in the header. When collapsed, a **32px rail** replaces it with:
  - Top: expand button (panel-right icon).
  - Divider.
  - Vertical strip of 7×7px status dots, one per file, reflecting the file's state.
  - Bottom: rotated mono label "N / M reviewed" (writing-mode vertical-rl, rotate 180deg).
- Background: transparent (inherits `--panel` from window body).
- **Header** (top section, `--bg` background, padding `12px 14px 10px`, bottom border `1px var(--border-soft)`):
  - Row 1: `<count> changed` (mono, 12.5px, tabular-nums for count; "changed" in `--text-muted` 400) — and conditionally `● <n> need attention` (warn-colored, pulsing dot, mono count, "need attention" label). Trailing: Refresh icon button + Hide-panel icon button.
  - Row 2: 4px-tall progress bar with `flex` segments: reviewed (`--ok`) | attention (`--warn`) | pending (transparent). Gap 1px, radius 2px, `--hover` background underneath.
- **Filter row** (padding `8px 10px`, bottom border `1px var(--border-soft)`):
  - 28px input row with leading search icon, "Filter files" placeholder, trailing kbd `/`.
  - `--bg` background, 1px `--border`, 6px radius.
- **File list** (flex 1, scrollable, padding `4px 0`):
  - Each row: 6px vertical padding, 10px gap, 6px margin sides, 6px radius. Selected row: `--selected` background + 2px left border `--accent`.
  - Layout: status dot (8–9px) | filename (mono, 11.5px, 500) + drift pulse dot when applicable | dir path (mono, 10px, `--text-dim`, ellipsized) | diff stats.
  - Diff stats: `+N` (`--add-mark`, 600), `−M` (`--del-mark`, 600), then a 5-block bar showing add/delete ratio (3×8px blocks, 1.5px gap, colored by majority change type).
- **Footer** (top border `1px var(--border-soft)`, padding `8px 14px`, 10.5px `--text-muted`):
  - `J K navigate` `R review` ... `?` (help).

#### Diff toolbar (top of right pane)
- Padding `10px 14px`, bottom border `1px var(--border)`, `--bg` background (matches tab bar).
- **Left side**:
  - Row 1: status dot (9px) | dir path (mono, 12.5px, `--text-muted`, ellipsized) | filename (mono, 12.5px, 600) | "Diff changed" pill (warn-toned: `--warn-soft` bg, `--warn` text, 1px `--warn-soft` border, warn icon + label).
  - Row 2 (3px gap above): branch icon + `offline-image` (mono) | `·` | `+23 −7` (mono, colored) | `·` | `modified 2 hunks`.
- **Right side**:
  - 2-button segmented control (unified / split). 28×22px buttons, 4px radius. Active button: `--elev` background + `--shadow-sm`.
  - Open-in-editor icon button.
  - 1px×18px vertical divider.
  - Primary button: `Mark reviewed`. 28px tall, 12px sides, gap 6px, 6px radius, `--accent` bg, `--accent-2` border, white text. Includes a kbd `R` chip styled with `rgba(255,255,255,0.18)` bg and `0.28` border.

#### Diff pane (bottom of right pane)
- Mono font, 12px/20px.
- Each hunk:
  - Hunk header bar: `--panel-2` background, top + bottom border `1px var(--border)`, padding `6px 14px`, `--text-muted` 11.5px. Leading diff icon, then mono header text `@@ -370,7 +370,23 @@ fun ReaderMode(`.
  - Lines:
    - **Split mode**: two columns separated by a vertical `1px var(--border)`. Each cell: 44px line number column (right-aligned, tabular-nums, 11px, `--text-dim`) + content column (10px sides, `pre`, light syntax highlighting). Background tint by line type: add → `--add-bg`, del → `--del-bg`. Border-left 2px on the changed side: `--add-mark` (right side, add) or `--del-mark` (left side, del). Pair adds/dels row-by-row when balanced; otherwise show the unpaired side over an empty cell.
    - **Unified mode**: single column, two line-number gutters (44px each) + content (10px sides). Background + left border 2px tinted by line type. Leading `+` / `−` / ` ` glyph in `--add-mark` / `--del-mark` / `--text-dim` (14px column).
- **Syntax highlighting** is intentionally minimal — a regex pass colors keywords (Kotlin/Java set), strings, numbers, and types/PascalCase. Comments italicize and dim. Replace with the codebase's existing highlighter if there is one (Shiki, Prism, etc.); don't ship this heuristic.

#### Resize / collapse interactions
- Drag handle on the file list's right edge updates a local `fileListWidth` state, clamped 220–540. Persist this per-repo in app prefs.
- Collapse button toggles a boolean. Both states transition instantly (no animation in the prototype, but a 120ms `width` transition is welcome).
- Add `⌘1` to toggle collapsed/expanded.

---

### 2. Unified diff mode

Same chrome as the hero, with the diff pane rendered in unified mode (see DiffPane spec above). Switching modes is instant; preserve scroll position keyed by hunk offset.

---

### 3. Empty state

**File**: `src/screens.jsx` → `EmptyStateScreen`. Renders when no repos have been opened.

- No project tab bar, no sidebar — just the macOS titlebar with the centered "Difftray" title.
- Body: full-bleed `--panel` background, centered column, padding 40px.
- 64×64 rounded accent tile (16px radius, `--accent-soft` bg, `--accent-line` border, accent-colored diff glyph centered).
- Title `No repository open` (22px/600, `-0.02em`).
- Description `Open a Git repository to start reviewing local changes. Difftray tracks what you've reviewed and re-flags files when the diff drifts.` (13.5px, `--text-muted`, max 420px, center-aligned, line-height 1.55).
- Single primary button: `Open Repository` with leading folder icon and trailing kbd `⌘O` chip (white-translucent on accent background).
- Drag-hint row (11.5px, `--text-muted`): `Drag a folder anywhere to add it`.
- Recent box: max 520px wide, `--panel-2` bg, 1px `--border`, 10px radius, 14px padding. Header "RECENT" (uppercase, 10.5/600, letter-spacing 0.06em). Each row: folder icon | name (12.5/500) + path (mono 10.5, `--text-dim`) | chevron. 1px `--border-soft` separators between rows. **No timestamps** — name + path + chevron only.

---

### 4. Command palette (`⌘K`)

**File**: `src/screens.jsx` → `CommandPaletteScreen`.

- Triggered with `⌘K` anywhere in the app.
- Backdrop covers everything below the project tab bar (top: 76px from the window top, i.e. 38px titlebar + 38px tab bar). `rgba(0,0,0,0.40)` + `backdropFilter: blur(2px)`. The titlebar and tab bar stay visible so the user keeps context.
- Palette: 580px wide, centered horizontally, 120px from the top. `--panel` bg, 1px `--border-strong`, 12px radius, `--shadow-pop`.
- **Search field**: padding `14px 16px`, bottom border `1px var(--border)`. Leading 16×16 search icon | typed query (15px, with matched portion highlighted in `--accent-soft` + `--accent` text) | blinking caret (1.5×16px accent vertical bar) | trailing "All" pill | kbd `esc`.
- **Results**: max-height 440px scrollable, padding `6px 0`. Grouped:
  - Group header: 10.5/600 uppercase, 0.06em letter-spacing, `--text-dim`, padding `10px 16px 4px`.
  - Item row: 8×10px padding, 6px radius, 6px sides margin. Selected row: `--selected` bg + 2px left border `--accent`.
  - Item content: 22×22 square icon container (colored per kind: projects = `--accent` on `--accent-soft`, actions = `--warn` on `--warn-soft`, files = `--ok` on `--ok-soft`), then label (13/500) + sub (mono 10.5, `--text-muted`, ellipsized), then optional hint text + kbd shortcut.
- **Footer**: padding `8px 14px`, top border `1px var(--border)`, `--panel-2` bg, 11px `--text-muted`. Hints: `↑ ↓ navigate` `↵ select` `⌘P files only` ... `⌘K`.

---

### 5. Drift notification toast

**File**: `src/screens.jsx` → `DriftNotificationScreen`.

- Renders over the main diff view. Bottom-right of the window body, 20px from each edge.
- 360px wide, `--panel` bg, 1px `--border-strong`, 10px radius, `--shadow-pop`, `overflow: hidden`.
- Top accent strip: 3px `--warn`.
- Body padding 14px:
  - Row layout: 28×28 warn tile (7px radius, `--warn-soft` bg, `--warn` icon) | content column (flex 1) | close icon button (top-right).
  - Title: `3 reviewed files drifted` (13/600).
  - Body copy: 12px `--text-muted`, line-height 1.5.
  - Drifted file list: tight rows (4px gap), each `4×8px` padding, 5px radius, `--warn-soft` bg, pulsing 5px warn dot + filename (mono) + diff stats (mono, `--text-muted`).
  - Action row: secondary "Review now" button + ghost "Dismiss" button, both 26px tall, 11.5px text.
- The toast appears when one or more reviewed files have drifted since last review. Auto-dismiss after 8s or on Dismiss click; surface again next time the app focuses if still unaddressed.

---

### 6. Settings — Review tab

**File**: `src/screens.jsx` → `SettingsScreen`.

- Standalone macOS window (900×640) with titlebar `Settings · Difftray`.
- Two columns: 200px tab list on the left (`--bg` bg, 1px `--border` right border, 14px/10px padding), content on the right (24×32px padding).
- Tab list items: 7×10px padding, 6px radius, 12.5px. Active item: `--selected` bg, 500 weight.
- Tabs (in order): `General` `Repositories` `Review` `Diff` `Keyboard` `Advanced`. The Review tab is the primary one captured in the design.
- Content sections, each:
  - Group label (10.5/600 uppercase, 0.06em letter-spacing, `--text-dim`).
  - Card: 1px `--border`, 8px radius, `--panel-2` bg, overflow hidden.
  - Rows: 12×14px padding, 1px `--border-soft` separators.
- Sections present:
  - **Re-review triggers** (3 toggles): "Reset review when diff content changes" (default on), "Reset review when line count changes only", "Reset review when commit SHA changes". These are *radio-like* (mutually exclusive) in semantics but rendered as toggles in the mock — verify with the maintainer before implementation.
  - **Defaults**: Default diff mode (segmented Split / Unified), Hide whitespace-only changes (switch), Auto-collapse hunks > N lines (stepper, default 120), Mark reviewed shortcut (kbd display `R`).
  - **Notifications**: Notify when reviewed file drifts (switch, on).

---

## Layout & Interaction Notes

### Keyboard model
- `⌘K` — command palette.
- `⌘O` — open repository.
- `⌘1` — toggle file list panel.
- `⌘P` — files-only palette mode.
- `J` / `K` — move down / up through files.
- `R` — mark current file reviewed.
- `/` — focus the filter input.
- `Esc` — dismiss palette / overlays.

### Drift detection
1. On `Mark reviewed`, hash the file's diff (unified diff text, normalized for whitespace per the setting).
2. Store `{ filePath, branchOrWorktreeRef, contentHash, reviewedAt }`.
3. On every git refresh (manual or watcher-fired), recompute the hash. If it differs and the file was previously reviewed, transition the state to **Attention**.
4. Surface the per-repo count of attention files in the project tab pill, and surface drift events globally via the toast.

### Theming
Light / dark mode is a system-level preference. Honor `prefers-color-scheme` by default; expose an override in Settings → General (not designed yet — pattern-match the existing repo's preferences shape).

---

## Component Inventory (for mapping)

Map these to existing primitives in the repo before building new ones:

| Prototype component | Function |
|---|---|
| `WindowChrome` (`src/components.jsx`) | macOS window wrapper with traffic lights + centered title. |
| `ProjectTabBar` (`src/layouts.jsx`) | Top tab bar with logo, tabs, +, settings. |
| `FileList` (`src/components.jsx`) | Resizable + collapsible left pane. |
| `DiffToolbar` (`src/components.jsx`) | Per-file action row above the diff. |
| `DiffPane` + `Hunk` + `SplitHunk` + `UnifiedHunk` | Diff renderer. |
| `CollapsedRail` (`src/layouts.jsx`) | 32px rail shown when file list is collapsed. |
| `ResizeHandle` (`src/layouts.jsx`) | Drag-to-resize affordance. |
| `Sidebar`, `ProjectRow` (`src/components.jsx`) | **Legacy** — the old project sidebar from an earlier exploration. Not used by the chosen layout. Safe to ignore. |
| `OnboardingScreen`, `ProjectSwitcherScreen` (`src/screens.jsx`) | **Removed from canvas** but functions are still present in the source. Don't implement — the empty state + ⌘K + tabs cover the same surface area. |

---

## Files in this bundle

```
Difftray.html              # Single-page bundle — loads the JSX sources via Babel
src/styles.css             # All tokens (CSS variables) + base reset + scrollbar styling
src/components.jsx         # Window chrome, Icon set, Sidebar, FileList, DiffToolbar, DiffPane
src/layouts.jsx            # HeroLayout (top-tabs + resizable file list), ProjectTabBar, ResizeHandle, CollapsedRail
src/screens.jsx            # EmptyStateScreen, SettingsScreen, CommandPaletteScreen, DriftNotificationScreen, plus legacy unused screens
src/app.jsx                # Canvas composition (each artboard = one screen variant)
src/design-canvas.jsx      # Prototype-only — the design-canvas presenter. Don't ship.
src/macos-window.jsx       # Unused starter. Ignore.
```

To run the prototype locally, open `Difftray.html` in a browser — no build step needed (Babel transforms on the fly).

## Asset / Brand Notes

- **Logo**: a simple "D" glyph on a 22–30px rounded square with the accent → accent-2 gradient. If a proper Difftray logo lands, drop it in here; the gradient placeholder is a stand-in.
- **Fonts**: Geist and Geist Mono are both Google Fonts and OFL-licensed; vendor them locally for the desktop app rather than pulling from Google at runtime.
- **Icons**: All icons in the prototype are hand-rolled 14–16px stroked SVGs. Replace with the codebase's existing icon set (lucide / phosphor / heroicons / etc.) for consistency; the inline set is just a placeholder.
- **No raster assets** are used.

## Open Questions for the Maintainer

1. The three "Re-review trigger" options in Settings are rendered as toggles but read as radio buttons (mutually exclusive). Confirm intended semantics.
2. Should the project tab bar wrap or horizontal-scroll when many repos are added? Prototype assumes horizontal scroll. A "+ N more" overflow chip is a possible alternative.
3. Is the watcher Git-only, or should it also pick up uncommitted changes (staged + unstaged) automatically? The prototype assumes the default review source is "Worktree against base branch."
4. Does the codebase already have a diff renderer (e.g. shiki + diff-parser)? If so, prefer it over the prototype's regex highlighter.
