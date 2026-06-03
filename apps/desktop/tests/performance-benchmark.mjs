import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, realpath, readdir, rm, stat, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { performance } from "node:perf_hooks";
import path from "node:path";

import {
  createDiffHash,
  createReviewTargetId,
  resolveReviewStates
} from "@difftray/core";
import {
  loadBranchDiffSummaries,
  loadBranchFileDiff,
  loadWorkingTreeDiffSummaries,
  loadWorkingTreeFileDiff
} from "@difftray/git";
import { openStorage } from "@difftray/storage";
import { _electron as electron } from "playwright";

const require = createRequire(import.meta.url);
const cwd = path.resolve(import.meta.dirname, "..");
const workspaceRoot = path.resolve(cwd, "../..");
const executablePath = require("electron");

const configuredRepoPath = process.env.DIFFTRAY_BENCH_REPO?.trim();
const configuredBaseRef = process.env.DIFFTRAY_BENCH_BASE_REF?.trim();
const fileCount = numberFromEnv("DIFFTRAY_BENCH_FILE_COUNT", 300);
const iterations = numberFromEnv("DIFFTRAY_BENCH_ITERATIONS", 12);
const reviewStateCount = numberFromEnv("DIFFTRAY_BENCH_REVIEW_STATE_COUNT", 5_000);
const sampleCount = numberFromEnv("DIFFTRAY_BENCH_SAMPLES", 1);
const outputPath = process.env.DIFFTRAY_BENCH_OUTPUT?.trim();
const ownedTempRoots = [];

const rawFixture = configuredRepoPath
  ? {
      baseRef: configuredBaseRef,
      kind: "external",
      repoPath: path.resolve(configuredRepoPath)
    }
  : await createLargeChangedRepository(fileCount);
const fixture = {
  ...rawFixture,
  repoPath: await realpath(rawFixture.repoPath)
};

if (fixture.kind === "generated") {
  ownedTempRoots.push(fixture.parentPath);
}

const gitBenchmark = await benchmarkGit(fixture);

try {
  const packageBenchmark = await benchmarkPackage();
  const reviewStateBenchmark = benchmarkReviewState(reviewStateCount);
  const samples = [];

  for (let sampleIndex = 0; sampleIndex < sampleCount; sampleIndex += 1) {
    samples.push(await benchmarkSample(fixture, gitBenchmark.files, iterations));
  }

  const result = {
    benchmark: "difftray-large-changeset-v1",
    fixture: {
      baseRef: fixture.baseRef ?? null,
      changedFiles: gitBenchmark.changedFiles,
      deletions: gitBenchmark.deletions,
      insertions: gitBenchmark.insertions,
      kind: fixture.kind,
      repoPath: fixture.repoPath
    },
    git: {
      firstFileMs: gitBenchmark.firstFileMs,
      summaryMs: gitBenchmark.summaryMs
    },
    package: packageBenchmark,
    reviewState: reviewStateBenchmark,
    samples,
    ui: summarizeUiSamples(samples.map((sample) => sample.ui))
  };

  const serialized = `${JSON.stringify(result, null, 2)}\n`;
  process.stdout.write(serialized);

  if (outputPath) {
    const resolvedOutputPath = path.resolve(workspaceRoot, outputPath);
    await mkdir(path.dirname(resolvedOutputPath), { recursive: true });
    await writeFile(resolvedOutputPath, serialized, "utf8");
  }
} finally {
  await Promise.all(
    ownedTempRoots.map((tempRoot) => rm(tempRoot, { force: true, recursive: true }))
  );
}

async function benchmarkSample(fixture, files, iterationCount) {
  const userDataPath = await mkdtemp(path.join(tmpdir(), "difftray-bench-user-data-"));

  ownedTempRoots.push(userDataPath);
  await seedRecentProject(userDataPath, fixture.repoPath, fixture.baseRef);

  const app = await electron.launch({
    args: [path.resolve(cwd, "dist/main/index.cjs")],
    cwd,
    env: {
      ...process.env,
      DIFFTRAY_BOOT_PROJECT: fixture.repoPath,
      DIFFTRAY_USER_DATA_DIR: userDataPath,
      DIFFTRAY_WINDOW_PRESENTATION: process.env.DIFFTRAY_WINDOW_PRESENTATION ?? "inactive"
    },
    executablePath
  });

  try {
    app.on("window", (nextWindow) => {
      attachPageDiagnostics(nextWindow);
    });

    return {
      sample: new Date().toISOString(),
      ui: await benchmarkUi(app, files, iterationCount)
    };
  } finally {
    await app.close();
  }
}

