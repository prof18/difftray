import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { afterAll, beforeAll, describe, it } from "vitest";
import { openStorage, type DifftrayStorage } from "@difftray/storage";
import { createReviewContextService } from "./review-context-service.js";

// Agent reads validate their context on every call. Run with
// `pnpm bench:agent-reads`; the normal gate skips this suite.
const enabled = process.env.DIFFTRAY_AGENT_BENCH === "1";
const fileCount = Number(process.env.DIFFTRAY_AGENT_BENCH_FILE_COUNT ?? 300);
const iterations = Number(process.env.DIFFTRAY_AGENT_BENCH_ITERATIONS ?? 10);

function git(root: string, ...args: string[]) {
  execFileSync("git", ["-C", root, ...args], { stdio: "ignore" });
}
function writeModule(root: string, index: number, body: string) {
  const directory = path.join(root, `src/module-${index % 20}`);
  mkdirSync(directory, { recursive: true });
  writeFileSync(path.join(directory, `file-${index}.ts`), body);
}
async function median(run: () => Promise<unknown>): Promise<number> {
  await run();
  const samples: number[] = [];
  for (let index = 0; index < iterations; index += 1) {
    const start = performance.now();
    await run();
    samples.push(performance.now() - start);
  }
  samples.sort((a, b) => a - b);
  return Math.round(samples[Math.floor(samples.length / 2)] ?? 0);
}

describe.skipIf(!enabled)("agent context read benchmark", { timeout: 600_000 }, () => {
  let root = "";
  let storage: DifftrayStorage | undefined;
  beforeAll(() => {
    root = realpathSync(mkdtempSync(path.join(tmpdir(), "difftray-agent-bench-")));
    git(root, "init", "-b", "main");
    git(root, "config", "user.email", "bench@example.com");
    git(root, "config", "user.name", "Bench");
    for (let index = 0; index < fileCount; index += 1)
      writeModule(root, index, `export const value${index} = 0;\n`);
    git(root, "add", ".");
    git(root, "commit", "-m", "base");
    git(root, "branch", "base");
    for (let index = 0; index < fileCount; index += 1)
      writeModule(
        root,
        index,
        `export const value${index} = ${index};\nexport const next = 1;\n`
      );
    git(root, "commit", "-am", "change every file");
    for (let index = 0; index < fileCount; index += 2)
      writeModule(root, index, `export const value${index} = -${index};\n`);
    storage = openStorage(":memory:");
  });
  afterAll(() => {
    storage?.close();
    if (root) rmSync(root, { recursive: true, force: true });
  });

  it(`measures median milliseconds over ${fileCount} changed files`, async () => {
    if (!storage) throw new Error("Benchmark storage was not opened.");
    // Every inspect stores a context; lift the live-context cap for repeated runs.
    const contexts = createReviewContextService(storage, { maxContexts: 1_000_000 });
    const branch = await contexts.inspect(root, { kind: "branch", base: "base" });
    const workingTree = await contexts.inspect(root, { kind: "working-tree" });
    const result = {
      fileCount,
      iterations,
      inspectBranchMs: await median(() =>
        contexts.inspect(root, { kind: "branch", base: "base" })
      ),
      inspectWorkingTreeMs: await median(() =>
        contexts.inspect(root, { kind: "working-tree" })
      ),
      branchPageMs: await median(() =>
        contexts.withContext(branch.id, { live: false }, async () => null)
      ),
      branchLiveReadMs: await median(() =>
        contexts.withContext(branch.id, { live: true }, async () => null)
      ),
      workingTreePageMs: await median(() =>
        contexts.withContext(workingTree.id, { live: false }, async () => null)
      ),
      workingTreeLiveReadMs: await median(() =>
        contexts.withContext(workingTree.id, { live: true }, async () => null)
      )
    };
    process.stderr.write(`agent-read-benchmark ${JSON.stringify(result)}\n`);
  });
});
