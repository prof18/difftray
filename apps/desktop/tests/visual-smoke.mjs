import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, realpath, writeFile } from "node:fs/promises";
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
  await expectSelectedFileFinderActions(app, window, repoPath);
  await window
    .getByRole("button", { name: "Worktrees for visual-repo" })
    .waitFor({ timeout: 10_000 });
  const repositoryActions = window.locator('[data-repository-actions="true"]');
  await expectNoDragRegion(repositoryActions, "repository action cluster");
  const repositoryActionsButton = window.getByRole("button", {
    name: "Repository actions for visual-repo"
  });
  await repositoryActionsButton.click();
  const showInFinderItem = window.getByRole("menuitem", { name: "Show in Finder" });
  await showInFinderItem.waitFor({
    timeout: 10_000
  });
  await expectHoverBackgroundChange(showInFinderItem, "repository menu item");
  await window.keyboard.press("Escape");
  await expectNoOuterFocusOutline(repositoryActionsButton, "repository actions button");
  await window.getByRole("button", { name: "Worktrees for visual-repo" }).click();
  await window
    .getByRole("dialog", { name: "Worktrees for visual-repo" })
    .waitFor({ timeout: 10_000 });
  await expectHoverBackgroundChange(
    window.getByRole("button", { name: "Refresh worktrees" }),
    "worktree refresh button"
  );
  await window.getByRole("button", { name: "Close worktrees" }).click();
  await expectProjectTabSummary(window, "visual-secondary-repo", "0/1");
  await window.locator('[data-open-inline="true"]').waitFor({ timeout: 10_000 });
  await expectProjectTabOrder(window, ["visual-repo", "visual-secondary-repo"]);
  await window.evaluate(
    ({ projectIds }) => {
      return window.difftray.saveProjectTabOrder(projectIds);
    },
    { projectIds: [secondaryRepoPath, repoPath] }
  );
  const expectedRestoredWindowBounds = await setMainWindowBounds(app);
  await expectWindowBoundsSaved(userDataPath, expectedRestoredWindowBounds);
  const resizedWindowBounds = await resizeMainWindow(app, -40, -30);
  await expectWindowBoundsSaved(userDataPath, resizedWindowBounds);
  const movedWindowBounds = await moveMainWindow(app, 24, 18);
  await expectWindowBoundsSaved(userDataPath, movedWindowBounds);
  await maximizeMainWindow(app);
  await expectWindowPresentationSaved(userDataPath, { isMaximized: true });
  await closeMainWindowThroughCloseEvent(app);
  await expectWindowPresentationSaved(userDataPath, { isMaximized: true });
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
  await expectMainWindowNormalBounds(app, movedWindowBounds);
  await expectMainWindowMaximized(app);
  await setMainWindowFullScreen(app, true);
  await expectWindowPresentationSaved(userDataPath, { isFullScreen: true });
  await closeMainWindowThroughCloseEvent(app);
  await expectWindowPresentationSaved(userDataPath, { isFullScreen: true });
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
  await expectMainWindowFullScreen(app);
  await setMainWindowFullScreen(app, false);
  await maximizeMainWindow(app);
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
  await expectProjectTabsScrollable(window);
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
  await openSettingsFromApplicationMenu(app, window);
  await expectSettingsDiffModeSelector(window, "split");
  const companionToggle = window.getByLabel("Enable companion mode");
  await companionToggle.check();
  await window.getByText("How to connect your phone").waitFor({ timeout: 10_000 });
  await expectSettingsScrollable(window);
  await window.getByLabel("Wrap long lines", { exact: true }).uncheck();
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
  await openSettingsFromApplicationMenu(app, window);
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
  await window.locator("[data-diff-layout]").evaluate((surface) => {
    surface.scrollTop = surface.scrollHeight - surface.clientHeight;
    surface.dispatchEvent(new Event("scroll", { bubbles: true }));
  });
  await window.waitForTimeout(250);
  await expectHorizontalDiffScrollbar(window);
  await window.waitForTimeout(50);
  await window.screenshot({
    path: path.join(artifactsDir, "desktop-horizontal-scrollbar.png")
  });
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
  const reviewCommentEditor = window.locator('textarea[aria-label="Review comment"]');
  const multilineReviewComment = "Please tighten the added line.\nKeep the context.";
  await reviewCommentEditor.fill("Please tighten the added line.");
  await reviewCommentEditor.press("Enter");
  await reviewCommentEditor.pressSequentially("Keep the context.");
  if ((await reviewCommentEditor.inputValue()) !== multilineReviewComment) {
    throw new Error("Plain Enter did not add a review-comment line break.");
  }
  await window.keyboard.press("Meta+Enter");
  const savedReviewComment = window.locator("p").filter({
    hasText: "Please tighten the added line."
  });
  await savedReviewComment.waitFor({ timeout: 10_000 });
  if ((await savedReviewComment.textContent()) !== multilineReviewComment) {
    throw new Error("Command+Enter did not save the multiline review comment.");
  }
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
    "Please tighten the added line.",
    "Keep the context."
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
  await app.evaluate(({ Menu }) => {
    const closeRepositoryItem =
      Menu.getApplicationMenu()?.getMenuItemById("repository-close");

    if (closeRepositoryItem?.accelerator !== "CommandOrControl+W") {
      throw new Error(
        `Expected the close repository shortcut to be CommandOrControl+W, got ${closeRepositoryItem?.accelerator}`
      );
    }

    closeRepositoryItem.click();
  });
  await window
    .locator('[data-project-tab-name="visual-repo"]')
    .waitFor({ state: "detached", timeout: 10_000 });
  await window
    .locator('[data-project-tab-name="visual-secondary-repo"][data-active="true"]')
    .waitFor({ timeout: 10_000 });
  await window.getByRole("button", { name: "Close repository" }).click();
  await window.getByRole("heading", { name: "No repository open" }).waitFor({
    timeout: 10_000
  });
  await expectApplicationMenuItemEnabled(app, "file-show-in-finder", false);
  await openRepositoryFromDialog(app, window, repoPath);
  await expectApplicationMenuItemEnabled(app, "file-show-in-finder", true);
  await window.close();
  await expectApplicationMenuItemEnabled(app, "file-show-in-finder", false);
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
  if (includeContextFile) {
    git(repo, ["worktree", "add", path.join(parent, `${name}-sibling`), "main"]);
  }
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
    changedLongContextLines[0] = `changed long context line 1 ${"x".repeat(240)}`;
    changedLongContextLines[599] = `changed long context line 600 ${"x".repeat(240)}`;
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

  return realpath(repo);
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
    storage.appendProjectToTabOrder(repoPath);
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