async function benchmarkGit(fixture) {
  const summaryStart = performance.now();
  const summary = fixture.baseRef
    ? await loadBranchDiffSummaries(fixture.repoPath, fixture.baseRef)
    : await loadWorkingTreeDiffSummaries(fixture.repoPath);
  const summaryMs = elapsed(summaryStart);
  const firstFilePath = summary.files.find((file) => file.status !== "deleted")?.newPath;
  const firstFileStart = performance.now();

  if (firstFilePath) {
    if (fixture.baseRef) {
      await loadBranchFileDiff(fixture.repoPath, fixture.baseRef, firstFilePath);
    } else {
      await loadWorkingTreeFileDiff(fixture.repoPath, firstFilePath);
    }
  }

  const shortStat = gitOutput(fixture.repoPath, [
    "diff",
    "--shortstat",
    ...(fixture.baseRef ? [`${fixture.baseRef}...HEAD`] : [])
  ]);

  return {
    changedFiles: summary.files.length,
    deletions: shortStatNumber(shortStat, "deletions"),
    files: summary.files.map((file) => file.newPath),
    firstFileMs: firstFilePath ? elapsed(firstFileStart) : 0,
    insertions: shortStatNumber(shortStat, "insertions"),
    summaryMs
  };
}

async function benchmarkPackage() {
  const rendererDistPath = path.join(cwd, "dist", "renderer");
  const rendererAssetsPath = path.join(rendererDistPath, "assets");
  const assetEntries = await readdir(rendererAssetsPath);
  const indexChunks = assetEntries.filter(
    (entry) => entry.startsWith("index-") && entry.endsWith(".js")
  );

  return {
    rendererDistBytes: await directorySize(rendererDistPath),
    rendererIndexChunkCount: indexChunks.length,
    rendererIndexChunks: indexChunks.sort()
  };
}

function benchmarkReviewState(nextFileCount) {
  const reviewTarget = {
    headSha: "benchmark-head",
    kind: "working_tree",
    projectId: "benchmark-project"
  };
  const reviewTargetId = createReviewTargetId(reviewTarget);
  const diffs = Array.from({ length: nextFileCount }, (_, index) => ({
    content: {
      kind: "text",
      patch: `@@ -1 +1 @@\n-old ${index}\n+new ${index}\n`
    },
    newPath: `src/Benchmark${String(index).padStart(5, "0")}.ts`,
    status: "modified"
  }));
  const marks = diffs.map((diff) => ({
    path: diff.newPath,
    reviewedDiffHash: createDiffHash(reviewTarget, diff),
    reviewTargetId
  }));
  const start = performance.now();
  const states = resolveReviewStates({
    diffs,
    marks,
    reviewTarget
  });

  return {
    fileCount: nextFileCount,
    reviewedCount: states.filter((state) => state.reviewed).length,
    resolveMs: elapsed(start)
  };
}

