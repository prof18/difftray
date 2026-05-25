import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";

import { openStorage } from "@difftray/storage";
import { _electron as electron } from "playwright";

const require = createRequire(import.meta.url);
const cwd = path.resolve(import.meta.dirname, "..");
const artifactsDir = path.resolve(cwd, "../../artifacts/screenshots");
const executablePath = require("electron");
const repoPath = await createChangedRepository();
const secondaryRepoPath = await createChangedRepository("visual-secondary-repo");
const userDataPath = await mkdtemp(path.join(tmpdir(), "difftray-user-data-"));

await mkdir(artifactsDir, { recursive: true });
await seedRecentProject(userDataPath, secondaryRepoPath);

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
  await window
    .getByRole("button", { name: /tracked\.txt modified/ })
    .waitFor({ timeout: 10_000 });
  await expectProjectTabSummary(window, "visual-secondary-repo", "0/1", "pending");
  await window.locator('[data-open-inline="true"]').waitFor({ timeout: 10_000 });
  await expectProjectTabOrder(window, ["visual-repo", "visual-secondary-repo"]);
  await window
    .locator('[data-project-tab-name="visual-repo"][draggable="true"]')
    .waitFor({ timeout: 10_000 });
  await window
    .locator('[data-project-tab-name="visual-secondary-repo"] button')
    .first()
    .click();
  await window
    .locator('[data-project-tab-name="visual-secondary-repo"][data-active="true"]')
    .waitFor({ timeout: 10_000 });
  await expectProjectTabsEnabled(window);
  await writeFile(
    path.join(repoPath, "tracked.txt"),
    "before\nbranch\nafter\ninactive tab update\n",
    "utf8"
  );
  await window.locator('[data-project-tab-name="visual-repo"] button').first().click();
  await window
    .locator('[data-project-tab-name="visual-repo"][data-active="true"]')
    .waitFor({ timeout: 10_000 });
  await window.getByRole("button", { name: /tracked\.txt modified/ }).click();
  await expectFileStats(window, "tracked.txt", "+2", "-0");
  await expectMissing(window, "button", "schema.generated.ts");
  await window.getByRole("button", { name: "Mark reviewed" }).waitFor({
    timeout: 10_000
  });
  await window.getByRole("button", { name: "Project settings" }).click();
  await window.getByLabel("Show generated files", { exact: true }).check();
  await window.getByRole("combobox", { name: /Appearance/ }).selectOption("light");
  await window.getByRole("button", { name: /Editor:/ }).click();
  await window.screenshot({
    fullPage: true,
    path: path.join(artifactsDir, "desktop-editor-picker.png")
  });
  await window.getByRole("button", { name: /Editor:/ }).click();
  await window.getByRole("listbox", { name: "Editor" }).waitFor({
    state: "detached",
    timeout: 10_000
  });
  await window.screenshot({
    fullPage: true,
    path: path.join(artifactsDir, "desktop-settings.png")
  });
  await window.getByRole("button", { name: "Save" }).click();
  await window
    .getByRole("button", { name: /schema\.generated\.ts/ })
    .waitFor({ timeout: 10_000 });
  await window.getByRole("button", { name: /schema\.generated\.ts/ }).click();
  await window.locator('[data-diff-layout="single"]').waitFor({ timeout: 10_000 });
  await window.getByRole("button", { name: "Project settings" }).click();
  await expectChecked(window, "Show generated files");
  await expectComboboxValue(window, /Appearance/, "light");
  await expectEditorChoice(window, "System default");
  await window.getByRole("button", { name: "Close settings" }).click();
  await window.getByLabel("Compare against branch").selectOption("main");
  await window.getByText("against main").waitFor({ timeout: 10_000 });
  await expectComboboxValue(window, "Compare against branch", "main");
  await window.getByRole("button", { name: "Reset to Git changes" }).click();
  await window
    .getByRole("button", { name: /schema\.generated\.ts/ })
    .waitFor({ timeout: 10_000 });
  await expectComboboxValue(window, "Compare against branch", "");
  await expectButtonEnabled(window, "Mark reviewed");
  await window.getByRole("button", { name: "Hide file list" }).click();
  await window.getByRole("button", { name: "Show file list" }).waitFor({
    timeout: 10_000
  });
  await window.keyboard.press("Meta+1");
  await window.getByRole("button", { name: "Hide file list" }).waitFor({
    timeout: 10_000
  });
  await window.getByRole("button", { name: /tracked\.txt modified/ }).click();
  await window.keyboard.press("Meta+KeyK");
  await window.getByRole("dialog", { name: "Command palette" }).waitFor({
    timeout: 10_000
  });
  await window.keyboard.type("tracked");
  await window.keyboard.press("Enter");
  await window.getByRole("button", { name: /tracked\.txt modified/ }).click();
  await expectSelectedFile(window, "tracked.txt");
  await window.getByRole("button", { name: /context\.txt modified/ }).click();
  await window.locator("[data-unmodified-lines]").first().click();
  await window.getByText("context line 1", { exact: true }).first().waitFor({
    timeout: 10_000
  });
  await window.screenshot({
    fullPage: true,
    path: path.join(artifactsDir, "desktop-expanded-context.png")
  });
  await window.getByRole("button", { name: /tracked\.txt modified/ }).click();
  await expectSelectedFile(window, "tracked.txt");
  await window.screenshot({
    fullPage: true,
    path: path.join(artifactsDir, "desktop-review-workflow.png")
  });
  await window.getByRole("button", { name: "Mark reviewed" }).click();
  await expectFileReviewState(window, "tracked.txt", "reviewed");
  await window.getByRole("button", { name: /tracked\.txt modified/ }).click();
  await window.getByRole("button", { name: "Unmark reviewed" }).waitFor({
    timeout: 10_000
  });
  await window.getByRole("button", { name: "Unmark reviewed" }).click();
  await window.getByRole("button", { name: "Mark reviewed" }).waitFor({
    timeout: 10_000
  });
  await window.getByRole("button", { name: "Mark reviewed" }).click();
  await expectFileReviewState(window, "tracked.txt", "reviewed");
  await window.waitForTimeout(250);
  await window.screenshot({
    fullPage: true,
    path: path.join(artifactsDir, "desktop-review-marked.png")
  });
  await writeFile(
    path.join(repoPath, "tracked.txt"),
    "before\nbranch\nafter\nagain\n",
    "utf8"
  );
  await window.evaluate(() => {
    window.dispatchEvent(new Event("focus"));
  });
  await window
    .getByRole("button", { name: /tracked\.txt modified.*changed after review/ })
    .waitFor({ timeout: 10_000 });
  await window.getByText("reviewed files drifted").waitFor({ timeout: 10_000 });
  await window.screenshot({
    fullPage: true,
    path: path.join(artifactsDir, "desktop-review-invalidated.png")
  });
  await window.getByRole("button", { name: "Close repository" }).click();
  await window
    .getByRole("button", { name: /visual-secondary-repo/ })
    .waitFor({ timeout: 10_000 });
  await window.getByRole("button", { name: "Close repository" }).click();
  await window.getByRole("heading", { name: "No repository open" }).waitFor({
    timeout: 10_000
  });
} finally {
  await app.close();
}

