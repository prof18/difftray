import { app, BrowserWindow, ipcMain } from "electron";
import path from "node:path";

const rendererDevUrl = process.env.DIFFTRAY_RENDERER_URL;

let mainWindow: BrowserWindow | undefined;

const createMainWindow = async (): Promise<void> => {
  const window = new BrowserWindow({
    backgroundColor: "#151515",
    height: 820,
    minHeight: 600,
    minWidth: 900,
    show: false,
    title: "Difftray",
    width: 1220,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, "../preload/index.cjs"),
      sandbox: true
    }
  });

  window.once("ready-to-show", () => {
    window.show();
  });

  if (rendererDevUrl) {
    await window.loadURL(rendererDevUrl);
  } else {
    await window.loadFile(path.join(__dirname, "../renderer/index.html"));
  }

  mainWindow = window;
};

ipcMain.handle("app:version", () => app.getVersion());

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    void createMainWindow();
  }
});

void app.whenReady().then(createMainWindow);

export { mainWindow };
