import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export async function runInvalidationMatrix({
  cli,
  createProfile,
  repository,
  fixture,
  results,
  until
}) {
  const repo = await repository("during-load matrix");
  const profile = await createProfile("during-load-matrix");
  const bin = path.join(fixture, "race git bin");
  const control = path.join(fixture, "race git control");
  await mkdir(bin);
  await mkdir(control);
  // A fixture-only Git wrapper pauses exactly the full patch read, after the
  // service's initial snapshot validation. Its output remains the real Git output.
  await writeFile(
    path.join(bin, "git"),
    `#!/bin/sh
set -eu
case " $* " in
  *" --patch "*)
    if [ "$2" = "$DIFFTRAY_RACE_REPO" ] && [ -f "$DIFFTRAY_RACE_CONTROL/armed" ] && mkdir "$DIFFTRAY_RACE_CONTROL/claimed" 2>/dev/null; then
      /usr/bin/git "$@" > "$DIFFTRAY_RACE_CONTROL/patch"
      : > "$DIFFTRAY_RACE_CONTROL/reached"
      count=0
      while [ ! -f "$DIFFTRAY_RACE_CONTROL/release" ]; do
        count=$((count + 1))
        [ "$count" -lt 300 ] || exit 91
        /bin/sleep 0.1
      done
      /bin/cat "$DIFFTRAY_RACE_CONTROL/patch"
      exit 0
    fi ;;
esac
exec /usr/bin/git "$@"
`,
    { mode: 0o700 }
  );
  profile.env.PATH = `${bin}:/usr/bin:/bin:/usr/sbin:/sbin`;
  profile.env.DIFFTRAY_RACE_REPO = repo.path;
  profile.env.DIFFTRAY_RACE_CONTROL = control;
  const context = (await cli(profile, ["review", "inspect", "--repo", repo.path])).result;
  await writeFile(path.join(control, "armed"), "");
  const loading = cli(
    profile,
    ["review", "file", "--context", context.contextId, "--path", "tracked.txt"],
    false,
    4
  );
  // Attach a handler immediately so an early CLI failure cannot become unhandled.
  void loading.catch(() => undefined);
  try {
    await until(
      async () => {
        try {
          await readFile(path.join(control, "reached"));
          return true;
        } catch (error) {
          if (error.code === "ENOENT") return false;
          throw error;
        }
      },
      "actual Git patch-read barrier",
      15_000
    );
    await writeFile(
      path.join(repo.path, "tracked.txt"),
      "changed during actual file load\n"
    );
  } finally {
    await writeFile(path.join(control, "release"), "");
  }
  const response = await loading;
  assert.ok(["stale_diff", "stale_review"].includes(response.error.code));
  results.push(
    "source changed during the actual Git patch load rejects the old context deterministically"
  );
}
