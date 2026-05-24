import { defineConfig } from "vite";

export default defineConfig({
  build: {
    emptyOutDir: false,
    outDir: "dist/preload",
    rollupOptions: {
      external: ["electron"],
      output: {
        entryFileNames: "index.cjs",
        format: "cjs"
      }
    },
    ssr: "src/preload/index.ts",
    sourcemap: false,
    target: "node22"
  }
});
