import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  base: "./",
  build: {
    emptyOutDir: false,
    outDir: "dist/renderer",
    sourcemap: false
  },
  plugins: [react()],
  root: ".",
  server: {
    host: "127.0.0.1",
    port: 5173,
    strictPort: true
  },
  worker: {
    format: "es"
  }
});
