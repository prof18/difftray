import { defineConfig } from "vite";

import { workspaceAliases } from "./vite.workspace-aliases.config";

export default defineConfig({
  build: {
    emptyOutDir: false,
    outDir: "dist/main",
    rollupOptions: {
      external: ["electron", "node:path"],
      output: {
        entryFileNames: "index.cjs",
        format: "cjs"
      }
    },
    ssr: "src/main/index.ts",
    sourcemap: false,
    target: "node22"
  },
  resolve: {
    alias: workspaceAliases
  }
});
