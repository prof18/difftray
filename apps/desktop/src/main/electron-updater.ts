export type AutoUpdaterLike = {
  autoDownload: boolean;
  autoInstallOnAppQuit: boolean;
  logger: unknown;
  checkForUpdates: () => Promise<unknown>;
  on: {
    (
      event: "checking-for-update" | "update-not-available",
      listener: () => void
    ): AutoUpdaterLike;
    (
      event: "update-available" | "update-downloaded",
      listener: (info: { readonly version: string }) => void
    ): AutoUpdaterLike;
    (
      event: "download-progress",
      listener: (progress: { readonly percent: number }) => void
    ): AutoUpdaterLike;
    (event: "error", listener: (error: Error) => void): AutoUpdaterLike;
  };
  quitAndInstall: () => void;
};

type ElectronUpdaterModule = {
  readonly autoUpdater?: unknown;
  readonly default?: {
    readonly autoUpdater?: unknown;
  };
  readonly "module.exports"?: {
    readonly autoUpdater?: unknown;
  };
};

export function resolveAutoUpdater(module: ElectronUpdaterModule): AutoUpdaterLike {
  const candidates = [
    module.autoUpdater,
    module.default?.autoUpdater,
    module["module.exports"]?.autoUpdater
  ];
  const autoUpdater = candidates.find(isAutoUpdater);

  if (!autoUpdater) {
    throw new Error("electron-updater did not expose autoUpdater");
  }

  return autoUpdater;
}

export async function loadAutoUpdater(): Promise<AutoUpdaterLike> {
  return resolveAutoUpdater(await import("electron-updater"));
}

function isAutoUpdater(value: unknown): value is AutoUpdaterLike {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<AutoUpdaterLike>;

  return (
    typeof candidate.checkForUpdates === "function" &&
    typeof candidate.on === "function" &&
    typeof candidate.quitAndInstall === "function"
  );
}
