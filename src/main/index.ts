import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { app, BrowserWindow, dialog, ipcMain, net, shell, type WebContents } from "electron";
import packageMetadata from "../../package.json";
import type { ProjectArchive } from "../shared/ipc";
import type { GlobalSettings } from "../shared/model";
import {
  clearRecovery,
  createProjectFile,
  deleteSecret,
  getSecret,
  getSettings,
  importedAsset,
  listProjects,
  openProjectFile,
  restoreRecovery,
  saveProjectFile,
  saveRecovery,
  setSecret,
  updateSettings,
} from "./persistence";

const smokeDirectory = process.env.SKETCHER_SMOKE_DIR;
if (smokeDirectory) {
  app.setPath("userData", path.join(smokeDirectory, "user-data"));
  app.setPath("documents", path.join(smokeDirectory, "documents"));
}

function senderIsTrusted(contents: WebContents): boolean {
  const url = contents.getURL();
  return url.startsWith("file://") || (!app.isPackaged && url.startsWith("http://localhost:"));
}

function trustedHandler<T extends unknown[], R>(handler: (...args: T) => Promise<R> | R) {
  return async (event: Electron.IpcMainInvokeEvent, ...args: T): Promise<R> => {
    if (!senderIsTrusted(event.sender)) throw new Error("Untrusted IPC sender.");
    return handler(...args);
  };
}

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1500,
    height: 950,
    minWidth: 1080,
    minHeight: 700,
    backgroundColor: "#101419",
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  });
  mainWindow.on("ready-to-show", () => mainWindow.show());
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  mainWindow.webContents.on("will-navigate", (event, url) => {
    const current = mainWindow.webContents.getURL();
    if (new URL(url).origin !== new URL(current).origin) event.preventDefault();
  });
  if (!app.isPackaged && process.env.ELECTRON_RENDERER_URL) {
    void mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    void mainWindow.loadFile(path.join(__dirname, "../renderer/index.html"));
  }
}

