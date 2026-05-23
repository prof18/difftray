import { mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";

import { _electron as electron } from "playwright";

const require = createRequire(import.meta.url);
const cwd = path.resolve(import.meta.dirname, "..");
const artifactsDir = path.resolve(cwd, "../../artifacts/screenshots");
const executablePath = require("electron");

await mkdir(artifactsDir, { recursive: true });

const app = await electron.launch({
  args: [path.resolve(cwd, "dist/main/index.cjs")],
  cwd,
  executablePath
});

try {
  const window = await app.firstWindow();
  await window.waitForLoadState("domcontentloaded");
  await window.locator("text=Difftray").first().waitFor({ timeout: 10_000 });
  await window.screenshot({
    fullPage: true,
    path: path.join(artifactsDir, "desktop-smoke.png")
  });
} finally {
  await app.close();
}
