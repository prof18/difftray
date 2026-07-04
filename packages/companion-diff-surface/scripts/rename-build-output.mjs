import { rename } from "node:fs/promises";

await rename(
  new URL("../dist/index.html", import.meta.url),
  new URL("../dist/diff-surface.html", import.meta.url)
);