function registerIpc(): void {
  ipcMain.handle(
    "projects:list",
    trustedHandler(() => listProjects()),
  );
  ipcMain.handle(
    "projects:create",
    trustedHandler((name: string) => createProjectFile(name)),
  );
  ipcMain.handle(
    "projects:open",
    trustedHandler(async (filePath?: string) => {
      let selected = filePath;
      if (!selected) {
        const result = await dialog.showOpenDialog({
          title: "Open Sketcher project",
          properties: ["openFile"],
          filters: [{ name: "Sketcher projects", extensions: ["sketcher"] }],
        });
        selected = result.canceled ? undefined : result.filePaths[0];
      }
      return selected ? openProjectFile(selected) : null;
    }),
  );
  ipcMain.handle(
    "projects:save",
    trustedHandler((filePath: string, archive: ProjectArchive) =>
      saveProjectFile(filePath, archive),
    ),
  );
  ipcMain.handle(
    "projects:saveAs",
    trustedHandler(async (archive: ProjectArchive) => {
      const settings = await getSettings();
      const result = await dialog.showSaveDialog({
        title: "Save Sketcher project",
        defaultPath: path.join(settings.projectLibraryPath, `${archive.document.name}.sketcher`),
        filters: [{ name: "Sketcher projects", extensions: ["sketcher"] }],
      });
      return result.canceled || !result.filePath ? null : saveProjectFile(result.filePath, archive);
    }),
  );
  ipcMain.handle(
    "projects:saveRecovery",
    trustedHandler((filePath: string, archive: ProjectArchive) => saveRecovery(filePath, archive)),
  );
  ipcMain.handle(
    "projects:restoreRecovery",
    trustedHandler((filePath: string) => restoreRecovery(filePath)),
  );
  ipcMain.handle(
    "projects:clearRecovery",
    trustedHandler((filePath: string) => clearRecovery(filePath)),
  );
  ipcMain.handle(
    "projects:trash",
    trustedHandler(async (filePath: string) => {
      await shell.trashItem(filePath);
      await clearRecovery(filePath);
    }),
  );

  ipcMain.handle(
    "settings:get",
    trustedHandler(() => getSettings()),
  );
  ipcMain.handle(
    "settings:update",
    trustedHandler((settings: GlobalSettings) => updateSettings(settings)),
  );

  ipcMain.handle(
    "dialogs:importAsset",
    trustedHandler(async () => {
      const result = await dialog.showOpenDialog({
        title: "Import glTF/GLB asset",
        properties: ["openFile"],
        filters: [{ name: "glTF assets", extensions: ["glb", "gltf"] }],
      });
      const filePath = result.filePaths[0];
      return result.canceled || !filePath
        ? null
        : importedAsset(filePath, await readFile(filePath));
    }),
  );
  ipcMain.handle(
    "dialogs:importTerrain",
    trustedHandler(async () => {
      const result = await dialog.showOpenDialog({
        title: "Import GeoTIFF terrain",
        properties: ["openFile"],
        filters: [{ name: "GeoTIFF terrain", extensions: ["tif", "tiff"] }],
      });
      const filePath = result.filePaths[0];
      return result.canceled || !filePath
        ? null
        : importedAsset(filePath, await readFile(filePath));
    }),
  );
  ipcMain.handle(
    "dialogs:exportModel",
    trustedHandler(async (name: string, dataBase64: string) => {
      const result = await dialog.showSaveDialog({
        title: "Export GLB",
        defaultPath: `${name}.glb`,
        filters: [{ name: "Binary glTF", extensions: ["glb"] }],
      });
      if (result.canceled || !result.filePath) return null;
      await writeFile(result.filePath, Buffer.from(dataBase64, "base64"));
      return result.filePath;
    }),
  );

  ipcMain.handle(
    "terrain:search",
    trustedHandler(async (query: string) => {
      if (!query.trim()) return [];
      const url = new URL("https://ws.geonorge.no/stedsnavn/v1/navn");
      url.searchParams.set("sok", `${query.trim()}*`);
      url.searchParams.set("treffPerSide", "10");
      url.searchParams.set("side", "1");
      url.searchParams.set("utkoordsys", "4258");
      const response = await net.fetch(url.toString(), { signal: AbortSignal.timeout(15_000) });
      if (!response.ok) throw new Error(`Place search failed (${response.status}).`);
      const payload = (await response.json()) as any;
      return (payload.navn ?? []).flatMap((entry: any) => {
        const point = entry.representasjonspunkt ?? entry.sted?.representasjonspunkt;
        const name = entry.skrivemåte ?? entry.stedsnavn?.[0]?.skrivemåte;
        const latitude = Number(point?.nord ?? point?.lat);
        const longitude = Number(point?.øst ?? point?.lon);
        return name && Number.isFinite(latitude) && Number.isFinite(longitude)
          ? [
              {
                name,
                municipality: entry.kommuner?.[0]?.kommunenavn ?? entry.kommunenavn,
                latitude,
                longitude,
              },
            ]
          : [];
      });
    }),
  );
  ipcMain.handle(
    "terrain:sampleElevation",
    trustedHandler(
      async (
        latitude: number,
        longitude: number,
        widthMeters: number,
        heightMeters: number,
        resolution: number,
      ) => {
        if (
          !Number.isFinite(latitude) ||
          !Number.isFinite(longitude) ||
          widthMeters <= 0 ||
          heightMeters <= 0 ||
          widthMeters > 2000 ||
          heightMeters > 2000 ||
          !Number.isInteger(resolution) ||
          resolution < 2 ||
          resolution > 65
        ) {
          throw new Error("Invalid elevation-grid request.");
        }
        const points: [number, number][] = [];
        const latitudeStep = heightMeters / 111_320 / (resolution - 1);
        const longitudeStep =
          widthMeters / (111_320 * Math.cos((latitude * Math.PI) / 180)) / (resolution - 1);
        for (let row = 0; row < resolution; row += 1) {
          for (let column = 0; column < resolution; column += 1) {
            points.push([
              longitude + (column - (resolution - 1) / 2) * longitudeStep,
              latitude - (row - (resolution - 1) / 2) * latitudeStep,
            ]);
          }
        }
        const elevationsMeters: number[] = [];
        let dataSource = "Kartverket Høydedata";
        for (let offset = 0; offset < points.length; offset += 50) {
          const batch = points.slice(offset, offset + 50);
          const url = new URL("https://ws.geonorge.no/hoydedata/v1/punkt");
          url.searchParams.set("koordsys", "4258");
          url.searchParams.set("punkter", JSON.stringify(batch));
          const response = await net.fetch(url.toString());
          if (!response.ok) throw new Error(`Elevation request failed (${response.status}).`);
          const payload = (await response.json()) as {
            punkter?: Array<{ z?: number; datakilde?: string }>;
          };
          const returned = payload.punkter ?? [];
          for (let index = 0; index < batch.length; index += 1) {
            const point = returned[index];
            elevationsMeters.push(Number.isFinite(point?.z) ? Number(point?.z) : 0);
            if (point?.datakilde) dataSource = `Kartverket ${point.datakilde.toUpperCase()}`;
          }
        }
        return { columns: resolution, rows: resolution, elevationsMeters, dataSource };
      },
    ),
  );

  ipcMain.handle(
    "terrain:fetchImage",
    trustedHandler(async (url: string) => {
      const parsed = new URL(url);
      const trustedHosts = new Set(["services.arcgisonline.com"]);
      if (parsed.protocol !== "https:" || !trustedHosts.has(parsed.hostname)) {
        throw new Error("Only the configured public map-image provider is allowed.");
      }
      const response = await net.fetch(parsed.toString(), {
        signal: AbortSignal.timeout(30_000),
      });
      if (!response.ok) {
        const details = (await response.text()).replace(/\s+/g, " ").trim().slice(0, 240);
        throw new Error(
          `Map image request failed (${response.status})${details ? `: ${details}` : "."}`,
        );
      }
      const bytes = new Uint8Array(await response.arrayBuffer());
      const contentType = response.headers.get("content-type") ?? "";
      if (!contentType.startsWith("image/") || bytes.byteLength < 1_000) {
        throw new Error("The map provider returned an invalid image. Try again or change imagery.");
      }
      return Buffer.from(bytes).toString("base64");
    }),
  );

  ipcMain.handle(
    "secrets:get",
    trustedHandler((key: string) => getSecret(key)),
  );
  ipcMain.handle(
    "secrets:set",
    trustedHandler((key: string, value: string) => setSecret(key, value)),
  );
  ipcMain.handle(
    "secrets:delete",
    trustedHandler((key: string) => deleteSecret(key)),
  );
  ipcMain.handle(
    "app:version",
    trustedHandler(() => packageMetadata.version),
  );
}

app.whenReady().then(() => {
  app.setAppUserModelId("no.sorli.sketcher");
  registerIpc();
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
