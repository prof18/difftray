---
name: Difftray (difftray.app)
description: Marketing site for the Difftray Mac app, dressed in the app's own dark review theme.
colors:
  ground: "#151619"
  bg: "#191a1c"
  panel: "#1f2024"
  elev: "#2b2d30"
  line: "#26282b"
  line-strong: "#3a3d42"
  text: "#d1d3da"
  text-2: "#bcbec4"
  muted: "#9a9ea6"
  heading: "#ffffff"
  terminal: "#0f1012"
  ok: "#73bd79"
  ok-hover: "#86ca8b"
  ok-ink: "#0f1f11"
  warn: "#d9b64e"
  agent: "#5da9ff"
  del: "#ff7a70"
  selection: "#264f78"
typography:
  display:
    fontFamily: "Schibsted Grotesk, IBM Plex Sans, sans-serif"
    fontSize: "clamp(40px, 6.2vw, 76px)"
    fontWeight: 800
    lineHeight: 1.02
    letterSpacing: "-0.035em"
  headline:
    fontFamily: "Schibsted Grotesk, IBM Plex Sans, sans-serif"
    fontSize: "clamp(32px, 4.2vw, 50px)"
    fontWeight: 700
    lineHeight: 1.06
    letterSpacing: "-0.03em"
  title:
    fontFamily: "Schibsted Grotesk, IBM Plex Sans, sans-serif"
    fontSize: "17px"
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: "-0.01em"
  lede:
    fontFamily: "IBM Plex Sans, Avenir Next, sans-serif"
    fontSize: "clamp(17px, 1.6vw, 19px)"
    fontWeight: 400
    lineHeight: 1.6
  body:
    fontFamily: "IBM Plex Sans, Avenir Next, sans-serif"
    fontSize: "17px"
    fontWeight: 400
    lineHeight: 1.6
  body-compact:
    fontFamily: "IBM Plex Sans, Avenir Next, sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.6
  body-sm:
    fontFamily: "IBM Plex Sans, Avenir Next, sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.6
  label:
    fontFamily: "IBM Plex Sans, Avenir Next, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.6
  code:
    fontFamily: "JetBrains Mono, ui-monospace, monospace"
    fontSize: "15px"
    fontWeight: 400
  terminal:
    fontFamily: "JetBrains Mono, ui-monospace, monospace"
    fontSize: "12.5px"
    fontWeight: 400
    lineHeight: 1.75
rounded:
  focus: "4px"
  kbd: "5px"
  mark: "6px"
  control: "8px"
  panel: "10px"
spacing:
  gutter: "clamp(16px, 4vw, 40px)"
  wrap: "1180px"
  section: "clamp(72px, 10vw, 128px)"
  block: "40px"
  row: "18px 22px"
components:
  button-primary:
    backgroundColor: "{colors.ok}"
    textColor: "{colors.ok-ink}"
    typography: "{typography.body-sm}"
    rounded: "{rounded.control}"
    padding: "11px 16px"
  button-primary-hover:
    backgroundColor: "{colors.ok-hover}"
  button-primary-large:
    backgroundColor: "{colors.ok}"
    textColor: "{colors.ok-ink}"
    rounded: "{rounded.control}"
    padding: "14px 20px"
  button-line:
    textColor: "{colors.text}"
    rounded: "{rounded.control}"
    padding: "11px 16px"
  button-line-hover:
    backgroundColor: "{colors.panel}"
  store-badge:
    textColor: "{colors.heading}"
    rounded: "{rounded.control}"
    padding: "10px 16px"
  nav:
    backgroundColor: "{colors.ground}"
    textColor: "{colors.text-2}"
    height: "60px"
  command-table:
    backgroundColor: "{colors.bg}"
    rounded: "{rounded.panel}"
    padding: "18px 22px"
  terminal-pane:
    backgroundColor: "{colors.terminal}"
    textColor: "{colors.text-2}"
    typography: "{typography.terminal}"
    rounded: "{rounded.panel}"
    padding: "16px"
  kbd:
    backgroundColor: "{colors.elev}"
    textColor: "{colors.heading}"
    rounded: "{rounded.kbd}"
    padding: "3px 7px"
---

# Design System: Difftray (difftray.app)

This file covers the marketing site (`site/index.html`, difftray.app) only; the desktop app's own visual system is documented in `docs/professional-ui-redesign.md`. The site's palette is taken from the app's dark theme tokens in `apps/desktop/src/renderer/styles/global.css`.

## Overview

**Creative North Star: "Two Terminals, One Desk"**

The site is set on the same graphite desk the app runs on: an agent's terminal pane and a real Difftray window sit side by side, reviewing the same diff. Nothing on the page is a decorative surface. The ground, panels and hairlines are the app's own dark theme, and the only saturated colours are the app's review states. Proof is real captures and real commands, never illustration.

