import { readFileSync } from "node:fs";
import { expect, it } from "vitest";

it("runs the bounded CLI process gate after the build-producing visual gate", () => {
  const ci = readFileSync("../../ci.sh", "utf8");
  expect(ci).toContain("pnpm --filter @difftray/desktop test:agent-package");
  const command = "pnpm --filter @difftray/desktop test:cli:e2e --skip-build";
  expect(ci).toContain(command);
  expect(ci.indexOf(command)).toBeGreaterThan(ci.indexOf("pnpm test:visual"));
  expect(ci).not.toContain("test:cli:bundle");
});
