import {
  mkdtemp,
  mkdir,
  readdir,
  realpath,
  rm,
  symlink,
  utimes,
  writeFile
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, it } from "vitest";
import { ensureAgentDirectory } from "../shared/agent-endpoint.js";
import { acquireAgentStartup } from "./agent-startup-lock.js";

it("admits only one concurrent launcher and releases its own claim", async () => {
  const profile = await realpath(await mkdtemp(path.join(tmpdir(), "startup-lock-")));
  const { directory } = await ensureAgentDirectory(profile);
  try {
    const claims = await Promise.all(
      Array.from({ length: 8 }, () => acquireAgentStartup(profile))
    );
    expect(claims.filter(Boolean)).toHaveLength(1);
    await claims.find(Boolean)?.();
    const next = await acquireAgentStartup(profile);
    expect(next).toBeTypeOf("function");
    await next?.();
    expect(await readdir(directory)).toEqual([]);
  } finally {
    await rm(directory, { recursive: true, force: true });
    await rm(profile, { recursive: true, force: true });
  }
});

it("recovers an old dead claimant without removing a replacement claim", async () => {
  const profile = await realpath(await mkdtemp(path.join(tmpdir(), "startup-lock-")));
  const { directory } = await ensureAgentDirectory(profile);
  const lock = path.join(directory, "startup");
  try {
    await mkdir(lock, { mode: 0o700 });
    const owner = path.join(lock, "owner-99999999-12345678-1234-1234-1234-123456789012");
    await writeFile(owner, "", { mode: 0o600 });
    expect(await acquireAgentStartup(profile)).toBeUndefined();
    await utimes(owner, new Date(0), new Date(0));
    const attempts = await Promise.all(
      Array.from({ length: 8 }, () => acquireAgentStartup(profile))
    );
    const next = attempts.find(Boolean) ?? (await acquireAgentStartup(profile));
    expect(next).toBeTypeOf("function");
    expect(attempts.filter(Boolean).length).toBeLessThanOrEqual(1);
    expect(await acquireAgentStartup(profile)).toBeUndefined();
    await next?.();
  } finally {
    await rm(directory, { recursive: true, force: true });
    await rm(profile, { recursive: true, force: true });
  }
});

it("refuses a symlink claim and preserves unrelated files", async () => {
  const profile = await realpath(await mkdtemp(path.join(tmpdir(), "startup-lock-")));
  const { directory } = await ensureAgentDirectory(profile);
  try {
    await symlink(profile, path.join(directory, "startup"));
    await expect(acquireAgentStartup(profile)).rejects.toMatchObject({
      code: "unauthorized"
    });
    expect(await readdir(profile)).toEqual([]);
  } finally {
    await rm(directory, { recursive: true, force: true });
    await rm(profile, { recursive: true, force: true });
  }
});
