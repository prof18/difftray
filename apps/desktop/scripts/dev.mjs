import { spawn, spawnSync } from "node:child_process";

import waitOn from "wait-on";

const cwd = import.meta.dirname + "/..";

for (const config of ["vite.main.config.ts", "vite.preload.config.ts"]) {
  const result = spawnSync("pnpm", ["exec", "vite", "build", "--config", config], {
    cwd,
    stdio: "inherit"
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

const renderer = spawn("pnpm", ["exec", "vite", "--config", "vite.renderer.config.ts"], {
  cwd,
  stdio: "inherit"
});

const stop = () => {
  renderer.kill("SIGTERM");
};

process.on("SIGINT", stop);
process.on("SIGTERM", stop);

await waitOn({ resources: ["tcp:127.0.0.1:5173"], timeout: 30_000 });

const electron = spawn("pnpm", ["exec", "electron", "dist/main/index.cjs"], {
  cwd,
  env: {
    ...process.env,
    DIFFTRAY_RENDERER_URL: "http://127.0.0.1:5173"
  },
  stdio: "inherit"
});

electron.on("exit", (code) => {
  stop();
  process.exit(code ?? 0);
});
