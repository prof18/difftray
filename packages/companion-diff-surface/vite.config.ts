import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";

export default defineConfig({
  base: "./",
  build: {
    assetsInlineLimit: Number.MAX_SAFE_INTEGER,
    outDir: "dist",
    sourcemap: false
  },
  plugins: [react(), viteSingleFile()],
  server: {
    host: "127.0.0.1",
    port: 5184,
    strictPort: true
  },
  worker: {
    format: "es"
  }
});
