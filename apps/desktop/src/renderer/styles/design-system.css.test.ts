import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// One visual system across the renderer: these tests read the stylesheets and pin the
// shared tokens and recipes the UI audit settled on, so a component cannot drift back
// to its own copy of a font stack, button, field, menu or focus ring.

const stylesDir = dirname(fileURLToPath(import.meta.url));
const rendererDir = join(stylesDir, "..");

function read(path: string): string {
  return readFileSync(path, "utf8");
}

const globalCss = read(join(stylesDir, "global.css"));

const moduleSheets: ReadonlyMap<string, string> = new Map(
  [
    ...readdirSync(rendererDir)
      .filter((name) => name.endsWith(".module.css"))
      .map((name) => [name, read(join(rendererDir, name))] as const),
    ...readdirSync(stylesDir)
      .filter((name) => name.endsWith(".module.css"))
      .map((name) => [`styles/${name}`, read(join(stylesDir, name))] as const)
  ].sort(([a], [b]) => a.localeCompare(b))
);

function sheet(name: string): string {
  const css = moduleSheets.get(name);
  if (css === undefined) throw new Error(`Missing stylesheet ${name}`);
  return css;
}

/** The body of the first rule whose selector list is exactly `selector`. */
function rule(css: string, selector: string): string {
  const start = css.indexOf(`\n${selector} {`);
  const at = start < 0 && css.startsWith(`${selector} {`) ? 0 : start;
  if (at < 0) throw new Error(`Missing rule ${selector}`);
  return css.slice(at, css.indexOf("}", at));
}

function rootBlock(theme: "dark" | "light"): string {
  return theme === "dark"
    ? rule(globalCss, ":root")
    : rule(globalCss, ':root[data-theme="light"]');
}

function allSheets(): [string, string][] {
  return [["styles/global.css", globalCss], ...moduleSheets];
}

describe("font tokens", () => {
  it("defines the sans and mono stacks once on :root", () => {
    const root = rootBlock("dark");
    expect(root).toContain('--font-sans: "IBM Plex Sans", "Avenir Next", sans-serif;');
    expect(root).toContain('--font-mono: "JetBrains Mono", ui-monospace, monospace;');
    expect(root).toContain("font-family: var(--font-sans);");
  });

  it("never repeats a font stack outside the token definitions", () => {
    for (const [name, css] of allSheets()) {
      const withoutTokens = css
        .replace(/--font-sans: [^;]+;/, "")
        .replace(/--font-mono: [^;]+;/, "");
      expect(withoutTokens, name).not.toContain("JetBrains Mono");
      expect(withoutTokens, name).not.toContain("IBM Plex Sans");
    }
    const diffsRenderer = read(join(rendererDir, "diffs-renderer.ts"));
    expect(diffsRenderer).not.toContain('"JetBrains Mono"');
    expect(diffsRenderer).not.toContain('"IBM Plex Sans"');
  });
});

