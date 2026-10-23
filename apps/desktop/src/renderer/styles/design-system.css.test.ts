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