Density is calm and editorial: wide section breathing room (72 to 128px between sections) around content that is itself tight and tabular, like a review session. Structure comes from 1px hairlines and grid alignment, not from cards. Depth is reserved for the things that stand for real windows (terminal, screenshots, phones), which lift off the desk with a soft drop shadow.

Motion is one authored moment: the terminal replays its commands line by line, then the matching agent comments in the capture receive a blue outline. Everything else is a short state transition.

**Key Characteristics:**

- Graphite ground (app dark theme), white headlines, two-step grey body text.
- Colour means review state: green reviewed/primary action, amber drift, blue agent, red deletion/code write.
- Schibsted Grotesk display over IBM Plex Sans body; JetBrains Mono only where the content is code.
- Hairline-ruled rows and tables instead of card grids.
- Real windows lift with a shadow; all other surfaces are flat.

## Colors

A near-neutral graphite scale with four state colours lifted directly from the app; the palette carries meaning, not mood.

### Primary

- **Reviewed Green** (ok): the single action colour. Every download button, the reviewed status dot, the `›` prompt and success line in the terminal. Paired with **Moss Ink** (ok-ink) as button text and **Lit Green** (ok-hover) on hover.

### Secondary

- **Agent Blue** (agent): anything the agent authored or touched: agent name in the terminal, the outline marks over agent comments in the capture, the "Comments only" write column, and the global focus ring.

### Tertiary

- **Drift Amber** (warn): the "Changed after review" state only.
- **Deletion Red** (del): the "Code only" write column; it signals the agent changing code.

### Neutral

