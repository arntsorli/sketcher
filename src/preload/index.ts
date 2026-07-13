import { contextBridge, ipcRenderer } from "electron";
import type { ProjectArchive, SketcherApi } from "../shared/ipc";
import type { GlobalSettings } from "../shared/model";

const api: SketcherApi = {
  projects: {
    list: () => ipcRenderer.invoke("projects:list"),
    create: (name) => ipcRenderer.invoke("projects:create", name),
    open: (filePath) => ipcRenderer.invoke("projects:open", filePath),
    save: (filePath, archive) => ipcRenderer.invoke("projects:save", filePath, archive),
    saveAs: (archive) => ipcRenderer.invoke("projects:saveAs", archive),
    saveRecovery: (filePath, archive) =>
      ipcRenderer.invoke("projects:saveRecovery", filePath, archive),
    restoreRecovery: (filePath) => ipcRenderer.invoke("projects:restoreRecovery", filePath),
    clearRecovery: (filePath) => ipcRenderer.invoke("projects:clearRecovery", filePath),
    trash: (filePath) => ipcRenderer.invoke("projects:trash", filePath),
  },
  settings: {
    get: () => ipcRenderer.invoke("settings:get"),
    update: (settings: GlobalSettings) => ipcRenderer.invoke("settings:update", settings),
  },
  dialogs: {
    importAsset: () => ipcRenderer.invoke("dialogs:importAsset"),
    importTerrain: () => ipcRenderer.invoke("dialogs:importTerrain"),
    exportModel: (name, dataBase64) => ipcRenderer.invoke("dialogs:exportModel", name, dataBase64),
  },
  terrain: {
    search: (query) => ipcRenderer.invoke("terrain:search", query),
    fetchImage: (url) => ipcRenderer.invoke("terrain:fetchImage", url),
  },
  app: {
    version: () => ipcRenderer.invoke("app:version"),
  },
};

contextBridge.exposeInMainWorld("sketcher", api satisfies SketcherApi);

export type { ProjectArchive };
