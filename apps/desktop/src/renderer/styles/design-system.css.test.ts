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

describe("buttons", () => {
  const shared = "styles/buttons.module.css";
  const composesFrom = (name: string) =>
    `composes: ${name} from "./styles/buttons.module.css";`;

  it("keeps one button recipe with hover states", () => {
    const buttons = sheet(shared);
    const base = rule(buttons, ".button");
    for (const declaration of [
      "height: 28px;",
      "border-radius: 6px;",
      "font-weight: 600;",
      "padding: 0 12px;"
    ]) {
      expect(base).toContain(declaration);
    }
    for (const variant of [".primaryButton", ".secondaryButton", ".ghostButton"]) {
      expect(rule(buttons, variant)).toContain("composes: button;");
      expect(rule(buttons, `${variant}:hover:not(:disabled)`)).toContain("background:");
    }
    expect(rule(buttons, ".primaryButton:hover:not(:disabled)")).toContain("color-mix(");
    expect(rule(buttons, ".secondaryButton:hover:not(:disabled)")).toContain(
      "border-color: var(--border-strong);"
    );
    const icon = rule(buttons, ".iconButton");
    expect(icon).toContain("width: 28px;");
    expect(icon).toContain("height: 28px;");
    expect(icon).toContain("background: transparent;");
    expect(rule(buttons, ".iconButton:hover:not(:disabled)")).toContain(
      "background: var(--hover);"
    );
  });

  it("makes component buttons compose the shared recipe instead of copying it", () => {
    for (const [name, css] of moduleSheets) {
      if (name === shared) continue;
      for (const { selector, body } of rules(css)) {
        for (const variant of [
          "primaryButton",
          "secondaryButton",
          "ghostButton",
          "iconButton"
        ]) {
          if (selector === `.${variant}`) {
            expect(body.trim(), `${name} ${selector}`).toBe(composesFrom(variant));
          }
        }
        expect(selector, `${name} copies the button recipe`).not.toMatch(
          /^\.primaryButton,\s*\.secondaryButton/
        );
      }
    }
  });

  it("brings one-off buttons onto the standard", () => {
    const expectations: [string, string, string][] = [
      ["review-notes-panel.module.css", ".addButton", "secondaryButton"],
      ["file-list.module.css", ".diffTargetUseButton", "secondaryButton"],
      ["file-list.module.css", ".railButton", "iconButton"],
      ["settings-panel.module.css", ".companionRevokeButton", "ghostButton"],
      ["project-tab-bar.module.css", ".worktreesButton", "ghostButton"],
      ["project-tab-bar.module.css", ".tabIconButton", "iconButton"],
      ["App.module.css", ".errorBannerClose", "iconButton"]
    ];
    for (const [name, selector, variant] of expectations) {
      expect(rule(sheet(name), selector), `${name} ${selector}`).toContain(
        composesFrom(variant)
      );
    }
    for (const component of [
      "dropped-repository-preview.tsx",
      "repository-picker.tsx",
      "worktree-label-dialog.tsx",
      "worktree-picker.tsx"
    ]) {
      expect(read(join(rendererDir, component)), component).toContain(
        'from "./styles/buttons.module.css"'
      );
    }
    for (const name of [
      "dropped-repository-preview.module.css",
      "repository-picker.module.css",
      "worktree-label-dialog.module.css",
      "worktree-picker.module.css"
    ]) {
      for (const { selector } of rules(sheet(name))) {
        expect(selector, name).not.toMatch(/ button/);
      }
    }
  });

  it("gives the rail files and the editor picker the shared hover", () => {
    expect(
      rule(sheet("file-list.module.css"), ".railFile:hover:not(:disabled)")
    ).toContain("background: var(--hover);");
    expect(
      rule(sheet("settings-panel.module.css"), ".editorPickerButton:hover:not(:disabled)")
    ).toContain("background: var(--hover);");
  });
});