async function expectSelectedFileFinderActions(app, window, repoPath) {
  const expectedPath = await realpath(path.join(repoPath, "tracked.txt"));

  await app.evaluate(({ shell }) => {
    const originalShowItemInFolder = shell.showItemInFolder;

    globalThis.__difftrayShownFilePaths = [];
    globalThis.__difftrayRestoreShowItemInFolder = () => {
      shell.showItemInFolder = originalShowItemInFolder;
    };
    shell.showItemInFolder = (filePath) => {
      globalThis.__difftrayShownFilePaths.push(filePath);
    };
  });

  try {
    const row = window.getByRole("button", { name: /tracked\.txt modified/ });

    await row.click();
    await expectSelectedFile(window, "tracked.txt");
    await window.keyboard.press("Meta+KeyK");
    const commandPalette = window.getByRole("dialog", { name: "Command palette" });
    await commandPalette.waitFor({ timeout: 10_000 });
    await window.keyboard.type("selected file");
    await commandPalette
      .getByRole("button", { name: "Open selected file in Editor" })
      .waitFor({ timeout: 10_000 });
    await commandPalette
      .getByRole("button", { name: "Show selected file in Finder" })
      .waitFor({ timeout: 10_000 });
    await window.keyboard.press("Escape");
    await commandPalette.waitFor({ state: "detached", timeout: 10_000 });

    await row.click({ button: "right", position: { x: 12, y: 12 } });
    const contextMenu = window.getByRole("menu", {
      name: "File actions for tracked.txt"
    });
    await contextMenu.waitFor({ timeout: 10_000 });
    await window.screenshot({
      fullPage: true,
      path: path.join(artifactsDir, "desktop-file-context-menu.png")
    });
    await window.getByRole("menuitem", { name: "Show in Finder" }).click();
    await expectShownFilePathCount(app, 1);
    await expectFocusedFile(window, "tracked.txt");

    await expectApplicationMenuItemEnabled(app, "file-show-in-finder", true);
    await app.evaluate(({ Menu }) => {
      Menu.getApplicationMenu()?.getMenuItemById("file-show-in-finder")?.click();
    });
    await expectShownFilePathCount(app, 2);

    const shownPaths = await app.evaluate(
      () => globalThis.__difftrayShownFilePaths ?? []
    );
    if (shownPaths.some((shownPath) => shownPath !== expectedPath)) {
      throw new Error(
        `Selected-file Finder action used unexpected paths: ${shownPaths.join(", ")}`
      );
    }
  } finally {
    await app.evaluate(() => {
      globalThis.__difftrayRestoreShowItemInFolder?.();
      delete globalThis.__difftrayRestoreShowItemInFolder;
      delete globalThis.__difftrayShownFilePaths;
    });
  }
}

