import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const globalCss = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "global.css"),
  "utf8"
);

// The collapsed-context bars and the split divider use --diff-bg-separator. In light
// mode it was a saturated blue, louder than the changes; it is now the neutral grey
// the phone's diff surface uses for the same token
// (packages/companion-diff-surface/src/surface-style.ts).
describe("diff separator colour", () => {
  it("uses the phone's neutral light separator instead of a blue band", () => {
    expect(globalCss).toContain("--diff-bg-separator: #e5e5e8;");
    expect(globalCss).not.toContain("--diff-bg-separator: #e1eaff;");
  });
});