describe("fields", () => {
  it("draws every single-line field the same way", () => {
    const fields: [string, string][] = [
      ["settings-panel.module.css", '.settingRow input[type="text"]'],
      ["settings-panel.module.css", ".settingRow select"],
      ["settings-panel.module.css", ".editorPickerButton"],
      ["settings-panel.module.css", ".cliInstallDetails input"],
      ["worktree-label-dialog.module.css", ".input"],
      ["file-list.module.css", ".diffTargetSearch"]
    ];
    for (const [name, selector] of fields) {
      const body = rule(sheet(name), selector);
      for (const declaration of [
        "height: 32px;",
        "border: 1px solid var(--border);",
        "border-radius: 6px;",
        "font-size: 12.5px;"
      ]) {
        expect(body, `${name} ${selector}`).toContain(declaration);
      }
      expect(body, `${name} ${selector}`).toMatch(/background(-color)?: var\(--bg\);/);
      expect(body, `${name} ${selector}`).toMatch(/padding: 0 (30px 0 )?10px;/);
    }
  });

  it("pads every textarea the same way", () => {
    const textareas: [string, string][] = [
      ["file-comments.module.css", ".textarea"],
      ["review-notes-panel.module.css", ".textarea"],
      ["review-comment-annotation.module.css", ".reviewCommentTextarea"]
    ];
    for (const [name, selector] of textareas) {
      const body = rule(sheet(name), selector);
      expect(body, `${name} ${selector}`).toContain("padding: 9px 10px;");
      expect(body, `${name} ${selector}`).toContain("border-radius: 6px;");
      expect(body, `${name} ${selector}`).toContain("background: var(--bg);");
    }
  });
});

describe("menus", () => {
  const menus: [string, string][] = [
    ["context-menu.module.css", ".menu"],
    ["project-tab-bar.module.css", ".repositoryMenu"],
    ["settings-panel.module.css", ".editorPickerMenu"],
    ["file-list.module.css", ".diffTargetPopover"]
  ];
  const items: [string, string][] = [
    ["context-menu.module.css", ".menu button"],
    ["project-tab-bar.module.css", ".repositoryMenu button"],
    ["settings-panel.module.css", ".editorPickerOption"],
    ["file-list.module.css", ".diffTargetOption"]
  ];

  it("draws every menu surface with one recipe", () => {
    for (const [name, selector] of menus) {
      const body = rule(sheet(name), selector);
      for (const declaration of [
        "border: 1px solid var(--border-strong);",
        "border-radius: 8px;",
        "background: var(--panel-2);",
        "box-shadow: var(--shadow-pop);"
      ]) {
        expect(body, `${name} ${selector}`).toContain(declaration);
      }
      if (selector !== ".diffTargetPopover") {
        expect(body, `${name} ${selector}`).toContain("padding: 5px;");
      }
    }
  });

  it("sizes menu items the same and hovers them with --hover", () => {
    for (const [name, selector] of items) {
      const body = rule(sheet(name), selector);
      for (const declaration of [
        "min-height: 30px;",
        "border-radius: 4px;",
        "font-size: 12.5px;",
        "padding: 0 9px;"
      ]) {
        expect(body, `${name} ${selector}`).toContain(declaration);
      }
      const hover = rules(sheet(name)).find(
        (candidate) =>
          candidate.selector.startsWith(`${selector}:hover`) &&
          candidate.body.includes("background")
      );
      expect(hover?.body, `${name} ${selector}:hover`).toContain(
        "background: var(--hover);"
      );
    }
    expect(
      rule(sheet("command-palette-view.module.css"), ".paletteItem:hover:not(:disabled)")
    ).toContain("background: var(--hover);");
  });
});

