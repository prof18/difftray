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

/**
 * The agent service is optional for people using the window, so a setup failure
 * (an unsafe /tmp directory or socket, a stuck probe) is logged instead of
 * quitting the app. A quiet CLI launch exists only to serve agents, so there
 * the failure stays fatal.
 */
export function optionalAgentServiceFailure(options: {
  readonly background: boolean;
  readonly log: (error: unknown) => void;
}): (error: unknown) => undefined {
  return (error) => {
    if (options.background) throw error;
    options.log(error);
    return undefined;
  };
}