- **Graphite Ground** (ground): page background, sticky nav, `theme-color`.
- **Graphite** (bg): screenshot frames and the command table body (the app's `--bg`).
- **Panel Graphite** (panel): table header row, hover fill for line buttons and store badges, skip link.
- **Raised Graphite** (elev): keycaps and terminal window dots.
- **Terminal Black** (terminal): terminal pane fill only; it reads as a separate app sitting on the desk.
- **Hairline** (line): section rules, table row dividers, frame borders, nav border once scrolled.
- **Strong Hairline** (line-strong): outline buttons, store badges, keycap borders, the rule above setup columns, fact-list left rules.
- **Heading White** (heading): h1 to h3, brand wordmark, bold inline emphasis, code in the command table, hovered links.
- **Body Grey** (text) and **Secondary Grey** (text-2): primary reading text and supporting copy (lede, sub, table descriptions).
- **Muted Grey** (muted): metadata lines, captions, table header, "Works with" list. Site-only; the app does not define it.
- Text selection uses the app's diff selection blue (`#264f78`) with white text.

### Named Rules

**The States Are The Palette Rule.** A saturated colour appears only when it means a review state or an agent action, in the same sense the app uses it. No decorative accent, gradient or tint exists outside the brand mark.

**The One Green Rule.** Reviewed Green is the only filled button colour. Secondary actions are outlined in Strong Hairline.

## Typography

**Display Font:** Schibsted Grotesk (with IBM Plex Sans, sans-serif)
**Body Font:** IBM Plex Sans (with Avenir Next, sans-serif), the app's own face
**Mono Font:** JetBrains Mono (with ui-monospace, monospace), the app's code face

**Character:** A tight, heavy grotesk for headlines over the app's humanist sans; the mono belongs to code and terminal content, never to labels.

### Hierarchy

- **Display** (800, clamp(40px, 6.2vw, 76px), 1.02, -0.035em): the single h1, balanced wrap.
- **Headline** (700, clamp(32px, 4.2vw, 50px), 1.06, -0.03em): section h2s, capped at 20ch, balanced wrap.
- **Title** (600, 17px, 1.3, -0.01em, display face): h3 in the setup row, the "Works with" agent names, word labels in the shortcut list (15px, muted).
- **Lede** (400, clamp(17px, 1.6vw, 19px)): hero paragraph, max 56ch; its strong span steps up to Body Grey at 500.
- **Body** (400, 17px, 1.6; 16px under 720px): section subs at max 62ch, table descriptions at 16px.
- **Body small** (400, 15px): setup copy, fact list, nav links, buttons at 600.
- **Label** (400, 14px or 13px for the table header, sentence case): metadata, captions, footer. No uppercase, no tracking.
- **Code** (JetBrains Mono 400, 15px in the command table, 13.5px inline) and **Terminal** (400, 12.5px, 1.75; 12px on mobile).

### Named Rules

**The Mono Means Code Rule.** JetBrains Mono is used only where the text is a command, path, shortcut or terminal output. Section labels, metadata and headings stay in the sans faces.

## Layout

A single centred column (max 1180px, gutter clamp(16px, 4vw, 40px)). Sections are separated by clamp(72px, 10vw, 128px) of top padding and no background change. Within sections, two-column grids carry copy beside proof: 5fr/7fr for the drift split, 6fr/5fr for the phone section, 1.35fr/1fr for the hero headline beside the download block.

The hero desk is a 40/60 grid in which the terminal overlaps the screenshot by 24px and sits above it. Lists are ruled grids, not cards: the command table (200px / fluid / 170px), the three-column setup row, and a two-column shortcut list (120px key column).

At 900px every split collapses to one column and the command table drops to two columns. At 720px nav links hide (Download stays), table and shortcut rows stack, the table header hides, and the hero capture goes full-bleed with no side borders or radius. Anchor scrolling is offset 72px for the sticky 60px nav.

## Elevation & Depth

Hybrid: the page is flat and tonal, ruled by hairlines, and only the stand-ins for real windows are lifted. The terminal pane, the hero capture and the drift capture share one shadow; the phone captures, which are cut-out device images, use the equivalent drop-shadow filter. Nothing lifts on hover.

### Shadow Vocabulary

- **Window lift** (`box-shadow: 0 18px 40px rgba(0,0,0,.45), 0 2px 6px rgba(0,0,0,.3)`): terminal pane and app screenshots.
- **Device lift** (`filter: drop-shadow(0 18px 30px rgba(0,0,0,.5))`): phone captures.

### Named Rules

**The Only Windows Lift Rule.** A shadow means "this is a real window or device". Tables, buttons, rows and sections stay flat.

## Shapes

Soft, small radii that step with object size: focus ring 4px, keycaps 5px, outline marks 6px, buttons and store badges 8px, windows and the command table 10px. Window dots and status dots are circles. Borders are always 1px hairlines, except the keycap's 2px bottom edge and the 2px status dot ring. Framed panels clip their content (overflow hidden) so captures inherit the 10px corner.

## Components

### Buttons

Quiet and direct, labelled with the action.

- **Shape:** gently rounded (8px).
- **Primary:** Reviewed Green fill with Moss Ink text, 600 at 15px, 11px 16px padding; 16px at 14px 20px in the hero and download band; 14px at 9px 14px in the nav. A 18px download arrow icon leads where the action downloads a file.
- **Hover / Active:** fill brightens to Lit Green; pressing nudges down 1px. Transitions 0.15s.
- **Line:** transparent with a Strong Hairline border and Body Grey text; hover moves the border to Muted Grey and fills Panel Graphite. Used for the Intel build.

### Store badges

Outlined like the line button (8px, Strong Hairline, white 600 text) with an inline SVG platform mark and a small muted "Download on the" / "Get it on" line above the store name.

### Command table

A 10px framed table on Graphite with hairline row dividers and a Panel Graphite header row. Columns: the slash command in white mono, its description in Secondary Grey, and what it writes, right aligned in Muted Grey, Deletion Red for code writes and Agent Blue for comment writes.

### Terminal pane (signature)

A Terminal Black window, 10px, hairline border, window lift. A title bar with three Raised Graphite dots and a mono session title; a 12.5px mono body where the user prompt is white with a green `›`, commands carry a muted `$` and hang-indent wrapped flags, output is muted, and the closing success line is green with the agent name in blue. On scroll into view, lines fade up (4px, 0.35s) at 260ms intervals; then the outline marks over the agent comments in the capture fade in (0.5s, second one 0.18s later). Reduced motion shows the finished state at once.

### Agent outline mark

A 2px Agent Blue outline at 2px offset with a 6px radius, positioned over a comment in a real capture. It points at real content in a screenshot; it never frames page copy.

### Status list

A 12px dot, filled green for reviewed, filled amber for changed after review, a muted ring for not reviewed, followed by a white bold state name and Secondary Grey explanation.

### Keycaps

Raised Graphite with a Strong Hairline border, a 2px bottom edge, 5px radius, white 13px text, min width 26px. Used in the shortcut list beside a white-bold-keyword description.

### Navigation

Sticky, 60px, on Graphite Ground with a transparent bottom border that becomes Hairline after 8px of scroll. Brand mark and wordmark (display 700, 18px, white) on the left; Secondary Grey 15px links that turn white on hover; a compact green Download button at the end. Under 720px only the brand and Download remain.

## Do's and Don'ts

### Do:

- **Do** use the app's dark theme values for every surface; check `apps/desktop/src/renderer/styles/global.css` before adding a neutral.
- **Do** keep Reviewed Green as the only filled button and Agent Blue for anything the agent wrote, including the focus ring.
- **Do** separate content with 1px hairlines and ruled grids.
- **Do** show real app captures in 10px hairline frames with the window lift shadow.
- **Do** set code, commands, shortcuts and terminal output in JetBrains Mono, and everything else in Schibsted Grotesk or IBM Plex Sans.
- **Do** keep motion to the terminal replay and short state transitions, and honour reduced motion.

### Don't:

- **Don't** introduce a colour that is not a review state, a graphite step or white.
- **Don't** add shadows to anything that is not a window or device capture.
- **Don't** set labels, eyebrows or section names in mono or uppercase.
- **Don't** wrap features in uniform cards; use the ruled row and table patterns.
- **Don't** draw outline marks or highlights over anything but real content in a capture.