describe("cards, toasts and dialogs", () => {
  it("rounds and pads cards and toasts the same way", () => {
    const cards: [string, string, boolean][] = [
      ["app-status-views.module.css", ".driftToast", false],
      ["app-status-views.module.css", ".simpleToast", true],
      ["app-status-views.module.css", ".recentBox", true],
      ["app-status-views.module.css", ".toastBody", true],
      ["file-comments.module.css", ".card", true],
      ["review-comment-annotation.module.css", ".reviewCommentCard", true],
      ["review-notes-panel.module.css", ".panel", true],
      ["image-diff.module.css", ".imageStage", false],
      ["App.module.css", ".errorBanner", false]
    ];
    for (const [name, selector, padded] of cards) {
      const body = rule(sheet(name), selector);
      if (selector !== ".toastBody") {
        expect(body, `${name} ${selector}`).toContain("border-radius: 8px;");
      }
      if (padded) expect(body, `${name} ${selector}`).toContain("padding: 10px;");
    }
  });

  it("gives every dialog the palette radius, overlay and title size", () => {
    const settings = sheet("settings-panel.module.css");
    for (const panel of [".companionStorePanel", ".companionPairingPanel"]) {
      expect(rule(settings, panel)).toContain("border-radius: 12px;");
    }
    for (const overlay of [".companionStoreDialog", ".companionPairingDialog"]) {
      expect(rule(settings, overlay)).toContain("background: var(--overlay);");
      expect(rule(settings, overlay)).toContain("backdrop-filter: blur(2px);");
    }
    for (const title of [".companionStoreHeader h3", ".companionPairingPanel h3"]) {
      expect(rule(settings, title)).toContain("font-size: 15px;");
      expect(rule(settings, title)).toContain("font-weight: 600;");
    }
    for (const [name, css] of allSheets()) {
      expect(css, name).not.toContain("--overlay-soft");
    }
  });
});

describe("segmented controls and chips", () => {
  it("shares one segmented control shape", () => {
    const groups: [string, string, string, string][] = [
      [
        "diff-toolbar.module.css",
        ".diffSideSegmented",
        ".diffSideSegmented button",
        "24px"
      ],
      [
        "settings-panel.module.css",
        ".settingsSegmented",
        ".settingsSegmented button",
        "28px"
      ],
      ["file-list.module.css", ".diffTargetTabs", ".diffTargetTab", "28px"]
    ];
    for (const [name, outer, inner, height] of groups) {
      const css = sheet(name);
      expect(rule(css, outer), `${name} ${outer}`).toContain("border-radius: 8px;");
      expect(rule(css, outer), `${name} ${outer}`).toContain("padding: 2px;");
      expect(rule(css, inner), `${name} ${inner}`).toContain("border-radius: 6px;");
      expect(rule(css, inner), `${name} ${inner}`).toContain(`height: ${height};`);
    }
  });

  it("draws count badges as small sans pills with token tints", () => {
    const badges: [string, string][] = [
      ["file-list.module.css", ".commentBadge"],
      ["diff-toolbar.module.css", ".reportButtonCount"]
    ];
    for (const [name, selector] of badges) {
      const body = rule(sheet(name), selector);
      expect(body, selector).toContain("height: 18px;");
      expect(body, selector).toContain("border-radius: 999px;");
      expect(body, selector).toContain("background: var(--accent-soft);");
      expect(body, selector).not.toContain("color-mix");
      expect(body, selector).not.toContain("--font-mono");
      expect(body, selector).not.toContain("font-weight: 700;");
    }
    expect(rule(sheet("file-list.module.css"), ".commentBadge")).toContain(
      "border: 1px solid var(--accent-line);"
    );
    expect(rule(sheet("diff-toolbar.module.css"), ".reportButtonCount")).toContain(
      "font-weight: 600;"
    );
  });

  it("draws label chips 20px high with a 4px radius", () => {
    const chips: [string, string][] = [
      ["diff-toolbar.module.css", ".diffChangedPill"],
      ["command-palette-view.module.css", ".paletteScope"]
    ];
    for (const [name, selector] of chips) {
      const body = rule(sheet(name), selector);
      expect(body, selector).toContain("height: 20px;");
      expect(body, selector).toContain("border-radius: 4px;");
      expect(body, selector).toContain("padding: 0 6px;");
    }
  });
});

