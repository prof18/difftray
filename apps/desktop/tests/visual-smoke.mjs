import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";

import { _electron as electron } from "playwright";

const require = createRequire(import.meta.url);
const cwd = path.resolve(import.meta.dirname, "..");
const artifactsDir = path.resolve(cwd, "../../artifacts/screenshots");
const executablePath = require("electron");
const repoPath = await createChangedRepository();
const userDataPath = await mkdtemp(path.join(tmpdir(), "difftray-user-data-"));

await mkdir(artifactsDir, { recursive: true });

const app = await electron.launch({
  args: [path.resolve(cwd, "dist/main/index.cjs")],
  cwd,
  env: {
    ...process.env,
    DIFFTRAY_BOOT_PROJECT: repoPath,
    DIFFTRAY_USER_DATA_DIR: userDataPath
  },
  executablePath
});

try {
  const window = await app.firstWindow();
  await window.waitForLoadState("domcontentloaded");
  await window.locator("text=Difftray").first().waitFor({ timeout: 10_000 });
  await window.getByRole("button", { name: /visual-repo/ }).click();
  await window
    .getByRole("button", { name: /tracked\.txt modified/ })
    .waitFor({ timeout: 10_000 });
  await expectMissing(window, "button", "schema.generated.ts");
  await window.getByRole("button", { name: "Mark reviewed" }).waitFor({
    timeout: 10_000
  });
  await window.getByRole("button", { name: "Project settings" }).click();
  await window.getByLabel("Show generated files", { exact: true }).check();
  await window.getByRole("combobox", { name: /Appearance/ }).selectOption("light");
  await window.getByRole("combobox", { name: /Editor/ }).selectOption("custom");
  await window.getByRole("textbox", { exact: true, name: "Command" }).fill("code");
  await window
    .getByRole("textbox", { exact: true, name: "Arguments" })
    .fill("--goto {path}:{line}");
  await window.screenshot({
    fullPage: true,
    path: path.join(artifactsDir, "desktop-settings.png")
  });
  await window.getByRole("button", { name: "Save" }).click();
  await window
    .getByRole("button", { name: /schema\.generated\.ts/ })
    .waitFor({ timeout: 10_000 });
  await window.getByRole("button", { name: "Project settings" }).click();
  await expectChecked(window, "Show generated files");
  await expectComboboxValue(window, /Appearance/, "light");
  await expectComboboxValue(window, /Editor/, "custom");
  await expectValue(window, "Command", "code");
  await expectValue(window, "Arguments", "--goto {path}:{line}");
  await window.getByRole("button", { name: "Close settings" }).click();
  await window.getByRole("button", { name: "Hide sidebar" }).click();
  await expectMissing(window, "button", "visual-repo");
  await window.getByRole("button", { name: "Show sidebar" }).click();
  await window.getByRole("button", { name: /visual-repo/ }).waitFor({
    timeout: 10_000
  });
  await window.keyboard.press("f");
  await expectFocused(window, "input[placeholder='Filter files']");
  await window.getByPlaceholder("Filter files").fill("tracked");
  await window.keyboard.press("Escape");
  await window.getByRole("button", { name: /tracked\.txt modified/ }).click();
  await window.screenshot({
    fullPage: true,
    path: path.join(artifactsDir, "desktop-review-workflow.png")
  });
  await window.keyboard.press("Space");
  await window.getByRole("button", { name: "Reviewed" }).waitFor({
    timeout: 10_000
  });
  await expectEnabled(window, "button", "Reviewed");
  await window.getByRole("button", { name: "1 reviewed" }).waitFor({
    timeout: 10_000
  });
  await window.getByLabel("Diff preview").click();
  await window.keyboard.press("KeyU");
  await window.getByRole("button", { name: "Mark reviewed" }).waitFor({
    timeout: 10_000
  });
  await expectEnabled(window, "button", "Mark reviewed");
  await window.getByRole("button", { name: /tracked\.txt modified/ }).click();
  await window.keyboard.press("Space");
  await window.getByRole("button", { exact: true, name: "Reviewed" }).waitFor({
    timeout: 10_000
  });
  await window.screenshot({
    fullPage: true,
    path: path.join(artifactsDir, "desktop-review-marked.png")
  });
  await writeFile(path.join(repoPath, "tracked.txt"), "before\nafter\nagain\n", "utf8");
  await window.getByRole("button", { name: "Refresh project" }).click();
  await window
    .getByRole("button", { name: /tracked\.txt modified .* changed after review/ })
    .waitFor({ timeout: 10_000 });
  await window.screenshot({
    fullPage: true,
    path: path.join(artifactsDir, "desktop-review-invalidated.png")
  });
} finally {
  await app.close();
}

async function createChangedRepository() {
  const parent = await mkdtemp(path.join(tmpdir(), "difftray-visual-"));
  const repo = path.join(parent, "visual-repo");

  await mkdir(repo);
  git(repo, ["init", "--initial-branch=main"]);
  git(repo, ["config", "user.email", "visual@example.invalid"]);
  git(repo, ["config", "user.name", "Visual Smoke"]);
  await writeFile(path.join(repo, "tracked.txt"), "before\n", "utf8");
  git(repo, ["add", "tracked.txt"]);
  git(repo, ["commit", "-m", "Initial"]);
  await writeFile(path.join(repo, "tracked.txt"), "before\nafter\n", "utf8");
  await writeFile(
    path.join(repo, "schema.generated.ts"),
    "export const value = 1;\n",
    "utf8"
  );

  return repo;
}

function git(cwd, args) {
  execFileSync("git", args, {
    cwd,
    stdio: "ignore"
  });
}

async function expectFocused(window, selector) {
  await window.waitForFunction((cssSelector) => {
    return document.activeElement === document.querySelector(cssSelector);
  }, selector);
}

async function expectEnabled(window, role, name) {
  await window.waitForFunction(
    ({ roleName, accessibleName }) => {
      const elements = [...document.querySelectorAll(roleName)];

      return elements.some(
        (element) =>
          element.textContent?.trim() === accessibleName &&
          !element.hasAttribute("disabled")
      );
    },
    { accessibleName: name, roleName: role }
  );
}

async function expectMissing(window, role, text) {
  await window.waitForFunction(
    ({ roleName, accessibleText }) => {
      return [...document.querySelectorAll(roleName)].every(
        (element) => !element.textContent?.includes(accessibleText)
      );
    },
    { accessibleText: text, roleName: role }
  );
}

async function expectChecked(window, label) {
  const checked = await window.getByLabel(label, { exact: true }).isChecked();

  if (!checked) {
    throw new Error(`Expected ${label} to be checked`);
  }
}

async function expectValue(window, label, expectedValue) {
  const actualValue = await window.getByLabel(label, { exact: true }).inputValue();

  if (actualValue !== expectedValue) {
    throw new Error(`Expected ${label} to be ${expectedValue}, got ${actualValue}`);
  }
}

async function expectComboboxValue(window, name, expectedValue) {
  const actualValue = await window.getByRole("combobox", { name }).inputValue();

  if (actualValue !== expectedValue) {
    throw new Error(`Expected combobox to be ${expectedValue}, got ${actualValue}`);
  }
}
