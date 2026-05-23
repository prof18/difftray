import { contextBridge, ipcRenderer } from "electron";

export type DifftrayApi = {
  readonly appVersion: () => Promise<string>;
};

const api: DifftrayApi = {
  appVersion: async () => ipcRenderer.invoke("app:version") as Promise<string>
};

contextBridge.exposeInMainWorld("difftray", api);