async function benchmarkUi(app, files, iterationCount) {
  const loadStart = performance.now();
  const window = await app.firstWindow();

  attachPageDiagnostics(window);
  await window.waitForLoadState("domcontentloaded");
  await waitForFirstFileButton(window);
  await expectWorkspaceIdle(window, 60_000);

  const workspaceLoadMs = elapsed(loadStart);
  const visibleFiles = await currentRenderedFilePaths(window);
  const selectableFiles = files.filter((filePath) => !isLikelyHiddenGenerated(filePath));
  const targets = spacedTargets(selectableFiles, iterationCount + 4);
  const firstTarget = targets[0] ?? visibleFiles[0];
  const commentTarget =
    selectableFiles.find((filePath) => filePath.endsWith("BenchmarkScreen000.kt")) ??
    firstTarget;

  if (!firstTarget) {
    return {
      commentSaveMs: null,
      fileSelectionP95Ms: null,
      markReviewedNextDiffReadyMs: null,
      markReviewedSelectionMs: null,
      markReviewedMs: null,
      selectionOverrideCount: 0,
      workspaceLoadMs
    };
  }

  const fileSelectionTimings = [];

  for (const [index, filePath] of targets.slice(0, iterationCount).entries()) {
    const selectStart = performance.now();
    await selectFile(window, filePath, files.indexOf(filePath));
    await expectSelectedFile(window, filePath);
    await expectSelectedDiffReady(window);
    fileSelectionTimings.push(elapsed(selectStart));

    if (index === 0) {
      await window.waitForTimeout(100);
    }
  }

  const commentSaveMs = await benchmarkCommentSave(window, commentTarget, files);
  const markReviewed = await benchmarkMarkReviewed(window, files, targets);
  const selectionOverrideCount = await benchmarkSelectionOverride(window, files, targets);

  return {
    commentSaveMs,
    fileSelectionP50Ms: percentile(fileSelectionTimings, 0.5),
    fileSelectionP95Ms: percentile(fileSelectionTimings, 0.95),
    fileSelectionSamples: fileSelectionTimings,
    markReviewedMs: markReviewed.reviewedMs,
    markReviewedNextDiffReadyMs: markReviewed.nextDiffReadyMs,
    markReviewedSelectionMs: markReviewed.selectionMs,
    selectionOverrideCount,
    workspaceLoadMs
  };
}

async function waitForFirstFileButton(window) {
  try {
    await firstFileButton(window).waitFor({ timeout: 60_000 });
  } catch (error) {
    const state = await window.evaluate(() => {
      return {
        bodyText: document.body.innerText.slice(0, 1_000),
        fileButtonCount: document.querySelectorAll("button[data-file-path]").length,
        html: document.body.innerHTML.slice(0, 2_000),
        title: document.title
      };
    });

    throw new Error(`Timed out waiting for changed file rows: ${JSON.stringify(state)}`, {
      cause: error
    });
  }
}

function attachPageDiagnostics(window) {
  window.on("console", (message) => {
    const text = message.text();

    if (text.includes("violates the following Content Security Policy directive")) {
      return;
    }

    if (message.type() === "error") {
      process.stderr.write(`[renderer:${message.type()}] ${text}\n`);
    }
  });
  window.on("pageerror", (error) => {
    process.stderr.write(`[renderer:pageerror] ${error.stack ?? error.message}\n`);
  });
}

async function benchmarkMarkReviewed(window, files, targets) {
  const target = targets[0];

  if (!target) {
    return {
      nextDiffReadyMs: null,
      reviewedMs: null,
      selectionMs: null
    };
  }

  const expectedNext = nextSelectablePathAfter(files, target);

  await selectFile(window, target, files.indexOf(target));
  await expectSelectedDiffReady(window);
  const start = performance.now();
  await window.keyboard.press("KeyR");
  await expectFileReviewState(window, target, "reviewed");
  const reviewedMs = elapsed(start);
  let selectionMs = null;
  let nextDiffReadyMs = null;

  if (expectedNext && expectedNext !== target) {
    await expectSelectedFile(window, expectedNext);
    selectionMs = elapsed(start);
    await expectSelectedDiffReady(window);
    nextDiffReadyMs = elapsed(start);
  }

  return {
    nextDiffReadyMs,
    reviewedMs,
    selectionMs
  };
}

async function benchmarkSelectionOverride(window, files, targets) {
  let overrides = 0;

  for (let index = 1; index < Math.min(targets.length - 1, 6); index += 1) {
    const reviewedTarget = targets[index];
    const userTarget = targets[index + 1];

    if (!reviewedTarget || !userTarget) {
      continue;
    }

    await selectFile(window, reviewedTarget, files.indexOf(reviewedTarget));
    await expectSelectedDiffReady(window);
    await window.keyboard.press("KeyR");
    await selectFile(window, userTarget, files.indexOf(userTarget));
    await window.waitForTimeout(1_500);

    const selectedPath = await selectedFilePath(window);
    if (selectedPath !== userTarget) {
      overrides += 1;
    }
  }

  return overrides;
}

