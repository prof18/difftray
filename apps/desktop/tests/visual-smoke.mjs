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
const nonGitPath = await mkdtemp(path.join(tmpdir(), "difftray-non-git-"));
const userDataPath = await mkdtemp(path.join(tmpdir(), "difftray-user-data-"));

await mkdir(artifactsDir, { recursive: true });
await seedRecentProject(userDataPath, secondaryRepoPath);

let app = await electron.launch({
  args: [path.resolve(cwd, "dist/main/index.cjs")],
  cwd,
  env: {
    ...process.env,
    DIFFTRAY_BOOT_PROJECT: repoPath,
    DIFFTRAY_USER_DATA_DIR: userDataPath,
    DIFFTRAY_WINDOW_PRESENTATION: process.env.DIFFTRAY_WINDOW_PRESENTATION ?? "inactive"
  },
  executablePath
});

try {
  let window = await app.firstWindow();
  await window.waitForLoadState("domcontentloaded");
  await window
    .getByRole("button", { name: /tracked\.txt modified/ })
    .waitFor({ timeout: 10_000 });
  await expectProjectTabSummary(window, "visual-secondary-repo", "0/1");
  await window.locator('[data-open-inline="true"]').waitFor({ timeout: 10_000 });
  await expectProjectTabOrder(window, ["visual-repo", "visual-secondary-repo"]);
  await window.evaluate(
    ({ projectIds }) => {
      return window.difftray.saveProjectTabOrder(projectIds);
    },
    { projectIds: [secondaryRepoPath, repoPath] }
  );
  await app.close();
  app = await electron.launch({
    args: [path.resolve(cwd, "dist/main/index.cjs")],
    cwd,
    env: {
      ...process.env,
      DIFFTRAY_BOOT_PROJECT: repoPath,
      DIFFTRAY_USER_DATA_DIR: userDataPath,
      DIFFTRAY_WINDOW_PRESENTATION: process.env.DIFFTRAY_WINDOW_PRESENTATION ?? "inactive"
    },
    executablePath
  });
  window = await app.firstWindow();
  await window.waitForLoadState("domcontentloaded");
  await window
    .getByRole("button", { name: /tracked\.txt modified/ })
    .waitFor({ timeout: 10_000 });
  await expectProjectTabOrder(window, ["visual-secondary-repo", "visual-repo"]);
  await dragProjectTabBefore(window, "visual-repo", "visual-secondary-repo");
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
  await window
    .getByRole("button", { name: "Copy comments report" })
    .waitFor({ state: "detached", timeout: 10_000 });
  await window.getByRole("button", { name: "Show new version" }).click();
  await window.locator('[data-diff-layout="single"]').waitFor({ timeout: 10_000 });
  await expectRenderedFocusedSide(window, "additions");
  await window.screenshot({
    fullPage: true,
    path: path.join(artifactsDir, "desktop-diff-focused-new.png")
  });
  await runCommand(window, "unified", /Switch to unified diff/);
  await window.locator('[data-diff-layout="unified"]').waitFor({ timeout: 10_000 });
  await expectRenderedUnifiedDiff(window);
  await window
    .getByRole("button", { name: "Show new version" })
    .waitFor({ state: "detached", timeout: 10_000 });
  await window
    .getByRole("button", { name: "Show old version" })
    .waitFor({ state: "detached", timeout: 10_000 });
  await window
    .getByRole("button", { name: "Show both diff sides" })
    .waitFor({ state: "detached", timeout: 10_000 });
  await runCommand(window, "split", /Switch to split diff/);
  await window.getByRole("button", { name: "Show both diff sides" }).click();
  await window.locator('[data-diff-layout="split"]').waitFor({ timeout: 10_000 });
  await expectRenderedSplitDiff(window);
  await window.getByRole("button", { name: /preview\.png modified/ }).click();
  await window.getByRole("region", { name: "Image diff" }).waitFor({
    timeout: 10_000
  });
  await expectDecodedImage(window, "Before image, 1 by 1 pixels");
  await expectDecodedImage(window, "After image, 1 by 1 pixels");
  await expectDistinctImageSources(window);
  await window.screenshot({
    fullPage: true,
    path: path.join(artifactsDir, "desktop-image-diff.png")
  });
  await window.getByRole("button", { name: "Show new version" }).click();
  await window
    .getByAltText("Before image, 1 by 1 pixels")
    .waitFor({ state: "detached", timeout: 10_000 });
  await expectDecodedImage(window, "After image, 1 by 1 pixels");
  await window.getByRole("button", { name: "Show both diff sides" }).click();
  await window.getByRole("button", { name: "Project settings" }).click();
  await expectSettingsDiffModeSelector(window, "split");
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
  await resizeFilePane(window, 220);
  await window.getByRole("button", { name: "Choose diff target" }).click();
  await window.getByRole("dialog", { name: "Diff target" }).waitFor({
    timeout: 10_000
  });
  await expectDiffTargetInsideFilePane(window);
  await expectDiffTargetTabsSingleLine(window);
  await window.getByRole("tab", { name: "Branch" }).click();
  await window.getByLabel("Search branches").fill("main");
  await window.getByRole("option", { name: "main" }).click();
  await window.getByText("against main").waitFor({ timeout: 10_000 });
  await expectDiffTargetLabel(window, "main");
  await window.getByRole("button", { name: "Choose diff target" }).click();
  await window.getByRole("tab", { name: "Git changes" }).click();
  await window
    .getByRole("button", { name: /schema\.generated\.ts/ })
    .waitFor({ timeout: 10_000 });
  await expectDiffTargetLabel(window, "Git changes");
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
  await expectWorkspaceIdle(window);
  await window.getByRole("button", { name: /tracked\.txt modified/ }).click();
  await expectSelectedFile(window, "tracked.txt");
  await window.getByRole("button", { name: /long-context\.txt modified/ }).click();
  await expectSelectedFile(window, "long-context.txt");
  await window.locator('[data-diff-layout="split"]').waitFor({ timeout: 10_000 });
  await expectRenderedDiffText(window, "changed long context line 1");
  await window.waitForTimeout(750);
  await expectDiffScrollTopAtMost(window, 1);
  const restoredContextScrollTop = await setDiffScrollTopFromBottom(window, 900);
  await expectDiffScrollTopBetween(
    window,
    restoredContextScrollTop - 20,
    restoredContextScrollTop + 20
  );
  await window.waitForTimeout(1_250);
  await expectDiffScrollTopBetween(
    window,
    restoredContextScrollTop - 20,
    restoredContextScrollTop + 20
  );
  await window.getByRole("button", { name: /tracked\.txt modified/ }).click();
  await expectSelectedFile(window, "tracked.txt");
  await window.waitForTimeout(750);
  await expectDiffScrollTopAtMost(window, 1);
  await window.getByRole("button", { name: /long-context\.txt modified/ }).click();
  await expectSelectedFile(window, "long-context.txt");
  await expectDiffScrollTopBetween(
    window,
    restoredContextScrollTop - 20,
    restoredContextScrollTop + 20
  );
  await window.waitForTimeout(1_250);
  await expectDiffScrollTopBetween(
    window,
    restoredContextScrollTop - 20,
    restoredContextScrollTop + 20
  );
  await window.getByRole("button", { exact: true, name: "context.txt modified" }).click();
  await window.getByText("changed context line 1", { exact: true }).first().waitFor({
    timeout: 10_000
  });
  await window.locator("[data-unmodified-lines]").first().click();
  await window.getByText("context line 100", { exact: true }).first().waitFor({
    timeout: 10_000
  });
  await window.screenshot({
    fullPage: true,
    path: path.join(artifactsDir, "desktop-expanded-context.png")
  });
  await window.getByRole("button", { name: /tracked\.txt modified/ }).click();
  await expectSelectedFile(window, "tracked.txt");
  await clickDiffLineNumber(window, "additions", 3);
  await window
    .locator('textarea[aria-label="Review comment"]')
    .fill("Please tighten the added line.");
  await window.getByRole("button", { name: "Save" }).click();
  await window
    .getByText("Please tighten the added line.", { exact: true })
    .waitFor({ timeout: 10_000 });
  await expectFileCommentCount(window, "tracked.txt", "1");
  await window.getByRole("button", { name: "Copy comments report" }).click();
  await window
    .getByText("Copied 1 review comment", { exact: true })
    .waitFor({ timeout: 10_000 });
  await expectClipboardReport(app, [
    "# Difftray Review Comments",
    "tracked.txt",
    "New line 3",
    "Diff context:",
    "+ 3 after",
    "Please tighten the added line."
  ]);
  await window.screenshot({
    fullPage: true,
    path: path.join(artifactsDir, "desktop-review-workflow.png")
  });
  await window.keyboard.press("KeyR");
  await expectFileReviewState(window, "tracked.txt", "reviewed");
  await expectSelectedFile(window, "schema.generated.ts");
  await expectFocusedFile(window, "schema.generated.ts");
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
  await expectProjectTabSummary(window, "visual-repo", "1/5");
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
  await window.getByRole("button", { name: "Refresh project" }).click();
  await expectWorkspaceIdle(window);
  await window
    .getByRole("button", { name: /tracked\.txt modified.*changed after review/ })
    .waitFor({ timeout: 10_000 });
  await window.getByText("reviewed files drifted").waitFor({ timeout: 10_000 });
  await window.screenshot({
    fullPage: true,
    path: path.join(artifactsDir, "desktop-review-invalidated.png")
  });
  await expectDismissibleOpenProjectError(app, window, nonGitPath);
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
    { length: 140 },
    (_, index) => `context line ${index + 1}`
  );
  const longContextLines = Array.from(
    { length: 1_000 },
    (_, index) => `long context line ${index + 1}`
  );

  await mkdir(repo);
  git(repo, ["init", "--initial-branch=main"]);
  git(repo, ["config", "user.email", "visual@example.invalid"]);
  git(repo, ["config", "user.name", "Visual Smoke"]);
  await writeFile(path.join(repo, "tracked.txt"), "before\n", "utf8");
  if (includeContextFile) {
    await writeFile(path.join(repo, "preview.png"), pngFixture("before"));
    await writeFile(path.join(repo, "context.txt"), `${contextLines.join("\n")}\n`);
    await writeFile(
      path.join(repo, "long-context.txt"),
      `${longContextLines.join("\n")}\n`
    );
  }
  git(repo, ["add", "."]);
  git(repo, ["commit", "-m", "Initial"]);
  git(repo, ["checkout", "-b", "feature/review"]);
  await writeFile(path.join(repo, "tracked.txt"), "before\nbranch\n", "utf8");
  git(repo, ["commit", "-am", "Branch change"]);
  await writeFile(path.join(repo, "tracked.txt"), "before\nbranch\nafter\n", "utf8");
  if (includeContextFile) {
    await writeFile(path.join(repo, "preview.png"), pngFixture("after"));
    const changedContextLines = [...contextLines];
    for (let index = 0; index < 90; index += 1) {
      changedContextLines[index] = `changed context line ${index + 1}`;
    }
    await writeFile(
      path.join(repo, "context.txt"),
      `${changedContextLines.join("\n")}\n`,
      "utf8"
    );
    const changedLongContextLines = [...longContextLines];
    for (let index = 0; index < 600; index += 1) {
      changedLongContextLines[index] = `changed long context line ${index + 1}`;
    }
    await writeFile(
      path.join(repo, "long-context.txt"),
      `${changedLongContextLines.join("\n")}\n`,
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

function pngFixture(side) {
  return Buffer.from(
    side === "before"
      ? "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZgL8AAAAASUVORK5CYII="
      : "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
    "base64"
  );
}

async function expectDecodedImage(window, accessibleName) {
  await window.waitForFunction((name) => {
    const image = [...document.querySelectorAll("img")].find(
      (candidate) => candidate.alt === name
    );

    return image?.complete === true && image.naturalWidth > 0;
  }, accessibleName);
}

async function expectDistinctImageSources(window) {
  await window.waitForFunction(() => {
    const before = document.querySelector('img[alt^="Before image"]');
    const after = document.querySelector('img[alt^="After image"]');

    return (
      before instanceof HTMLImageElement &&
      after instanceof HTMLImageElement &&
      before.src !== after.src
    );
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

async function expectProjectTabSummary(window, projectName, count) {
  await window.waitForFunction(
    ({ expectedCount, targetProjectName }) => {
      const projectTab = [...document.querySelectorAll("button")].find((button) => {
        const text = button.textContent ?? "";

        return text.includes(targetProjectName) && text.includes(expectedCount);
      });

      return Boolean(projectTab) && !projectTab?.querySelector("[data-state]");
    },
    { expectedCount: count, targetProjectName: projectName }
  );
}

async function dismissErrorBanner(window, errorText) {
  await window.getByText(errorText).waitFor({ timeout: 10_000 });
  await window.getByRole("button", { name: "Dismiss error" }).click();
  await window.getByText(errorText).waitFor({ state: "detached", timeout: 10_000 });
}

async function expectDismissibleOpenProjectError(app, window, folderPath) {
  await app.evaluate(({ dialog }, selectedPath) => {
    const originalShowOpenDialog = dialog.showOpenDialog;

    globalThis.__difftrayRestoreShowOpenDialog = () => {
      dialog.showOpenDialog = originalShowOpenDialog;
    };
    dialog.showOpenDialog = async () => ({
      canceled: false,
      filePaths: [selectedPath]
    });
  }, folderPath);

  try {
    await window.getByRole("button", { name: "Open repository" }).click();
    await dismissErrorBanner(window, "Selected folder is not inside a Git repository.");
  } finally {
    await app.evaluate(() => {
      globalThis.__difftrayRestoreShowOpenDialog?.();
      delete globalThis.__difftrayRestoreShowOpenDialog;
    });
  }
}

async function dragProjectTabBefore(window, draggedProjectName, targetProjectName) {
  const draggedTab = window.locator(`[data-project-tab-name="${draggedProjectName}"]`);
  const targetTab = window.locator(`[data-project-tab-name="${targetProjectName}"]`);
  const targetBox = await targetTab.boundingBox();

  if (!targetBox) {
    throw new Error(`Missing project tab bounds for ${targetProjectName}`);
  }

  await draggedTab.dragTo(targetTab, {
    force: true,
    targetPosition: {
      x: 8,
      y: Math.max(1, Math.floor(targetBox.height / 2))
    }
  });
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

async function expectFileCommentCount(window, filename, count) {
  await window.waitForFunction(
    ({ expectedCount, targetFilename }) => {
      const fileButton = [...document.querySelectorAll("button")].find((button) =>
        button.textContent?.includes(targetFilename)
      );
      const badge = fileButton?.querySelector('[title="Review comments"]');

      return badge?.textContent?.trim() === expectedCount;
    },
    { expectedCount: count, targetFilename: filename }
  );
}

async function expectSelectedFile(window, filename) {
  await window.waitForFunction((targetFilename) => {
    const selectedButton = document.querySelector('button[data-selected="true"]');

    return selectedButton?.textContent?.includes(targetFilename);
  }, filename);
}

async function expectWorkspaceIdle(window) {
  await window.locator('section[aria-busy="false"]').waitFor({ timeout: 10_000 });
}

async function clickDiffLineNumber(window, side, lineNumber) {
  const selector = `[data-${side}] [data-column-number="${String(lineNumber)}"]`;

  await window.locator(selector).first().click({ timeout: 10_000 });
}

async function expectClipboardReport(app, snippets) {
  const text = await app.evaluate(({ clipboard }) => clipboard.readText());
  const missing = snippets.filter((snippet) => !text.includes(snippet));

  if (missing.length > 0) {
    throw new Error(`Clipboard report is missing: ${missing.join(", ")}`);
  }
}

async function expectFocusedFile(window, filename) {
  await window.waitForFunction((targetFilename) => {
    return document.activeElement?.textContent?.includes(targetFilename);
  }, filename);
}

async function setDiffScrollTopFromBottom(window, offsetFromBottom) {
  await window.locator("[data-diff-layout]").evaluate((surface) => {
    surface.scrollTop = surface.scrollHeight - surface.clientHeight;
    surface.dispatchEvent(new Event("scroll", { bubbles: true }));
  });
  await window.waitForTimeout(250);

  return window
    .locator("[data-diff-layout]")
    .evaluate((surface, nextOffsetFromBottom) => {
      const maxScrollTop = surface.scrollHeight - surface.clientHeight;
      const nextScrollTop = Math.max(0, maxScrollTop - nextOffsetFromBottom);

      surface.scrollTop = nextScrollTop;
      surface.dispatchEvent(new Event("scroll", { bubbles: true }));

      return nextScrollTop;
    }, offsetFromBottom);
}

async function expectDiffScrollTopBetween(window, minimumScrollTop, maximumScrollTop) {
  try {
    await window.waitForFunction(
      ({ maximum, minimum }) => {
        const surface = document.querySelector("[data-diff-layout]");

        return (
          surface instanceof HTMLElement &&
          surface.scrollTop >= minimum &&
          surface.scrollTop <= maximum
        );
      },
      { maximum: maximumScrollTop, minimum: minimumScrollTop }
    );
  } catch (error) {
    const actual = await diffScrollState(window);

    throw new Error(
      `Expected diff scrollTop between ${minimumScrollTop} and ${maximumScrollTop}, got ${actual.scrollTop} of max ${actual.maxScrollTop}`,
      { cause: error }
    );
  }
}

async function expectDiffScrollTopAtMost(window, scrollTop) {
  try {
    await window.waitForFunction((maximumScrollTop) => {
      const surface = document.querySelector("[data-diff-layout]");

      return surface instanceof HTMLElement && surface.scrollTop <= maximumScrollTop;
    }, scrollTop);
  } catch (error) {
    const actual = await diffScrollState(window);

    throw new Error(
      `Expected diff scrollTop at most ${scrollTop}, got ${actual.scrollTop} of max ${actual.maxScrollTop}`,
      { cause: error }
    );
  }
}

async function diffScrollState(window) {
  return window.locator("[data-diff-layout]").evaluate((surface) => {
    return {
      clientHeight: surface.clientHeight,
      maxScrollTop: surface.scrollHeight - surface.clientHeight,
      scrollHeight: surface.scrollHeight,
      scrollTop: surface.scrollTop
    };
  });
}

async function runCommand(window, query, commandName) {
  await window.keyboard.press("Meta+KeyK");
  await window.getByRole("dialog", { name: "Command palette" }).waitFor({
    timeout: 10_000
  });
  await window.keyboard.type(query);
  await window.getByRole("button", { name: commandName }).click();
  await window.getByRole("dialog", { name: "Command palette" }).waitFor({
    state: "detached",
    timeout: 10_000
  });
}

async function expectRenderedFocusedSide(window, side) {
  try {
    await window.waitForFunction((expectedSide) => {
      const diffElement = document.querySelector("[data-diff-layout] diffs-container");
      const pre = diffElement?.shadowRoot?.querySelector("pre[data-diff-type='single']");

      return (
        pre instanceof HTMLElement &&
        Boolean(pre.querySelector(`[data-${expectedSide}]`)) &&
        !pre.querySelector("[data-deletions]")
      );
    }, side);
  } catch (error) {
    const debugState = await window.evaluate(() => {
      const diffElement = document.querySelector("[data-diff-layout] diffs-container");
      const pre = diffElement?.shadowRoot?.querySelector("pre");

      return {
        diffElementClassName:
          diffElement instanceof HTMLElement ? diffElement.className : undefined,
        layout: document
          .querySelector("[data-diff-layout]")
          ?.getAttribute("data-diff-layout"),
        preDiffType: pre?.getAttribute("data-diff-type"),
        hasAdditions: Boolean(pre?.querySelector("[data-additions]")),
        hasDeletions: Boolean(pre?.querySelector("[data-deletions]")),
        hostCount: document.querySelectorAll("diffs-container").length
      };
    });

    throw new Error(`Expected focused ${side} diff, got ${JSON.stringify(debugState)}`, {
      cause: error
    });
  }
}

async function expectRenderedUnifiedDiff(window) {
  await window.waitForFunction(() => {
    const diffElement = document.querySelector("[data-diff-layout] diffs-container");
    const pre = diffElement?.shadowRoot?.querySelector("pre[data-diff-type='single']");

    return pre instanceof HTMLElement && Boolean(pre.querySelector("[data-unified]"));
  });
}

async function expectRenderedSplitDiff(window) {
  await window.waitForFunction(() => {
    const diffElement = document.querySelector("diffs-container");
    const pre = diffElement?.shadowRoot?.querySelector("pre[data-diff-type='split']");

    return (
      pre instanceof HTMLElement &&
      Boolean(pre.querySelector("[data-deletions]")) &&
      Boolean(pre.querySelector("[data-additions]"))
    );
  });
}

async function expectRenderedDiffText(window, expectedText) {
  try {
    await window.waitForFunction((text) => {
      const diffElement = document.querySelector("[data-diff-layout] diffs-container");

      return Boolean(diffElement?.shadowRoot?.textContent?.includes(text));
    }, expectedText);
  } catch (error) {
    const debugState = await window.evaluate(() => {
      const surface = document.querySelector("[data-diff-layout]");
      const diffElement = surface?.querySelector("diffs-container");

      return {
        layout:
          surface instanceof HTMLElement
            ? surface.getAttribute("data-diff-layout")
            : undefined,
        scrollTop: surface instanceof HTMLElement ? surface.scrollTop : undefined,
        shadowTextSample: diffElement?.shadowRoot?.textContent?.slice(0, 500)
      };
    });

    throw new Error(
      `Expected rendered diff text ${expectedText}, got ${JSON.stringify(debugState)}`,
      { cause: error }
    );
  }
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

async function expectDiffTargetLabel(window, expectedLabel) {
  await window.waitForFunction((targetLabel) => {
    const button = [...document.querySelectorAll("button")].find(
      (candidate) => candidate.getAttribute("aria-label") === "Choose diff target"
    );

    return button?.textContent?.trim() === targetLabel;
  }, expectedLabel);
}

async function expectDiffTargetInsideFilePane(window) {
  await window.waitForFunction(() => {
    const dialog = document.querySelector('[role="dialog"][aria-label="Diff target"]');
    const filePane = document.querySelector('nav[aria-label="Changed files"]');

    if (!(dialog instanceof HTMLElement) || !(filePane instanceof HTMLElement)) {
      return false;
    }

    const dialogRect = dialog.getBoundingClientRect();
    const filePaneRect = filePane.getBoundingClientRect();

    return dialogRect.right <= filePaneRect.right + 0.5;
  });
}

async function expectDiffTargetTabsSingleLine(window) {
  await window.waitForFunction(() => {
    const tabs = [
      ...document.querySelectorAll(
        '[role="tablist"][aria-label="Diff target type"] button'
      )
    ];

    return (
      tabs.length === 3 && tabs.every((tab) => tab.getBoundingClientRect().height <= 28)
    );
  });
}

async function resizeFilePane(window, targetWidth) {
  const filePane = window.locator('nav[aria-label="Changed files"]');
  const resizeHandle = window.getByRole("separator", { name: "Resize file list" });
  const [filePaneBox, handleBox] = await Promise.all([
    filePane.boundingBox(),
    resizeHandle.boundingBox()
  ]);

  if (!filePaneBox || !handleBox) {
    throw new Error("Unable to measure file pane resize handles");
  }

  const handleX = handleBox.x + handleBox.width / 2;
  const handleY = handleBox.y + handleBox.height / 2;

  await window.mouse.move(handleX, handleY);
  await window.mouse.down();
  await window.mouse.move(filePaneBox.x + targetWidth, handleY);
  await window.mouse.up();
}

async function expectSettingsDiffModeSelector(window, expectedMode) {
  await window.waitForFunction((mode) => {
    const group = document.querySelector(
      '[role="group"][aria-label="Default diff view"]'
    );

    if (!(group instanceof HTMLElement)) {
      return false;
    }

    const buttons = [...group.querySelectorAll("button")];
    const activeButton = buttons.find((button) => button.dataset.active === "true");

    return (
      buttons.length === 2 &&
      buttons.some((button) => button.textContent?.trim() === "Split") &&
      buttons.some((button) => button.textContent?.trim() === "Unified") &&
      activeButton?.textContent?.trim().toLowerCase() === mode &&
      buttons.every((button) => {
        const rect = button.getBoundingClientRect();

        return rect.width >= 54 && rect.height >= 28;
      })
    );
  }, expectedMode);
}

async function expectEditorChoice(window, expectedValue) {
  await window
    .getByRole("button", { name: `Editor: ${expectedValue}` })
    .waitFor({ timeout: 10_000 });
}
