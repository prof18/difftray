import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const indexHtml = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "../index.html"),
  "utf8"
);

describe("diff surface viewport", () => {
  it("disables page zoom inside the mobile WebView", () => {
    expect(indexHtml).toContain("initial-scale=1");
    expect(indexHtml).toContain("maximum-scale=1");
    expect(indexHtml).toContain("minimum-scale=1");
    expect(indexHtml).toContain("user-scalable=no");
  });
});