async function benchmarkCommentSave(window, filePath, files) {
  try {
    await selectFile(window, filePath, files.indexOf(filePath));
    await expectSelectedDiffReady(window);
    await clickFirstAdditionLine(window);
    await window
      .locator('textarea[aria-label="Review comment"]')
      .fill("Benchmark comment");
    const start = performance.now();
    await window.getByRole("button", { name: "Save" }).click();
    await window.getByText("Benchmark comment", { exact: true }).waitFor({
      timeout: 60_000
    });

    return elapsed(start);
  } catch (error) {
    process.stderr.write(
      `[benchmark] skipped comment save benchmark: ${
        error instanceof Error ? error.message : String(error)
      }\n`
    );
    return null;
  }
}

async function createLargeChangedRepository(nextFileCount) {
  const parentPath = await mkdtemp(path.join(tmpdir(), "difftray-bench-repo-"));
  const repoPath = path.join(parentPath, "large-changeset");
  const modifiedFileCount = Math.max(12, Math.min(35, Math.floor(nextFileCount * 0.12)));
  const addedFileCount = Math.max(1, nextFileCount - modifiedFileCount);

  await mkdir(repoPath);
  git(repoPath, ["init", "--initial-branch=main"]);
  git(repoPath, ["config", "user.email", "bench@example.invalid"]);
  git(repoPath, ["config", "user.name", "Difftray Benchmark"]);
  await mkdir(path.join(repoPath, "androidApp", "src", "main", "kotlin"), {
    recursive: true
  });
  await mkdir(path.join(repoPath, "e2e", "maestro", "android", "regression"), {
    recursive: true
  });

  for (let index = 0; index < modifiedFileCount; index += 1) {
    await writeModifiedFixtureFile(repoPath, index, "baseline");
  }

  git(repoPath, ["add", "."]);
  git(repoPath, ["commit", "-m", "Baseline"]);
  git(repoPath, ["checkout", "-b", "large-changeset"]);

  for (let index = 0; index < modifiedFileCount; index += 1) {
    await writeModifiedFixtureFile(repoPath, index, "changed");
  }

  for (let index = 0; index < addedFileCount; index += 1) {
    await writeAddedFixtureFile(repoPath, index);
  }

  git(repoPath, ["add", "."]);
  git(repoPath, ["commit", "-m", "Large benchmark changeset"]);

  return {
    baseRef: "main",
    kind: "generated",
    parentPath,
    repoPath
  };
}

async function writeModifiedFixtureFile(repoPath, index, variant) {
  const lines = Array.from({ length: 42 }, (_, lineIndex) => {
    if (variant === "changed" && lineIndex < 3) {
      return `const val modified_${index}_${lineIndex} = "${index}-${lineIndex}"`;
    }

    return `const val stable_${index}_${lineIndex} = "${lineIndex}"`;
  });

  await writeFile(
    path.join(
      repoPath,
      "androidApp",
      "src",
      "main",
      "kotlin",
      `BenchmarkScreen${String(index).padStart(3, "0")}.kt`
    ),
    `${lines.join("\n")}\n`,
    "utf8"
  );
}

async function writeAddedFixtureFile(repoPath, index) {
  const isYaml = index % 3 === 0;
  const relativePath = isYaml
    ? path.join(
        "e2e",
        "maestro",
        "android",
        "regression",
        `${String(index + 100).padStart(3, "0")}-benchmark-flow.yaml`
      )
    : path.join(
        "androidApp",
        "src",
        "main",
        "kotlin",
        `BenchmarkE2eIds${String(index).padStart(3, "0")}.kt`
      );
  const lineCount = isYaml ? 30 : 36;
  const lines = Array.from({ length: lineCount }, (_, lineIndex) =>
    isYaml
      ? `- assertVisible: "Benchmark ${index} step ${lineIndex}"`
      : `const val benchmarkId_${index}_${lineIndex} = "benchmark_${index}_${lineIndex}"`
  );

  await writeFile(path.join(repoPath, relativePath), `${lines.join("\n")}\n`, "utf8");
}

