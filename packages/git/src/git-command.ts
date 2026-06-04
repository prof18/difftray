import { execFile, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export const maxGitOutputBuffer = 20 * 1024 * 1024;
export const maxPatchBytesPerFile = 2 * 1024 * 1024;

const patchReadBufferPadding = 256 * 1024;

export async function requiredGitOutput(
  cwd: string,
  args: readonly string[]
): Promise<string> {
  return gitOutput(cwd, args);
}

export async function gitOutputOrNull(
  cwd: string,
  args: readonly string[]
): Promise<string | null> {
  try {
    return await gitOutput(cwd, args);
  } catch {
    return null;
  }
}

export async function gitOutputOrMaxBuffer(
  cwd: string,
  args: readonly string[]
): Promise<string | undefined> {
  try {
    const { stdout } = await execFileAsync("git", ["-C", cwd, ...args], {
      encoding: "utf8",
      maxBuffer: maxPatchBytesPerFile + patchReadBufferPadding
    });

    return stdout.trimEnd();
  } catch (error) {
    if (isMaxBufferError(error)) {
      return undefined;
    }

    throw error;
  }
}

export async function gitLines(
  cwd: string,
  args: readonly string[]
): Promise<readonly string[]> {
  const { stdout } = await execFileAsync("git", ["-C", cwd, ...args], {
    encoding: "utf8"
  });

  return stdout
    .trimEnd()
    .split("\n")
    .map((line) => line.trim());
}

export async function gitOutput(cwd: string, args: readonly string[]): Promise<string> {
  const { stdout } = await execFileAsync("git", ["-C", cwd, ...args], {
    encoding: "utf8",
    maxBuffer: maxGitOutputBuffer
  });

  return stdout.trimEnd();
}

export async function gitBuffer(cwd: string, args: readonly string[]): Promise<Buffer> {
  const { stdout } = await execFileAsync("git", ["-C", cwd, ...args], {
    maxBuffer: maxGitOutputBuffer
  });

  return Buffer.isBuffer(stdout) ? stdout : Buffer.from(stdout);
}

export async function sha256Command(
  command: string,
  args: readonly string[]
): Promise<string> {
  const hash = createHash("sha256");
  const child = spawn(command, [...args], {
    stdio: ["ignore", "pipe", "ignore"]
  });

  return new Promise<string>((resolve, reject) => {
    child.stdout.on("data", (chunk: Buffer | string) => {
      hash.update(chunk);
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve(hash.digest("hex"));
        return;
      }

      reject(new Error(`${command} exited with status ${String(code)}`));
    });
  });
}

function isMaxBufferError(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.message.includes("maxBuffer") ||
      ("code" in error &&
        (error as { readonly code?: unknown }).code ===
          "ERR_CHILD_PROCESS_STDIO_MAXBUFFER"))
  );
}
