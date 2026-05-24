## Prompt for Claude Code

Paste this into Claude Code after dropping the `design_handoff_difftray_redesign/` folder somewhere in your project (or as an attachment). Tweak the paths and any maintainer-specific choices before sending.

---

You're implementing a UI redesign of **Difftray**, a local-first macOS desktop app for reviewing Git changes across multiple repositories with per-file review state that auto-invalidates on diff drift.

The redesign is described in full in `design_handoff_difftray_redesign/README.md`. Read that file first — it documents every screen, every token, the state model, keyboard model, and interaction behavior. The HTML/JSX files in that folder are **design references**, not production code. Don't copy the prototype scaffolding (Babel-in-browser, `design-canvas.jsx`, the `dt-*` class names) — recreate the designs natively in this codebase's React + TypeScript setup, using the existing pnpm workspace structure under `apps/` and `packages/`.

### What to do

1. **Read first**, build second:
   - `design_handoff_difftray_redesign/README.md` — full spec.
   - The current state of `apps/` and `packages/` in this repo — figure out what's already wired (window shell, IPC, git layer, theming, primitives) and prefer those over inventing new ones.

2. **Build the screens in this order** (each is its own deliverable):
   1. The **Main diff view** with the top tab bar, resizable + collapsible file list, diff toolbar, and split/unified diff pane. Wire up real data flow: project list → file list → diff content. The split/unified toggle and `⌘1` collapse should both be functional.
   2. The **3-state review model** (pending / reviewed / attention) with auto-drift detection. See README → "Review State Model" and "Drift detection."
   3. The **Empty state** for first-run / no-repo-open.
   4. The **Settings → Review tab**.
   5. The **⌘K Command palette** (project + file + action search; live filter; keyboard nav).
   6. The **Drift notification toast**.

3. **Honor the design tokens** from the README. Wire them into whatever theming layer the repo already uses (CSS variables, Tailwind config, Stitches, etc.). Generate both light and dark token sets. Use system `prefers-color-scheme` as the default with a Settings override.

4. **Keyboard navigation is first-class.** Implement the keymap listed in the README. Don't ship a screen until its keys work.

5. **Don't ship the prototype's syntax highlighter** — it's a regex placeholder. Use whatever the repo already has, or wire in Shiki / refractor / similar.

6. **Replace the inline SVG icon set** in the prototype with this codebase's existing icon library (lucide, phosphor, heroicons — whichever the repo already uses). Maintain sizes (12 / 13 / 14 / 16 px) and stroke weight (~1.2–1.4).

### Constraints

- **Don't reshape the data model** to fit the prototype — the prototype's sample data is illustrative. Plumb real Git data.
- **Don't introduce new dependencies** without checking the repo's `package.json` and asking first. Animations, virtualization, icons, syntax highlighting, etc. — prefer what's already there.
- **Don't implement the legacy/removed screens** flagged in the README's Component Inventory ("Project switcher", "Onboarding") — they're intentionally cut.
- **Preserve macOS conventions**: traffic lights only on macOS, native-feeling chrome, respect `prefers-color-scheme`.

### Verification checklist before declaring done

- [ ] All keyboard shortcuts work (⌘K, ⌘O, ⌘1, J, K, R, /, Esc).
- [ ] Resize handle clamps 220–540px and persists per-repo.
- [ ] Collapsed rail shows accurate per-file dots.
- [ ] Drift detection flips reviewed files to Attention when their diff content changes.
- [ ] Mark reviewed both stores the content hash and updates the UI optimistically.
- [ ] Both themes (light + dark) match the token values.
- [ ] Project tab bar handles 1, 5, and 20+ repos without breaking.
- [ ] Empty state appears when no repos are configured.
- [ ] ⌘K palette searches across projects, files in the active project, and registered actions.

### Questions to surface

The README ends with "Open Questions for the Maintainer." Surface those at the end of your implementation — don't silently pick one interpretation when the spec is ambiguous.