async function seedRecentProject(userDataPath, repoPath, baseRef) {
  const dataDir = path.join(userDataPath, "data");
  await mkdir(dataDir, { recursive: true });
  const storage = openStorage(path.join(dataDir, "difftray.sqlite"));

  try {
    storage.upsertProject({
      ...(baseRef ? { defaultBaseRef: baseRef } : {}),
      id: repoPath,
      lastOpenedAt: new Date().toISOString(),
      name: path.basename(repoPath),
      path: repoPath
    });
  } finally {
    storage.close();
  }
}

async function selectFile(window, filePath, index) {
  const baseIndex = Math.max(0, index);
  const offsets = [0, -8, 8, -16, 16, -32, 32, -64, 64];

  for (const offset of offsets) {
    await scrollFileListNear(window, Math.max(0, baseIndex + offset));

    const clicked = await window
      .waitForFunction(
        (targetPath) => {
          const button = [...document.querySelectorAll("button[data-file-path]")].find(
            (candidate) => candidate.getAttribute("data-file-path") === targetPath
          );

          if (!(button instanceof HTMLButtonElement)) {
            return false;
          }

          button.click();
          return true;
        },
        filePath,
        { timeout: 500 }
      )
      .then(() => true)
      .catch(() => false);

    if (clicked) {
      return;
    }
  }

  throw new Error(`File button is not rendered: ${filePath}`);
}

async function scrollFileListNear(window, index) {
  await window.evaluate((targetIndex) => {
    const fileButton = document.querySelector("button[data-file-path]");
    let scrollContainer = fileButton?.parentElement;

    while (
      scrollContainer &&
      scrollContainer.scrollHeight <= scrollContainer.clientHeight
    ) {
      scrollContainer = scrollContainer.parentElement;
    }

    if (scrollContainer) {
      scrollContainer.scrollTop = Math.max(0, targetIndex * 54 - 108);
      scrollContainer.dispatchEvent(new Event("scroll", { bubbles: true }));
    }
  }, index);
}

function firstFileButton(window) {
  return window.locator("button[data-file-path]").first();
}

async function currentRenderedFilePaths(window) {
  return window
    .locator("button[data-file-path]")
    .evaluateAll((buttons) =>
      buttons
        .map((button) => button.getAttribute("data-file-path"))
        .filter((filePath) => filePath !== null)
    );
}

async function expectSelectedFile(window, filePath) {
  await window.waitForFunction((targetPath) => {
    return (
      document
        .querySelector('button[data-selected="true"]')
        ?.getAttribute("data-file-path") === targetPath
    );
  }, filePath);
}

async function selectedFilePath(window) {
  return window.evaluate(() => {
    return (
      document
        .querySelector('button[data-selected="true"]')
        ?.getAttribute("data-file-path") ?? null
    );
  });
}

async function expectFileReviewState(window, filePath, state) {
  await window.waitForFunction(
    ([targetPath, targetState]) => {
      const fileButton = [...document.querySelectorAll("button[data-file-path]")].find(
        (candidate) => candidate.getAttribute("data-file-path") === targetPath
      );

      if (!(fileButton instanceof HTMLButtonElement)) {
        return false;
      }

      return (
        fileButton.querySelector("[data-state]")?.getAttribute("data-state") ===
        targetState
      );
    },
    [filePath, state],
    { timeout: 60_000 }
  );
}

async function expectSelectedDiffReady(window) {
  await window.waitForFunction(
    () => {
      const selectedButton = document.querySelector('button[data-selected="true"]');
      const reviewButton = [...document.querySelectorAll("button")].find((button) => {
        const text = button.textContent ?? "";

        return text.includes("Mark reviewed") || text.includes("Unmark reviewed");
      });

      return Boolean(
        selectedButton &&
        reviewButton instanceof HTMLButtonElement &&
        !reviewButton.disabled &&
        !document.querySelector('[class*="diffPreparingState"]') &&
        document.querySelector("[data-diff-layout]")
      );
    },
    undefined,
    { timeout: 60_000 }
  );
}

async function expectWorkspaceIdle(window, timeout) {
  await window.locator('section[aria-busy="false"]').waitFor({ timeout });
}

async function clickFirstAdditionLine(window) {
  const additions = window
    .locator('[data-additions] [data-column-number][data-line-type="change-addition"]')
    .first();

  await additions.click({ timeout: 60_000 });
}

