import { execFile } from "node:child_process";
import {
  lstat,
  mkdir,
  mkdtemp,
  opendir,
  realpath,
  rm,
  writeFile
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { promisify } from "node:util";

import { openStorage } from "@difftray/storage";

const execFileAsync = promisify(execFile);
const workspaceRoot = path.resolve(import.meta.dirname, "../../..");
const directoryTiers = numberListFromEnv(
  "DIFFTRAY_REPOSITORY_BENCH_DIRECTORY_TIERS",
  [1_000, 5_000]
);
const repositoryTiers = numberListFromEnv(
  "DIFFTRAY_REPOSITORY_BENCH_REPOSITORY_TIERS",
  [10, 50]
);
const openProjectTiers = numberListFromEnv(
  "DIFFTRAY_REPOSITORY_BENCH_OPEN_PROJECT_TIERS",
  [10, 100, 1_000]
);
const outputPath = process.env.DIFFTRAY_REPOSITORY_BENCH_OUTPUT?.trim();
const excludedNames = new Set([".git", "build", "dist", "node_modules"]);
const ownedRoots = [];

try {
  const discovery = [];

  for (const directoryCount of directoryTiers) {
    for (const repositoryCount of repositoryTiers) {
      if (repositoryCount > directoryCount) {
        continue;
      }

      const fixture = await createDiscoveryFixture({ directoryCount, repositoryCount });
      ownedRoots.push(fixture.root);
      const markerFirst = await measure(() => discoverMarkerFirst(fixture.searchRoot));
      const perDirectoryGit = await measure(() =>
        discoverWithGitPerDirectory(fixture.searchRoot)
      );

      if (
        markerFirst.value.length !== repositoryCount ||
        perDirectoryGit.value.length !== repositoryCount
      ) {
        throw new Error(
          `Discovery mismatch for ${String(directoryCount)} directories and ${String(repositoryCount)} repositories: marker-first=${String(markerFirst.value.length)}, per-directory=${String(perDirectoryGit.value.length)}.`
        );
      }

      discovery.push({
        directoryCount,
        markerFirstMs: markerFirst.durationMs,
        perDirectoryGitMs: perDirectoryGit.durationMs,
        repositoryCount
      });
    }
  }

  const openProjects = openProjectTiers.map(benchmarkOpenProjects);
  const result = {
    benchmark: "difftray-repository-discovery-v1",
    discovery,
    openProjects,
    sample: new Date().toISOString()
  };
  const serialized = `${JSON.stringify(result, null, 2)}\n`;

  process.stdout.write(serialized);

  if (outputPath) {
    const resolvedOutputPath = path.resolve(workspaceRoot, outputPath);
    await mkdir(path.dirname(resolvedOutputPath), { recursive: true });
    await writeFile(resolvedOutputPath, serialized, "utf8");
  }
} finally {
  await Promise.all(ownedRoots.map((root) => rm(root, { force: true, recursive: true })));
}

async function createDiscoveryFixture({ directoryCount, repositoryCount }) {
  const root = await mkdtemp(path.join(tmpdir(), "difftray-repository-bench-"));
  const searchRoot = path.join(root, "approved-root");
  await mkdir(searchRoot);

  for (let index = 0; index < directoryCount; index += 1) {
    const bucket = path.join(
      searchRoot,
      `bucket-${String(index % 100).padStart(3, "0")}`
    );
    const candidate = path.join(bucket, `entry-${String(index).padStart(6, "0")}`);
    await mkdir(candidate, { recursive: true });

    if (index < repositoryCount) {
      await execFileAsync("git", ["init", "--quiet", candidate]);
    } else if (index % 251 === 0) {
      await mkdir(path.join(candidate, "node_modules", "ignored", ".git"), {
        recursive: true
      });
    }
  }

  return { root, searchRoot };
}

async function discoverMarkerFirst(root) {
  const candidates = [];

  await walkDirectories(root, async (directory, entries) => {
    if (entries.some((entry) => entry.name === ".git")) {
      candidates.push(directory);
      return false;
    }

    return true;
  });

  return validateCandidates(candidates);
}

async function discoverWithGitPerDirectory(root) {
  const candidates = [];

  await walkDirectories(root, async (directory) => {
    const resolved = await gitRootOrNull(directory);

    if (resolved === (await realpath(directory))) {
      candidates.push(directory);
      return false;
    }

    return true;
  });

  return uniqueRealPaths(candidates);
}

async function walkDirectories(root, visit) {
  const queue = [root];

  while (queue.length > 0) {
    const directory = queue.shift();
    const handle = await opendir(directory);
    const entries = [];

    for await (const entry of handle) {
      entries.push(entry);
    }

    if (!(await visit(directory, entries))) {
      continue;
    }

    for (const entry of entries) {
      if (
        !entry.isDirectory() ||
        entry.isSymbolicLink() ||
        excludedNames.has(entry.name)
      ) {
        continue;
      }

      const child = path.join(directory, entry.name);
      const childStat = await lstat(child);

      if (!childStat.isSymbolicLink()) {
        queue.push(child);
      }
    }
  }
}

async function validateCandidates(candidates) {
  const roots = [];

  for (const candidate of candidates) {
    const resolved = await gitRootOrNull(candidate);

    if (resolved) {
      roots.push(resolved);
    }
  }

  return uniqueRealPaths(roots);
}

async function gitRootOrNull(directory) {
  try {
    const { stdout } = await execFileAsync(
      "git",
      ["-C", directory, "rev-parse", "--show-toplevel"],
      { encoding: "utf8" }
    );

    return realpath(stdout.trimEnd());
  } catch {
    return null;
  }
}

async function uniqueRealPaths(paths) {
  return [...new Set(await Promise.all(paths.map((candidate) => realpath(candidate))))];
}

function benchmarkOpenProjects(projectCount) {
  const storage = openStorage(":memory:");

  try {
    for (let index = 0; index < projectCount; index += 1) {
      const id = `project-${String(index).padStart(6, "0")}`;
      storage.upsertProject({ id, name: id, path: `/fixture/${id}` });
      storage.appendProjectToTabOrder(id);
    }

    const start = performance.now();
    const openCount = storage.listOpenProjects().length;

    return {
      listOpenProjectsMs: elapsed(start),
      openCount,
      projectCount
    };
  } finally {
    storage.close();
  }
}

async function measure(operation) {
  const start = performance.now();
  const value = await operation();

  return { durationMs: elapsed(start), value };
}

function elapsed(start) {
  return Number((performance.now() - start).toFixed(2));
}

function numberListFromEnv(name, fallback) {
  const configured = process.env[name]?.trim();

  if (!configured) {
    return fallback;
  }

  const values = configured
    .split(",")
    .map((value) => Number.parseInt(value.trim(), 10))
    .filter((value) => Number.isInteger(value) && value > 0);

  if (values.length === 0) {
    throw new Error(`${name} must contain at least one positive integer.`);
  }

  return values;
}
