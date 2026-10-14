import { describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseCliArguments } from "./commands.js";
import { withSubmissionInput } from "./submission-input.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const packageRoot = path.join(root, "integrations/agents/difftray");
const contextId = "ctx_0123456789abcdef0123456789abcdef";

describe("portable agent skill", () => {
  it("documents commands the current parser accepts", () => {
    const text = readFileSync(
      path.join(packageRoot, "skills/difftray/references/commands.md"),
      "utf8"
    );
    for (const command of [
      "open",
      "review inspect",
      "review files",
      "review file",
      "review feedback",
      "review export",
      "feedback submit"
    ])
      expect(text).toContain(`"$cli" ${command}`);
    const examples = [
      ["open", "/repo", "--json"],
      ["review", "inspect", "--repo", "/repo", "--json"],
      ["review", "files", "--context", contextId, "--limit", "100", "--json"],
      ["review", "file", "--context", contextId, "--path", "src/a.ts", "--json"],
      [
        "review",
        "feedback",
        "--context",
        contextId,
        "--include-inactive",
        "--limit",
        "100",
        "--json"
      ],
      ["review", "export", "--context", contextId, "--format", "json", "--json"],
      [
        "feedback",
        "submit",
        "--context",
        contextId,
        "--input",
        "/tmp/payload.json",
        "--json"
      ]
    ];
    for (const argv of examples) expect(() => parseCliArguments(argv)).not.toThrow();
  });

  it("keeps the original batch identity for uncertain retries and separates concurrent runs", () => {
    const reference = readFileSync(
      path.join(packageRoot, "skills/difftray/references/commands.md"),
      "utf8"
    );
    expect(reference).toContain("/usr/bin/uuidgen");
    expect(reference).toMatch(/concurrent runs.*separate `runId`/);
    expect(reference).toMatch(
      /uncertain retry uses the original `contextId`, JSON bytes, run ID, and request ID/
    );
    expect(reference).toMatch(/new request ID/);
  });

  it("validates saved batches for concurrent runs, exact resumed retry, and revised conflict", async () => {
    const temporary = mkdtempSync(path.join(tmpdir(), "difftray-batches-"));
    try {
      const uuid = () => {
        const result = spawnSync("/usr/bin/uuidgen", [], { encoding: "utf8" });
        expect(result.status).toBe(0);
        expect(result.stdout.trim()).toMatch(/^[A-Za-z0-9_.-]{1,128}$/);
        return result.stdout.trim();
      };
      const runA = uuid();
      const runB = uuid();
      expect(runB).not.toBe(runA);
      const createBatch = (runId: string, requestId: string, body: string) => ({
        actor: { name: "Same agent", runId },
        requestId,
        items: [{ kind: "overall", expectedNoteVersion: "absent", body }]
      });
      const originalContext = contextId;
      const original = createBatch(runA, uuid(), "First finding");
      const other = createBatch(runB, uuid(), "Other finding");
      expect(other.requestId).not.toBe(original.requestId);
      const savedPayload = path.join(temporary, "submission.json");
      const savedBytes = JSON.stringify(original);
      writeFileSync(savedPayload, savedBytes);
      const command = parseCliArguments([
        "feedback",
        "submit",
        "--context",
        originalContext,
        "--input",
        savedPayload
      ]);
      expect(command.kind).toBe("feedback.submit");
      if (command.kind !== "feedback.submit") return;
      const first = await withSubmissionInput(command, async (params) => params);
      const resumed = await withSubmissionInput(command, async (params) => params);
      expect(resumed).toEqual(first);
      expect(readFileSync(savedPayload, "utf8")).toBe(savedBytes);
      const revised = createBatch(runA, uuid(), "Reconciled finding");
      expect(revised.requestId).not.toBe(original.requestId);
      writeFileSync(savedPayload, JSON.stringify(revised));
      const afterConflict = await withSubmissionInput(command, async (params) => params);
      expect(afterConflict.submission.requestId).toBe(revised.requestId);
      expect(afterConflict.contextId).toBe(originalContext);
    } finally {
      rmSync(temporary, { recursive: true, force: true });
    }
  });
});
