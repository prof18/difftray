import { mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { describe, expect, it, vi } from "vitest";
import { MAX_REQUEST_BYTES } from "../shared/agent-protocol.js";
import { parseCliArguments } from "./commands.js";
import { withSubmissionInput } from "./submission-input.js";
const contextId = `ctx_${"a".repeat(32)}`;
const submission = {
  actor: { name: "Codex", runId: "run-1" },
  requestId: "request-1",
  items: [{ kind: "overall", expectedNoteVersion: "absent", body: "Finding" }]
};
const command = (extra: string[] = [], input = "-") => {
  const parsed = parseCliArguments([
    "feedback",
    "submit",
    "--context",
    contextId,
    "--input",
    input,
    ...extra
  ]);
  if (parsed.kind !== "feedback.submit") throw new Error("Wrong command");
  return parsed;
};
const stdin = (value: unknown) => Readable.from([Buffer.from(JSON.stringify(value))]);
describe("bounded feedback submission input", () => {
  it("validates before runtime and accepts matching overrides", async () => {
    const run = vi.fn(async (params) => params);
    expect(
      await withSubmissionInput(
        command(["--request-id", "request-1"]),
        run,
        stdin(submission)
      )
    ).toEqual({ contextId, submission });
    expect(run).toHaveBeenCalledOnce();
  });
  it("uses an override when the document omits requestId", async () => {
    const document = { actor: submission.actor, items: submission.items };
    expect(
      await withSubmissionInput(
        command(["--request-id", "override"]),
        async (params) => params,
        stdin(document)
      )
    ).toEqual({ contextId, submission: { ...document, requestId: "override" } });
  });
  it.each([
    { ...submission, unknown: true },
    { ...submission, actor: { ...submission.actor, kind: "human" } },
    { ...submission, requestId: "bad id" },
    {
      ...submission,
      items: [{ kind: "file", path: "../secret", diffHash: "hash", body: "Finding" }]
    },
    {
      ...submission,
      items: [
        {
          kind: "line",
          path: "a.ts",
          diffHash: "hash",
          side: "additions",
          lineStart: 2,
          lineEnd: 1,
          body: "Finding"
        }
      ]
    },
    { ...submission, items: [{ ...submission.items[0], body: "   " }] }
  ])("rejects invalid schema before runtime: %j", async (value) => {
    const run = vi.fn();
    await expect(withSubmissionInput(command(), run, stdin(value))).rejects.toMatchObject(
      { exitCode: 2 }
    );
    expect(run).not.toHaveBeenCalled();
  });
  it("rejects conflicting IDs before runtime", async () => {
    const run = vi.fn();
    await expect(
      withSubmissionInput(command(["--request-id", "other"]), run, stdin(submission))
    ).rejects.toThrow("agree");
    expect(run).not.toHaveBeenCalled();
  });
  it("counts bytes across chunks and propagates unreadable stdin before runtime", async () => {
    const run = vi.fn();
    await expect(
      withSubmissionInput(
        command(),
        run,
        Readable.from([Buffer.alloc(MAX_REQUEST_BYTES), Buffer.from(" ")])
      )
    ).rejects.toThrow("1 MiB");
    const broken = new Readable({
      read() {
        this.destroy(new Error("Cannot read stdin"));
      }
    });
    await expect(withSubmissionInput(command(), run, broken)).rejects.toThrow(
      "Cannot read stdin"
    );
    expect(run).not.toHaveBeenCalled();
  });
  it("accepts exactly 1 MiB of valid JSON input", async () => {
    const json = Buffer.from(JSON.stringify(submission));
    const bytes = Buffer.concat([
      json,
      Buffer.alloc(MAX_REQUEST_BYTES - json.length, 32)
    ]);
    expect(
      await withSubmissionInput(
        command(),
        async (params) => params,
        Readable.from([bytes])
      )
    ).toEqual({ contextId, submission });
  });
  it.each([
    Buffer.from("{"),
    Buffer.from([0xc3, 0x28]),
    Buffer.alloc(MAX_REQUEST_BYTES + 1, 32)
  ])("rejects malformed JSON, UTF-8 and oversized stdin", async (bytes) => {
    const run = vi.fn();
    await expect(
      withSubmissionInput(command(), run, Readable.from([bytes]))
    ).rejects.toMatchObject({ exitCode: 2 });
    expect(run).not.toHaveBeenCalled();
  });
  it("reads files and rejects missing and oversized files", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "difftray-submit-"));
    const file = path.join(directory, "input.json");
    await writeFile(file, JSON.stringify(submission));
    expect(
      await withSubmissionInput(command([], file), async (params) => params)
    ).toEqual({ contextId, submission });
    const run = vi.fn();
    await expect(
      withSubmissionInput(command([], path.join(directory, "missing")), run)
    ).rejects.toMatchObject({ exitCode: 2 });
    await writeFile(file, Buffer.alloc(MAX_REQUEST_BYTES + 1));
    await expect(withSubmissionInput(command([], file), run)).rejects.toMatchObject({
      exitCode: 2
    });
    expect(run).not.toHaveBeenCalled();
  });
});