async function createChangedRepository(name = "visual-repo") {
  const parent = await mkdtemp(path.join(tmpdir(), "difftray-visual-"));
  const repo = path.join(parent, name);
  const includeContextFile = name === "visual-repo";
  const contextLines = Array.from(
    { length: 20 },
    (_, index) => `context line ${index + 1}`
  );

  await mkdir(repo);
  git(repo, ["init", "--initial-branch=main"]);
  git(repo, ["config", "user.email", "visual@example.invalid"]);
  git(repo, ["config", "user.name", "Visual Smoke"]);
  await writeFile(path.join(repo, "tracked.txt"), "before\n", "utf8");
  if (includeContextFile) {
    await writeFile(path.join(repo, "context.txt"), `${contextLines.join("\n")}\n`);
  }
  git(repo, ["add", "."]);
  git(repo, ["commit", "-m", "Initial"]);
  git(repo, ["checkout", "-b", "feature/review"]);
  await writeFile(path.join(repo, "tracked.txt"), "before\nbranch\n", "utf8");
  git(repo, ["commit", "-am", "Branch change"]);
  await writeFile(path.join(repo, "tracked.txt"), "before\nbranch\nafter\n", "utf8");
  if (includeContextFile) {
    const changedContextLines = [...contextLines];
    changedContextLines[11] = "changed context line 12";
    await writeFile(
      path.join(repo, "context.txt"),
      `${changedContextLines.join("\n")}\n`,
      "utf8"
    );
  }
  await writeFile(
    path.join(repo, "schema.generated.ts"),
    "export const value = 1;\n",
    "utf8"
  );

  return repo;
}

