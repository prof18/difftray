import { expect, it, vi } from "vitest";
import { detachTestDmg } from "./detach-test-dmg.mjs";

it("retries transient busy detach without forcing or changing the owned target", async () => {
  const run = vi.fn().mockImplementationOnce(() => {
    throw { status: 16 };
  });
  await detachTestDmg("/owned/mount", { run, pause: async () => undefined });
  expect(run).toHaveBeenCalledTimes(2);
  expect(
    run.mock.calls.every((call) => call[1].join(" ") === "detach /owned/mount")
  ).toBe(true);
});
it("bounds busy cleanup and preserves other errors", async () => {
  const busy = { status: 16 };
  const run = vi.fn(() => {
    throw busy;
  });
  await expect(
    detachTestDmg("/owned/mount", { run, pause: async () => undefined })
  ).rejects.toBe(busy);
  expect(run).toHaveBeenCalledTimes(10);
  const denied = { status: 1 };
  const fail = vi.fn(() => {
    throw denied;
  });
  await expect(detachTestDmg("/owned/mount", { run: fail })).rejects.toBe(denied);
  expect(fail).toHaveBeenCalledOnce();
});
