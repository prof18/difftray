import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";

import { workspaceAliases } from "./vite.workspace-aliases.config";

export default defineConfig({
  build: {
    emptyOutDir: false,
    outDir: "dist/main",
    rollupOptions: {
      external: ["electron", "electron-log/main.js", "electron-updater", "node:path"],
      output: {
        entryFileNames: "[name].cjs",
        format: "cjs"
      },
      input: {
        index: fileURLToPath(new URL("src/main/index.ts", import.meta.url)),
        "repository-discovery-worker": fileURLToPath(
          new URL("src/main/repository-discovery-worker.ts", import.meta.url)
        )
      }
    },
    ssr: true,
    sourcemap: false,
    target: "node22"
  },
  resolve: {
    alias: workspaceAliases
  }
});