async function expectShownFilePathCount(app, expectedCount) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const count = await app.evaluate(
      () => globalThis.__difftrayShownFilePaths?.length ?? 0
    );

    if (count === expectedCount) {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, 25));
  }

  throw new Error(`Expected ${expectedCount} selected-file Finder actions.`);
}

async function expectApplicationMenuItemEnabled(app, itemId, expectedEnabled) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const enabled = await app.evaluate(
      ({ Menu }, id) => Menu.getApplicationMenu()?.getMenuItemById(id)?.enabled,
      itemId
    );

    if (enabled === expectedEnabled) {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, 25));
  }

  throw new Error(
    `Expected application menu item ${itemId} enabled=${String(expectedEnabled)}.`
  );
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
    await window.getByRole("button", { name: "Open Repositories…" }).click();
    await dismissErrorBanner(window, "Selected folder is not inside a Git repository.");
  } finally {
    await app.evaluate(() => {
      globalThis.__difftrayRestoreShowOpenDialog?.();
      delete globalThis.__difftrayRestoreShowOpenDialog;
    });
  }
}

async function openRepositoryFromDialog(app, window, folderPath) {
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
    await window.getByRole("button", { name: "Open Repositories…" }).click();
    await window
      .getByRole("button", { name: /tracked\.txt modified/ })
      .waitFor({ timeout: 10_000 });
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

async function expectProjectTabsScrollable(window) {
  const tabBar = window.locator('[data-project-tab-bar="true"]');
  const tabScroller = window.locator('[data-project-tab-scroller="true"]');

  await expectNoDragRegion(tabBar, "project tab bar");
  await tabScroller.evaluate((element) => {
    element.style.flex = "0 0 160px";
    element.style.maxWidth = "160px";
    element.scrollLeft = 0;
  });

  const metrics = await tabScroller.evaluate((element) => ({
    clientWidth: element.clientWidth,
    scrollWidth: element.scrollWidth
  }));

  if (metrics.scrollWidth <= metrics.clientWidth) {
    throw new Error(`Expected overflowing project tabs, got ${JSON.stringify(metrics)}`);
  }

  await window.locator('[data-project-tab-name="visual-repo"]').hover();
  await window.evaluate(() => {
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
  });
  await window.mouse.wheel(0, 120);
  await window.waitForFunction(() => {
    const element = document.querySelector('[data-project-tab-scroller="true"]');
    return element instanceof HTMLElement && element.scrollLeft > 0;
  });

  await tabScroller.evaluate((element) => {
    element.scrollLeft = 0;
  });
  await window.mouse.wheel(60, 0);
  await window.waitForFunction(() => {
    const element = document.querySelector('[data-project-tab-scroller="true"]');
    return element instanceof HTMLElement && element.scrollLeft > 0;
  });

  await tabScroller.evaluate((element) => {
    element.style.removeProperty("flex");
    element.style.removeProperty("max-width");
    element.scrollLeft = 0;
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

async function expectHorizontalDiffScrollbar(window) {
  const scrollbar = window.getByRole("scrollbar").last();
  try {
    await scrollbar.waitFor({ timeout: 10_000 });
  } catch (error) {
    const debugState = await window.evaluate(() => {
      const host = document.querySelector("[data-diff-layout] diffs-container");
      const codes = Array.from(host?.shadowRoot?.querySelectorAll("[data-code]") ?? []);

      return {
        codeWidths: codes.map((code) => ({
          clientWidth: code.clientWidth,
          scrollWidth: code.scrollWidth
        })),
        overflow: host?.shadowRoot?.querySelector("pre")?.getAttribute("data-overflow"),
        overlays: document.querySelectorAll("[data-diff-horizontal-scrollbars]").length
      };
    });

    throw new Error(
      `Horizontal scrollbar was not visible: ${JSON.stringify(debugState)}`,
      {
        cause: error
      }
    );
  }
  await scrollbar.focus();
  await window.keyboard.press("ArrowRight");
  const bounds = await scrollbar.boundingBox();
  if (!bounds) {
    throw new Error("Horizontal scrollbar has no pointer target");
  }
  await window.mouse.move(bounds.x + 40, bounds.y + bounds.height / 2);
  await window.mouse.down();
  await window.mouse.move(bounds.x + 140, bounds.y + bounds.height / 2);
  await window.mouse.up();

  const state = await window.evaluate(() => {
    const diffElement = document.querySelector("[data-diff-layout] diffs-container");
    const pre = diffElement?.shadowRoot?.querySelector("pre");
    const code = Array.from(
      diffElement?.shadowRoot?.querySelectorAll("[data-code]") ?? []
    )
      .filter((candidate) => candidate instanceof HTMLElement)
      .sort(
        (left, right) =>
          right.scrollWidth - right.clientWidth - (left.scrollWidth - left.clientWidth)
      )[0];

    if (!(code instanceof HTMLElement)) {
      return {
        error: "missing code scroller",
        overflow: pre?.getAttribute("data-overflow")
      };
    }

    const maxScrollLeft = code.scrollWidth - code.clientWidth;
    const track = document.querySelector('[role="scrollbar"]:focus');
    const thumb = track?.firstElementChild;

    return {
      maxScrollLeft,
      overflow: pre?.getAttribute("data-overflow"),
      scrollLeft: code.scrollLeft,
      thumbBackground:
        thumb instanceof HTMLElement
          ? getComputedStyle(thumb).backgroundColor
          : undefined,
      thumbHeight:
        thumb instanceof HTMLElement ? thumb.getBoundingClientRect().height : 0,
      thumbWidth: thumb instanceof HTMLElement ? thumb.getBoundingClientRect().width : 0,
      trackHeight: track instanceof HTMLElement ? track.getBoundingClientRect().height : 0
    };
  });

  if (
    "error" in state ||
    state.maxScrollLeft <= 0 ||
    state.scrollLeft <= 0 ||
    state.trackHeight !== 10 ||
    state.thumbHeight !== 4 ||
    state.thumbWidth < 44 ||
    !state.thumbBackground ||
    state.thumbBackground === "rgba(0, 0, 0, 0)"
  ) {
    throw new Error(
      `Expected a visible horizontal diff scrollbar, got ${JSON.stringify(state)}`
    );
  }

  await scrollbar.evaluate((element) => element.blur());
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

async function openSettingsFromApplicationMenu(app, window) {
  await app.evaluate(({ Menu }) => {
    Menu.getApplicationMenu()?.getMenuItemById("settings")?.click();
  });
  await window.getByRole("heading", { name: "Settings" }).waitFor({
    timeout: 10_000
  });
}

async function setMainWindowBounds(app) {
  return app.evaluate(({ BrowserWindow, screen }) => {
    const window = BrowserWindow.getAllWindows()[0];

    if (!window) {
      throw new Error("Expected a main window to resize");
    }

    const workArea = screen.getDisplayMatching(window.getBounds()).workArea;
    const height = Math.min(700, workArea.height);
    const width = Math.min(1_000, workArea.width);
    const bounds = {
      height,
      width,
      x: workArea.x + Math.max(0, Math.floor((workArea.width - width) / 2)),
      y: workArea.y + Math.max(0, Math.floor((workArea.height - height) / 2))
    };

    window.setBounds(bounds);
    return window.getNormalBounds();
  });
}

async function moveMainWindow(app, deltaX, deltaY) {
  return app.evaluate(
    ({ BrowserWindow }, offsets) => {
      const window = BrowserWindow.getAllWindows()[0];

      if (!window) {
        throw new Error("Expected a main window to move");
      }

      const bounds = window.getBounds();
      window.setPosition(bounds.x + offsets.deltaX, bounds.y + offsets.deltaY);
      return window.getNormalBounds();
    },
    { deltaX, deltaY }
  );
}

async function resizeMainWindow(app, widthDelta, heightDelta) {
  return app.evaluate(
    ({ BrowserWindow }, deltas) => {
      const window = BrowserWindow.getAllWindows()[0];

      if (!window) {
        throw new Error("Expected a main window to resize");
      }

      const bounds = window.getBounds();
      window.setSize(
        bounds.width + deltas.widthDelta,
        bounds.height + deltas.heightDelta
      );
      return window.getNormalBounds();
    },
    { heightDelta, widthDelta }
  );
}

async function closeMainWindowThroughCloseEvent(app) {
  await app.evaluate(({ BrowserWindow }) => {
    const window = BrowserWindow.getAllWindows()[0];

    if (!window) {
      throw new Error("Expected a main window to close");
    }

    window.close();
  });
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    const windowCount = await app.evaluate(
      ({ BrowserWindow }) => BrowserWindow.getAllWindows().length
    );
    if (windowCount === 0) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error("Expected the close event to close the main window");
}

async function setMainWindowFullScreen(app, enabled) {
  await app.evaluate(({ BrowserWindow }, value) => {
    const window = BrowserWindow.getAllWindows()[0];

    if (!window) {
      throw new Error("Expected a main window to change full-screen state");
    }

    window.setFullScreen(value);
  }, enabled);
  await waitForMainWindowState(app, (state) => state.isFullScreen === enabled);
}

async function expectWindowBoundsSaved(userDataPath, expectedBounds) {
  const statePath = path.join(userDataPath, "window-state.json");
  const deadline = Date.now() + 5_000;

  while (Date.now() < deadline) {
    try {
      const state = JSON.parse(await readFile(statePath, "utf8"));

      if (JSON.stringify(state.bounds) === JSON.stringify(expectedBounds)) {
        return;
      }
    } catch {
      // The move or resize event may still be in flight.
    }

    await new Promise((resolve) => setTimeout(resolve, 50));
  }

  throw new Error(
    `Expected window bounds to be saved before closing: ${JSON.stringify(expectedBounds)}`
  );
}

async function maximizeMainWindow(app) {
  await app.evaluate(({ BrowserWindow }) => {
    const window = BrowserWindow.getAllWindows()[0];

    if (!window) {
      throw new Error("Expected a main window to maximize");
    }

    window.maximize();
  });
  await waitForMainWindowState(app, (state) => state.isMaximized);
}

async function expectWindowPresentationSaved(userDataPath, expectedPresentation) {
  const statePath = path.join(userDataPath, "window-state.json");
  const deadline = Date.now() + 5_000;

  while (Date.now() < deadline) {
    try {
      const state = JSON.parse(await readFile(statePath, "utf8"));

      if (
        Object.entries(expectedPresentation).every(([key, value]) => state[key] === value)
      ) {
        return;
      }
    } catch {
      // The presentation event may still be in flight.
    }

    await new Promise((resolve) => setTimeout(resolve, 50));
  }

  throw new Error(
    `Expected window presentation to be saved: ${JSON.stringify(expectedPresentation)}`
  );
}

async function expectMainWindowNormalBounds(app, expectedBounds) {
  const actualBounds = await app.evaluate(({ BrowserWindow }) => {
    const window = BrowserWindow.getAllWindows()[0];

    if (!window) {
      throw new Error("Expected a restored main window");
    }

    return window.getNormalBounds();
  });

  if (JSON.stringify(actualBounds) !== JSON.stringify(expectedBounds)) {
    throw new Error(
      `Expected restored window bounds ${JSON.stringify(expectedBounds)}, got ${JSON.stringify(actualBounds)}`
    );
  }
}

async function expectMainWindowMaximized(app) {
  await waitForMainWindowState(app, (state) => state.isMaximized);
}

async function expectMainWindowFullScreen(app) {
  await waitForMainWindowState(app, (state) => state.isFullScreen);
}

async function waitForMainWindowState(app, predicate) {
  const deadline = Date.now() + 5_000;

  while (Date.now() < deadline) {
    const state = await app.evaluate(({ BrowserWindow }) => {
      const window = BrowserWindow.getAllWindows()[0];

      if (!window) {
        throw new Error("Expected a main window");
      }

      return {
        isFullScreen: window.isFullScreen(),
        isMaximized: window.isMaximized()
      };
    });

    if (predicate(state)) {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, 50));
  }

  throw new Error("Expected the main window to reach its presentation state");
}

async function expectSettingsScrollable(window) {
  const dialog = window.getByRole("dialog");
  const form = dialog.locator("form");
  const before = await form.evaluate((element) => ({
    clientHeight: element.clientHeight,
    scrollHeight: element.scrollHeight,
    scrollTop: element.scrollTop
  }));

  await window.getByRole("heading", { name: "Settings" }).hover();
  await window.mouse.wheel(0, 500);
  await window.waitForTimeout(100);

  const after = await form.evaluate((element) => element.scrollTop);

  if (before.scrollHeight <= before.clientHeight || after <= before.scrollTop) {
    throw new Error(
      `Expected settings to scroll, got ${JSON.stringify({ after, before })}`
    );
  }

  // Synthetic wheel events bypass macOS drag-region hit testing, so also assert
  // the overlay cancels drag regions underneath it (e.g. the no-file empty
  // state). Without no-drag, real trackpad/wheel input never reaches the panel.
  const appRegion = await dialog.evaluate(
    (element) =>
      getComputedStyle(element.parentElement).getPropertyValue("-webkit-app-region") ||
      getComputedStyle(element.parentElement).webkitAppRegion
  );
  if (appRegion !== "no-drag") {
    throw new Error(
      `Expected settings overlay to be -webkit-app-region: no-drag, got "${appRegion}"`
    );
  }
}

async function expectHoverBackgroundChange(locator, label) {
  const before = await locator.evaluate(
    (element) => getComputedStyle(element).backgroundColor
  );
  await locator.hover();
  const after = await locator.evaluate(
    (element) => getComputedStyle(element).backgroundColor
  );

  if (before === after) {
    throw new Error(`Expected ${label} hover background to change from ${before}`);
  }
}

async function expectNoDragRegion(locator, label) {
  const appRegion = await locator.evaluate(
    (element) =>
      getComputedStyle(element).getPropertyValue("-webkit-app-region") ||
      getComputedStyle(element).webkitAppRegion
  );

  if (appRegion !== "no-drag") {
    throw new Error(
      `Expected ${label} to be -webkit-app-region: no-drag, got "${appRegion}"`
    );
  }
}

async function expectNoOuterFocusOutline(locator, label) {
  const outlineStyle = await locator.evaluate(
    (element) => getComputedStyle(element).outlineStyle
  );

  if (outlineStyle !== "none") {
    throw new Error(
      `Expected ${label} to avoid an outer focus outline, got "${outlineStyle}"`
    );
  }
}

async function expectEditorChoice(window, expectedValue) {
  await window
    .getByRole("button", { name: `Editor: ${expectedValue}` })
    .waitFor({ timeout: 10_000 });
}