async function seedRecentProject(userDataPath, repoPath) {
  const dataDir = path.join(userDataPath, "data");
  await mkdir(dataDir, { recursive: true });
  const storage = openStorage(path.join(dataDir, "difftray.sqlite"));

  try {
    storage.upsertProject({
      id: repoPath,
      lastOpenedAt: "2026-01-01T00:00:00.000Z",
      name: path.basename(repoPath),
      path: repoPath
    });
  } finally {
    storage.close();
  }
}

function git(cwd, args) {
  execFileSync("git", args, {
    cwd,
    stdio: "ignore"
  });
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

async function expectProjectTabSummary(window, projectName, count, state) {
  await window.waitForFunction(
    ({ expectedCount, expectedState, targetProjectName }) => {
      const projectTab = [...document.querySelectorAll("button")].find((button) => {
        const text = button.textContent ?? "";

        return text.includes(targetProjectName) && text.includes(expectedCount);
      });

      return Boolean(projectTab?.querySelector(`[data-state="${expectedState}"]`));
    },
    { expectedCount: count, expectedState: state, targetProjectName: projectName }
  );
}

async function expectProjectTabOrder(window, projectNames) {
  const deadline = Date.now() + 30_000;
  let actualProjectNames = [];

  while (Date.now() < deadline) {
    actualProjectNames = await window
      .locator("[data-project-tab-name]")
      .evaluateAll((tabs) =>
        tabs.map((tab) => tab.getAttribute("data-project-tab-name")).filter(Boolean)
      );

    if (
      projectNames.every(
        (projectName, index) => actualProjectNames[index] === projectName
      )
    ) {
      return;
    }

    await window.waitForTimeout(100);
  }

  throw new Error(
    `Expected project tab order ${projectNames.join(", ")}, got ${actualProjectNames.join(", ")}`
  );
}

async function expectProjectTabsEnabled(window) {
  await window.waitForFunction(() => {
    return [...document.querySelectorAll("[data-project-tab-name] button")].every(
      (button) => !button.disabled
    );
  });
}

async function expectFileReviewState(window, filename, state) {
  await window.waitForFunction(
    ({ expectedState, targetFilename }) => {
      const fileButton = [...document.querySelectorAll("button")].find((button) =>
        button.textContent?.includes(targetFilename)
      );

      return Boolean(fileButton?.querySelector(`[data-state="${expectedState}"]`));
    },
    { expectedState: state, targetFilename: filename }
  );
}

async function expectFileStats(window, filename, additions, deletions) {
  await window.waitForFunction(
    ({ expectedAdditions, expectedDeletions, targetFilename }) => {
      const fileButton = [...document.querySelectorAll("button")].find((button) =>
        button.textContent?.includes(targetFilename)
      );
      const text = fileButton?.textContent ?? "";

      return text.includes(expectedAdditions) && text.includes(expectedDeletions);
    },
    {
      expectedAdditions: additions,
      expectedDeletions: deletions,
      targetFilename: filename
    }
  );
}

async function expectSelectedFile(window, filename) {
  await window.waitForFunction((targetFilename) => {
    const selectedButton = document.querySelector('button[data-selected="true"]');

    return selectedButton?.textContent?.includes(targetFilename);
  }, filename);
}

async function expectChecked(window, label) {
  const checked = await window.getByLabel(label, { exact: true }).isChecked();

  if (!checked) {
    throw new Error(`Expected ${label} to be checked`);
  }
}

async function expectButtonEnabled(window, text) {
  await window.waitForFunction((targetText) => {
    return [...document.querySelectorAll("button")].some((button) => {
      return button.textContent?.includes(targetText) && !button.disabled;
    });
  }, text);
}

async function expectComboboxValue(window, name, expectedValue) {
  const actualValue = await window.getByRole("combobox", { name }).inputValue();

  if (actualValue !== expectedValue) {
    throw new Error(`Expected combobox to be ${expectedValue}, got ${actualValue}`);
  }
}

async function expectEditorChoice(window, expectedValue) {
  await window
    .getByRole("button", { name: `Editor: ${expectedValue}` })
    .waitFor({ timeout: 10_000 });
}
