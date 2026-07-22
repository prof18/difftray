import { BrowserWindow, dialog, Menu, MenuItem, type MessageBoxOptions } from "electron";

import {
  resolveUpdateMenuItemState,
  type UpdateMenuItemState
} from "./update-menu-item.js";
import type { UpdatePhase } from "./update-state.js";
import { viewMenuItemOptions } from "./application-menu-options.js";

export type ApplicationMenuDependencies = {
  readonly appName: string;
  readonly checkForUpdates: () => Promise<void>;
  readonly developerToolsEnabled: boolean;
  readonly getUpdatePhase: () => UpdatePhase;
  readonly onUpdatePhaseChange: (listener: (phase: UpdatePhase) => void) => () => void;
  readonly updatesEnabled: boolean;
};

export class ApplicationMenuController {
  private updateMenuItemState: UpdateMenuItemState = {
    enabled: true,
    label: "Check for Updates…"
  };
  private unsubscribeFromUpdatePhase: (() => void) | undefined;

  constructor(private readonly dependencies: ApplicationMenuDependencies) {}

  install(): void {
    this.unsubscribeFromUpdatePhase?.();

    if (this.dependencies.updatesEnabled) {
      this.updateMenuItemState = resolveUpdateMenuItemState(
        this.dependencies.getUpdatePhase()
      );
    }

    this.applyApplicationMenu();

    this.unsubscribeFromUpdatePhase = this.dependencies.onUpdatePhaseChange((phase) => {
      this.syncUpdateMenuItem(phase);
    });
  }

  dispose(): void {
    this.unsubscribeFromUpdatePhase?.();
    this.unsubscribeFromUpdatePhase = undefined;
  }

  private syncUpdateMenuItem(phase: UpdatePhase): void {
    if (!this.dependencies.updatesEnabled) {
      return;
    }

    const nextState = resolveUpdateMenuItemState(phase);

    if (
      nextState.label === this.updateMenuItemState.label &&
      nextState.enabled === this.updateMenuItemState.enabled
    ) {
      return;
    }

    this.updateMenuItemState = nextState;
    this.applyApplicationMenu();
  }

  private applyApplicationMenu(): void {
    Menu.setApplicationMenu(
      buildApplicationMenu(this.dependencies, this.updateMenuItemState, () => {
        void this.handleCheckForUpdates();
      })
    );
  }

  private async handleCheckForUpdates(): Promise<void> {
    if (!this.dependencies.updatesEnabled) {
      return;
    }

    const phaseBeforeCheck = this.dependencies.getUpdatePhase();

    if (
      phaseBeforeCheck.kind === "checking" ||
      phaseBeforeCheck.kind === "downloading" ||
      phaseBeforeCheck.kind === "downloaded"
    ) {
      return;
    }

    try {
      await this.dependencies.checkForUpdates();
    } catch (caughtError) {
      const message =
        caughtError instanceof Error ? caughtError.message : String(caughtError);

      await showUpdateMessageBox({
        detail: message,
        message: "Unable to check for updates",
        type: "error"
      });
      return;
    }

    const phaseAfterCheck = this.dependencies.getUpdatePhase();

    if (phaseAfterCheck.kind === "idle") {
      await showUpdateMessageBox({
        message: "Difftray is up to date"
      });
      return;
    }

    if (phaseAfterCheck.kind === "error") {
      await showUpdateMessageBox({
        detail: phaseAfterCheck.message,
        message: "Unable to check for updates",
        type: "error"
      });
    }
  }
}

function buildApplicationMenu(
  dependencies: ApplicationMenuDependencies,
  updateMenuItemState: UpdateMenuItemState,
  onCheckForUpdates: () => void
): Menu {
  const menu = new Menu();

  const checkForUpdatesMenuItem = new MenuItem({
    click: onCheckForUpdates,
    enabled: updateMenuItemState.enabled,
    label: updateMenuItemState.label
  });

  if (process.platform === "darwin") {
    const appMenu = new Menu();
    appMenu.append(new MenuItem({ role: "about" }));

    if (dependencies.updatesEnabled) {
      appMenu.append(checkForUpdatesMenuItem);
      appMenu.append(new MenuItem({ type: "separator" }));
    }

    appMenu.append(new MenuItem({ role: "services" }));
    appMenu.append(new MenuItem({ type: "separator" }));
    appMenu.append(new MenuItem({ role: "hide" }));
    appMenu.append(new MenuItem({ role: "hideOthers" }));
    appMenu.append(new MenuItem({ role: "unhide" }));
    appMenu.append(new MenuItem({ type: "separator" }));
    appMenu.append(new MenuItem({ role: "quit" }));
    menu.append(new MenuItem({ label: dependencies.appName, submenu: appMenu }));

    const fileMenu = new Menu();
    fileMenu.append(new MenuItem({ role: "close" }));
    menu.append(new MenuItem({ label: "File", submenu: fileMenu }));
  } else {
    const fileMenu = new Menu();
    fileMenu.append(new MenuItem({ role: "close" }));

    if (process.platform === "win32") {
      fileMenu.append(new MenuItem({ role: "quit" }));
    }

    menu.append(new MenuItem({ label: "File", submenu: fileMenu }));
  }

  const editMenu = new Menu();
  editMenu.append(new MenuItem({ role: "undo" }));
  editMenu.append(new MenuItem({ role: "redo" }));
  editMenu.append(new MenuItem({ type: "separator" }));
  editMenu.append(new MenuItem({ role: "cut" }));
  editMenu.append(new MenuItem({ role: "copy" }));
  editMenu.append(new MenuItem({ role: "paste" }));
  editMenu.append(new MenuItem({ role: "selectAll" }));
  menu.append(new MenuItem({ label: "Edit", submenu: editMenu }));

  const viewMenu = new Menu();
  for (const options of viewMenuItemOptions({
    developerToolsEnabled: dependencies.developerToolsEnabled
  })) {
    viewMenu.append(new MenuItem(options));
  }
  menu.append(new MenuItem({ label: "View", submenu: viewMenu }));

  if (process.platform === "darwin") {
    const windowMenu = new Menu();
    windowMenu.append(new MenuItem({ role: "minimize" }));
    windowMenu.append(new MenuItem({ role: "zoom" }));
    windowMenu.append(new MenuItem({ type: "separator" }));
    windowMenu.append(new MenuItem({ role: "front" }));
    menu.append(new MenuItem({ label: "Window", submenu: windowMenu }));
  } else if (dependencies.updatesEnabled) {
    const helpMenu = new Menu();
    helpMenu.append(checkForUpdatesMenuItem);
    menu.append(new MenuItem({ label: "Help", submenu: helpMenu }));
  }

  return menu;
}

async function showUpdateMessageBox(options: MessageBoxOptions): Promise<void> {
  const focusedWindow = BrowserWindow.getFocusedWindow() ?? undefined;

  if (focusedWindow) {
    await dialog.showMessageBox(focusedWindow, options);
    return;
  }

  await dialog.showMessageBox(options);
}
