import { contextBridge, ipcRenderer } from "electron";

export interface ElectronBridgeAPI {
  readonly isElectron: boolean;
  readonly platform: string;
  getVersion: () => Promise<string>;
  toggleFullscreen: () => void;
  minimizeWindow: () => void;
  closeWindow: () => void;
}

const electronAPI: ElectronBridgeAPI = {
  isElectron: true,
  platform: process.platform,
  getVersion: () => ipcRenderer.invoke("app:get-version"),
  toggleFullscreen: () => ipcRenderer.send("window:toggle-fullscreen"),
  minimizeWindow: () => ipcRenderer.send("window:minimize"),
  closeWindow: () => ipcRenderer.send("window:close"),
};

contextBridge.exposeInMainWorld("electronAPI", electronAPI);
