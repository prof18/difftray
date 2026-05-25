import { spawn, spawnSync } from "node:child_process";
import { createServer } from "node:net";

import waitOn from "wait-on";

const cwd = import.meta.dirname + "/..";
const rendererHost = "127.0.0.1";
const rendererPort = 5173;
const rendererUrl = `http://${rendererHost}:${rendererPort}`;

async function assertRendererPortAvailable() {
  await new Promise((resolve, reject) => {
    const server = createServer();

    server.once("error", reject);
    server.listen(rendererPort, rendererHost, () => {
      server.close(resolve);
    });
  }).catch((error) => {
    const code = typeof error === "object" && error !== null ? error.code : undefined;

    if (code === "EADDRINUSE") {
      throw new Error(
        `Renderer dev server port ${rendererPort} is already in use. Stop the existing pnpm dev process before starting a new one.`
      );
    }

    throw error;
  });
}

try {
  await assertRendererPortAvailable();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}

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
let electron;
let rendererReady = false;
let stopping = false;

const stop = () => {
  if (stopping) {
    return;
  }

  stopping = true;
  electron?.kill("SIGTERM");
  renderer.kill("SIGTERM");
};

process.on("SIGINT", stop);
process.on("SIGTERM", stop);

const rendererExit = new Promise((_resolve, reject) => {
  renderer.once("error", reject);
  renderer.once("exit", (code, signal) => {
    if (rendererReady || stopping) {
      return;
    }

    reject(
      new Error(
        `Renderer dev server exited before it became ready (code ${code ?? "null"}, signal ${
          signal ?? "null"
        }).`
      )
    );
  });
});

try {
  await Promise.race([
    waitOn({ resources: [`tcp:${rendererHost}:${rendererPort}`], timeout: 30_000 }),
    rendererExit
  ]);
  rendererReady = true;
} catch (error) {
  stop();
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}

electron = spawn("pnpm", ["exec", "electron", "dist/main/index.cjs"], {
  cwd,
  env: {
    ...process.env,
    DIFFTRAY_RENDERER_URL: rendererUrl
  },
  stdio: "inherit"
});

renderer.on("exit", (code, signal) => {
  if (!stopping) {
    console.error(
      `Renderer dev server exited (code ${code ?? "null"}, signal ${signal ?? "null"}).`
    );
    stop();
    process.exit(code ?? 1);
  }
});

electron.on("exit", (code) => {
  stop();
  process.exit(code ?? 0);
});
