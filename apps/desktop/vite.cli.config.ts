import { isBuiltin } from "node:module";
import { defineConfig } from "vite";

export default defineConfig({
  build: {
    emptyOutDir: false,
    outDir: "dist/cli",
    rollupOptions: {
      external: isBuiltin,
      output: { entryFileNames: "index.cjs", format: "cjs" }
    },
    ssr: "src/cli/index.ts",
    sourcemap: false,
    target: "node22"
  }
});
