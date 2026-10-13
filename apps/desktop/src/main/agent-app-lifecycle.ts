import { mkdirSync, realpathSync } from "node:fs";

type ProfileApp = {
  setPath(name: "userData", value: string): void;
  requestSingleInstanceLock(data: { agentBackground: boolean }): boolean;
  quit(): void;
};

/** Must run before storage, browser sessions or windows are initialized. */
export function acquireAgentProfile(
  app: ProfileApp,
  profilePath: string,
  background: boolean
): boolean {
  mkdirSync(profilePath, { recursive: true });
  app.setPath("userData", realpathSync(profilePath));
  const acquired = app.requestSingleInstanceLock({ agentBackground: background });
  if (!acquired) app.quit();
  return acquired;
}

export function isBackgroundAgentLaunch(data: unknown): boolean {
  return (
    typeof data === "object" &&
    data !== null &&
    !Array.isArray(data) &&
    "agentBackground" in data &&
    data.agentBackground === true
  );
}

/** Startup and later activation share one window and wait for initialized services. */
export function createAgentWindowEnsurer(options: {
  ready: () => Promise<unknown>;
  hasWindow: () => boolean;
  createWindow: () => Promise<void>;
}): () => Promise<void> {
  let creating: Promise<void> | undefined;
  return async () => {
    await options.ready();
    if (creating) return creating;
    if (options.hasWindow()) return;
    creating = options.createWindow();
    try {
      await creating;
    } finally {
      creating = undefined;
    }
  };
}
