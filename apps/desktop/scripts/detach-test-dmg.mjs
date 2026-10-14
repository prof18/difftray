import { execFileSync } from "node:child_process";

export async function detachTestDmg(
  mountPoint,
  {
    run = execFileSync,
    pause = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds))
  } = {}
) {
  for (let attempt = 0; ; attempt += 1) {
    try {
      run("/usr/bin/hdiutil", ["detach", mountPoint], {
        timeout: 10_000,
        stdio: ["ignore", "pipe", "pipe"]
      });
      return;
    } catch (error) {
      // macOS may briefly retain a mapped executable after the CLI exits.
      // Retry only EBUSY, without force or touching any other mounted image.
      if (error.status !== 16 || attempt === 9) throw error;
      await pause(500);
    }
  }
}