describe("type scale", () => {
  const scale = new Set([
    "11px",
    "11.5px",
    "12px",
    "12.5px",
    "13px",
    "15px",
    "18px",
    "20px"
  ]);

  it("keeps every font size on the scale", () => {
    for (const [name, css] of allSheets()) {
      for (const { selector, body } of rules(css)) {
        // The phone pairing code is a display number read across the room.
        if (selector === ".companionCodeBlock strong") continue;
        for (const match of body.matchAll(/font-size: ([^;]+);/g)) {
          expect(scale.has(match[1]!), `${name} ${selector} ${match[1]!}`).toBe(true);
        }
      }
    }
  });

  // Only IBM Plex Sans 400-700 and JetBrains Mono 400-600 are bundled.
  it("only uses font weights that are loaded", () => {
    for (const [name, css] of allSheets()) {
      for (const { selector, body } of rules(css)) {
        const weight = /font-weight: ([^;]+);/.exec(body)?.[1];
        if (weight === undefined) continue;
        expect(["400", "500", "600", "700"], `${name} ${selector}`).toContain(weight);
        if (body.includes("var(--font-mono)")) {
          expect(weight, `${name} ${selector} mono`).not.toBe("700");
        }
      }
    }
  });

  it("styles every uppercase section label the same way", () => {
    for (const [name, css] of moduleSheets) {
      for (const { selector, body } of rules(css)) {
        if (!body.includes("text-transform: uppercase;")) continue;
        expect(body, `${name} ${selector}`).toContain("font-size: 11px;");
        expect(body, `${name} ${selector}`).toContain("font-weight: 600;");
        expect(body, `${name} ${selector}`).toContain("letter-spacing: 0;");
      }
    }
  });

  it("rounds icon tiles by 6px and inline code like kbd", () => {
    const tiles: [string, string][] = [
      ["command-palette-view.module.css", ".paletteItemIcon"],
      ["settings-panel.module.css", ".editorPickerIcon"],
      ["settings-panel.module.css", ".companionDeviceIcon"],
      ["app-status-views.module.css", ".updateIcon"],
      ["app-status-views.module.css", ".toastIcon"]
    ];
    for (const [name, selector] of tiles) {
      expect(rule(sheet(name), selector), `${name} ${selector}`).toContain(
        "border-radius: 6px;"
      );
    }
    expect(rule(sheet("settings-panel.module.css"), ".companionSteps code")).toContain(
      "border-radius: 4px;"
    );
  });
});

describe("icons", () => {
  const components = readdirSync(rendererDir).filter(
    (name) => name.endsWith(".tsx") && !name.includes(".test.")
  );

  function lucideElements(source: string): { name: string; props: string }[] {
    const imports = /import \{([^}]+)\} from "lucide-react";/.exec(source);
    if (!imports) return [];
    const names = imports[1]!
      .split(",")
      .map((name) => name.trim())
      .filter((name) => /^[A-Z]/.test(name));
    return names.flatMap((name) =>
      [...source.matchAll(new RegExp(`<${name}\\b([^>]*)/>`, "g"))].map((match) => ({
        name,
        props: match[1]!
      }))
    );
  }

  it("draws every lucide icon with the 1.4 stroke", () => {
    let count = 0;
    for (const component of components) {
      for (const { name, props } of lucideElements(read(join(rendererDir, component)))) {
        count += 1;
        // Spread props are covered by the strokeWidth scan below.
        if (props.includes("{...")) continue;
        expect(props, `${component} <${name}>`).toContain("strokeWidth={1.4}");
      }
    }
    expect(count).toBeGreaterThan(50);
    for (const component of components) {
      const source = read(join(rendererDir, component));
      for (const match of source.matchAll(/strokeWidth(?:=\{|: )([^},\n]+)/g)) {
        expect(match[1], `${component} strokeWidth`).toBe("1.4");
      }
    }
  });

  it("draws close icons at 14px", () => {
    for (const component of components) {
      for (const { name, props } of lucideElements(read(join(rendererDir, component)))) {
        if (name !== "X") continue;
        expect(props, `${component} <X>`).toContain("size={14}");
      }
    }
  });
});

describe("hit targets", () => {
  it("makes collapsed-rail files at least 24px square", () => {
    const railFile = rule(sheet("file-list.module.css"), ".railFile");
    expect(railFile).toContain("width: 24px;");
    expect(railFile).toContain("height: 24px;");
  });
});