function spacedTargets(files, count) {
  if (files.length === 0) {
    return [];
  }

  return Array.from({ length: Math.min(count, files.length) }, (_, index) => {
    const fileIndex =
      count <= 1 ? 0 : Math.floor((index / Math.max(1, count - 1)) * (files.length - 1));

    return files[fileIndex];
  }).filter((filePath, index, targets) => {
    return filePath !== undefined && targets.indexOf(filePath) === index;
  });
}

function isLikelyHiddenGenerated(filePath) {
  const normalized = filePath.toLowerCase();

  return (
    normalized.includes("/generated/") ||
    normalized.includes("/__generated__/") ||
    normalized.endsWith(".generated.ts") ||
    normalized.endsWith(".generated.tsx")
  );
}

function nextSelectablePathAfter(files, filePath) {
  const startIndex = files.indexOf(filePath);

  if (startIndex === -1) {
    return undefined;
  }

  return (
    files
      .slice(startIndex + 1)
      .find((candidate) => !isLikelyHiddenGenerated(candidate)) ??
    files.find((candidate) => !isLikelyHiddenGenerated(candidate))
  );
}

function numberFromEnv(name, fallback) {
  const parsed = Number(process.env[name]);

  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function percentile(values, ratio) {
  if (values.length === 0) {
    return null;
  }

  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(sorted.length - 1, Math.ceil(sorted.length * ratio) - 1);

  return sorted[index];
}

function summarizeUiSamples(samples) {
  const fileSelectionSamples = samples.flatMap((sample) => sample.fileSelectionSamples);

  return {
    commentSaveP50Ms: percentile(numberValues(samples, "commentSaveMs"), 0.5),
    commentSaveP95Ms: percentile(numberValues(samples, "commentSaveMs"), 0.95),
    fileSelectionP50Ms: percentile(fileSelectionSamples, 0.5),
    fileSelectionP95Ms: percentile(fileSelectionSamples, 0.95),
    markReviewedP50Ms: percentile(numberValues(samples, "markReviewedMs"), 0.5),
    markReviewedP95Ms: percentile(numberValues(samples, "markReviewedMs"), 0.95),
    markReviewedNextDiffReadyP50Ms: percentile(
      numberValues(samples, "markReviewedNextDiffReadyMs"),
      0.5
    ),
    markReviewedNextDiffReadyP95Ms: percentile(
      numberValues(samples, "markReviewedNextDiffReadyMs"),
      0.95
    ),
    markReviewedSelectionP50Ms: percentile(
      numberValues(samples, "markReviewedSelectionMs"),
      0.5
    ),
    markReviewedSelectionP95Ms: percentile(
      numberValues(samples, "markReviewedSelectionMs"),
      0.95
    ),
    sampleCount: samples.length,
    selectionOverrideTotal: samples.reduce(
      (total, sample) => total + sample.selectionOverrideCount,
      0
    ),
    workspaceLoadP50Ms: percentile(numberValues(samples, "workspaceLoadMs"), 0.5),
    workspaceLoadP95Ms: percentile(numberValues(samples, "workspaceLoadMs"), 0.95)
  };
}

function numberValues(samples, key) {
  return samples
    .map((sample) => sample[key])
    .filter((value) => typeof value === "number" && Number.isFinite(value));
}

async function directorySize(directoryPath) {
  const entries = await readdir(directoryPath, { withFileTypes: true });
  const sizes = await Promise.all(
    entries.map(async (entry) => {
      const entryPath = path.join(directoryPath, entry.name);

      if (entry.isDirectory()) {
        return directorySize(entryPath);
      }

      if (!entry.isFile()) {
        return 0;
      }

      return (await stat(entryPath)).size;
    })
  );

  return sizes.reduce((total, size) => total + size, 0);
}

function elapsed(start) {
  return Math.round(performance.now() - start);
}

function shortStatNumber(shortStat, label) {
  const match = new RegExp(`(\\d+) ${label}`).exec(shortStat);

  return match ? Number(match[1]) : 0;
}

function git(cwd, args) {
  execFileSync("git", args, {
    cwd,
    stdio: "ignore"
  });
}

function gitOutput(cwd, args) {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8"
  }).trim();
}
