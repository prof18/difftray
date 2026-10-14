import { randomUUID } from "node:crypto";
import {
  lstat,
  mkdir,
  readdir,
  rename,
  rmdir,
  unlink,
  writeFile
} from "node:fs/promises";
import path from "node:path";
import {
  assertPrivateAgentPath,
  ensureAgentDirectory
} from "../shared/agent-endpoint.js";
import { AgentProtocolError, STARTUP_TIMEOUT_MS } from "../shared/agent-protocol.js";

const ownerPattern = /^owner-([1-9]\d*)-[a-f0-9-]{36}$/;
const code = (error: unknown) => (error as NodeJS.ErrnoException).code;
async function removeClaim(directory: string, owner: string): Promise<void> {
  try {
    await unlink(path.join(directory, owner));
  } catch (error) {
    if (code(error) !== "ENOENT") throw error;
  }
  try {
    await rmdir(directory);
  } catch (error) {
    if (!["ENOENT", "ENOTEMPTY", "EEXIST"].includes(code(error) ?? "")) throw error;
  }
}

/** Atomically publish a populated directory; never expose an empty new claim.
 * This prevents stale reclaimers from deleting a newly acquired claim. A crashed
 * caller's claim is retained for the startup window because its GUI may be warming.
 */
export async function acquireAgentStartup(
  profile: string
): Promise<(() => Promise<void>) | undefined> {
  const { directory } = await ensureAgentDirectory(profile);
  const destination = path.join(directory, "startup");
  const owner = `owner-${String(process.pid)}-${randomUUID()}`;
  const candidate = path.join(directory, `.${owner}`);
  await mkdir(candidate, { mode: 0o700 });
  let acquired = false;
  try {
    await writeFile(path.join(candidate, owner), "", { flag: "wx", mode: 0o600 });
    try {
      const existing = await lstat(destination);
      assertPrivateAgentPath(existing, "directory");
    } catch (error) {
      if (code(error) !== "ENOENT") throw error;
    }
    try {
      await rename(candidate, destination);
      acquired = true;
      return () => removeClaim(destination, owner);
    } catch (error) {
      if (!["EEXIST", "ENOTEMPTY"].includes(code(error) ?? "")) throw error;
    }
    try {
      assertPrivateAgentPath(await lstat(destination), "directory");
      const entries = await readdir(destination);
      if (entries.length === 0) return;
      const name = entries[0] ?? "";
      const match = ownerPattern.exec(name);
      if (entries.length !== 1 || !match)
        throw new AgentProtocolError("unauthorized", "Unsafe local startup claim.");
      const metadata = await lstat(path.join(destination, name));
      assertPrivateAgentPath(metadata, "file");
      if (Date.now() - metadata.mtimeMs < STARTUP_TIMEOUT_MS) return;
      try {
        process.kill(Number(match[1]), 0);
        return;
      } catch (error) {
        if (code(error) !== "ESRCH") return;
      }
      // Only this immutable, uniquely named dead owner's file can be removed.
      // A replacement directory is nonempty, so rmdir cannot remove it.
      await removeClaim(destination, name);
    } catch (error) {
      if (code(error) !== "ENOENT") throw error;
    }
    return;
  } finally {
    if (!acquired) await removeClaim(candidate, owner);
  }
}