describe("custom properties", () => {
  const sources = readdirSync(rendererDir)
    .filter((name) => /\.tsx?$/.test(name) && !name.includes(".test."))
    .map((name) => read(join(rendererDir, name)))
    .join("\n");

  // A var() of an undefined property makes the whole declaration invalid at computed
  // time, which is how the diff-target popover lost its shadow.
  it("only uses properties that something defines", () => {
    const defined = new Set<string>();
    for (const [, css] of allSheets()) {
      for (const match of css.matchAll(/(--[\w-]+)\s*:/g)) defined.add(match[1]!);
    }
    for (const match of sources.matchAll(/["'`](--[\w-]+)["'`]/g)) defined.add(match[1]!);

    for (const [name, css] of allSheets()) {
      for (const match of css.matchAll(/var\((--[\w-]+)/g)) {
        expect(defined.has(match[1]!), `${name} uses ${match[1]!}`).toBe(true);
      }
    }
  });

  it("gives the diff-target popover and commit tooltip the shared shadows", () => {
    const fileList = sheet("file-list.module.css");
    expect(rule(fileList, ".diffTargetPopover")).toContain(
      "box-shadow: var(--shadow-pop);"
    );
    expect(rule(fileList, ".diffTargetCommitTooltip")).toContain(
      "box-shadow: var(--shadow-md);"
    );
  });

  it("draws every error in the danger colour", () => {
    expect(rootBlock("dark")).toContain("--danger: #ff7a70;");
    expect(rootBlock("light")).toContain("--danger: #a00e1b;");
    const settings = sheet("settings-panel.module.css");
    expect(rule(settings, ".companionError")).toContain("color: var(--danger);");
    expect(rule(settings, ".cliInstallError")).toContain("color: var(--danger);");
    expect(rule(sheet("worktree-label-dialog.module.css"), ".error")).toContain(
      "color: var(--danger);"
    );
    expect(rule(sheet("App.module.css"), ".errorBanner")).toContain(
      "border: 1px solid var(--danger);"
    );
  });
});

describe("accent text contrast", () => {
  // Dark --accent is 4.07:1 on the panel and 2.29:1 on the selected row, too low for
  // 11px text, so accent-coloured text uses --accent-text instead.
  it("defines a readable accent for text in both themes", () => {
    expect(rootBlock("dark")).toContain("--accent-text: #5da9ff;");
    expect(rootBlock("light")).toContain("--accent-text: var(--accent);");
  });

  it("colours small accent text with --accent-text", () => {
    const checks: [string, string][] = [
      ["file-list.module.css", ".commentBadge,\n.commentMeta"],
      ["diff-toolbar.module.css", ".commentBadge,\n.commentMeta"],
      ["command-palette-view.module.css", ".paletteScope"],
      ["diff-toolbar.module.css", ".reportButtonCount"]
    ];
    for (const [name, selector] of checks) {
      expect(rule(sheet(name), selector), `${name} ${selector}`).toContain(
        "color: var(--accent-text);"
      );
    }
  });

  it("keeps the selected file row's secondary text readable on --selected", () => {
    const fileList = sheet("file-list.module.css");
    expect(
      rule(
        fileList,
        '.fileItem[data-selected="true"] .commentBadge,\n.fileItem[data-selected="true"] .commentMeta'
      )
    ).toContain("color: var(--text);");
    expect(rule(fileList, '.fileItem[data-selected="true"] .fileDir')).toContain(
      "color: var(--text-2);"
    );
  });
});

/** Every innermost `selector { body }` rule in a sheet, @media contents included. */
function rules(css: string): { selector: string; body: string }[] {
  const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, "");
  return [...withoutComments.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((match) => ({
    selector: match[1]!.trim(),
    body: match[2]!
  }));
}

describe("focus ring", () => {
  it("defines one focus ring and applies it to every native control", () => {
    expect(rootBlock("dark")).toContain("--focus-ring: 2px solid var(--accent);");
    const global = rule(
      globalCss,
      "button:focus-visible,\ninput:focus-visible,\nselect:focus-visible,\ntextarea:focus-visible,\nsummary:focus-visible,\na:focus-visible"
    );
    expect(global).toContain("outline: var(--focus-ring);");
    expect(global).toContain("outline-offset: 2px;");
  });

  // Rings drawn with --accent-line or a 2px --accent-soft halo measured under 3:1.
  it("draws component focus states with the shared ring", () => {
    for (const [name, css] of moduleSheets) {
      for (const { selector, body } of rules(css)) {
        expect(selector, `${name} uses :focus instead of :focus-visible`).not.toMatch(
          /:focus(?![-\w])/
        );
        if (!selector.includes(":focus-visible")) continue;
        if (selector.includes("[data-dialog-focus-restored]")) continue;
        expect(body, `${name} ${selector}`).toContain("outline: var(--focus-ring);");
        expect(body, `${name} ${selector}`).toMatch(/outline-offset: -?2px;/);
        expect(body, `${name} ${selector}`).not.toContain("box-shadow");
      }
    }
  });
});

describe("disabled state", () => {
  it("dims every disabled control by the same amount", () => {
    expect(rootBlock("dark")).toContain("--disabled-opacity: 0.52;");
    for (const [name, css] of moduleSheets) {
      for (const { selector, body } of rules(css)) {
        if (!/:disabled|\[aria-disabled/.test(selector)) continue;
        const opacity = /opacity: ([^;]+);/.exec(body);
        if (opacity) {
          expect(opacity[1], `${name} ${selector}`).toBe("var(--disabled-opacity)");
        }
      }
    }
  });
});
