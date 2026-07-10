import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { app, safeStorage } from "electron";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import type { ImportedAsset, OpenProjectResult, ProjectArchive, ProjectCard } from "../shared/ipc";
import {
  createProject,
  type GlobalSettings,
  globalSettingsSchema,
  parseProjectDocument,
} from "../shared/model";

interface RecentFile {
  filePath: string;
  touchedAt: string;
}

const MODEL_ENTRY = "model.json";
const PREVIEW_ENTRY = "preview.webp";

function settingsPath(): string {
  return path.join(app.getPath("userData"), "settings.json");
}

function recentPath(): string {
  return path.join(app.getPath("userData"), "recent.json");
}

function secretsPath(): string {
  return path.join(app.getPath("userData"), "secrets.json");
}

export function defaultSettings(): GlobalSettings {
  return {
    projectLibraryPath: path.join(app.getPath("documents"), "Sketcher Projects"),
    autosaveSeconds: 30,
    theme: "dark",
    areaFormat: "m2",
    gridSpacing: 100,
    majorGridSpacing: 1000,
    snapTolerance: 12,
    graphicsQuality: "high",
    invertZoom: false,
    terrainCacheMb: 1024,
  };
}

export async function getSettings(): Promise<GlobalSettings> {
  try {
    const value = JSON.parse(await readFile(settingsPath(), "utf8"));
    return globalSettingsSchema.parse({ ...defaultSettings(), ...value });
  } catch {
    return defaultSettings();
  }
}

export async function updateSettings(value: GlobalSettings): Promise<GlobalSettings> {
  const settings = globalSettingsSchema.parse(value);
  await mkdir(path.dirname(settingsPath()), { recursive: true });
  await mkdir(settings.projectLibraryPath, { recursive: true });
  await writeFile(settingsPath(), JSON.stringify(settings, null, 2), "utf8");
  return settings;
}

function decodeDataUrl(value: string): Uint8Array {
  const encoded = value.includes(",") ? value.slice(value.indexOf(",") + 1) : value;
  return new Uint8Array(Buffer.from(encoded, "base64"));
}

function encodeDataUrl(value: Uint8Array, mime = "image/webp"): string {
  return `data:${mime};base64,${Buffer.from(value).toString("base64")}`;
}

export function packProject(archive: ProjectArchive): Uint8Array {
  const parsed = parseProjectDocument({
    ...archive.document,
    updatedAt: new Date().toISOString(),
  });
  const entries: Record<string, Uint8Array> = {
    [MODEL_ENTRY]: strToU8(JSON.stringify(parsed)),
  };
  if (archive.previewDataUrl) entries[PREVIEW_ENTRY] = decodeDataUrl(archive.previewDataUrl);
  for (const [archivePath, base64] of Object.entries(archive.assets)) {
    entries[`assets/${archivePath}`] = decodeDataUrl(base64);
  }
  for (const [archivePath, base64] of Object.entries(archive.terrainAssets)) {
    entries[`terrain/${archivePath}`] = decodeDataUrl(base64);
  }
  return zipSync(entries, { level: 6 });
}

export function unpackProject(data: Uint8Array): ProjectArchive {
  const entries = unzipSync(data);
  const model = entries[MODEL_ENTRY];
  if (!model) throw new Error("This project does not contain model.json.");
  const document = parseProjectDocument(JSON.parse(strFromU8(model)));
  const assets: Record<string, string> = {};
  const terrainAssets: Record<string, string> = {};
  for (const [entryPath, content] of Object.entries(entries)) {
    if (entryPath.startsWith("assets/")) {
      assets[entryPath.slice("assets/".length)] = Buffer.from(content).toString("base64");
    }
    if (entryPath.startsWith("terrain/")) {
      terrainAssets[entryPath.slice("terrain/".length)] = Buffer.from(content).toString("base64");
    }
  }
  return {
    document,
    previewDataUrl: entries[PREVIEW_ENTRY]
      ? encodeDataUrl(entries[PREVIEW_ENTRY], "image/webp")
      : undefined,
    assets,
    terrainAssets,
  };
}

async function writeAtomic(filePath: string, data: Uint8Array): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.${process.pid}.tmp`;
  const backupPath = `${filePath}.${process.pid}.bak`;
  await writeFile(tempPath, data);
  let backedUp = false;
  try {
    try {
      await rename(filePath, backupPath);
      backedUp = true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    await rename(tempPath, filePath);
    if (backedUp) await rm(backupPath, { force: true });
  } catch (error) {
    await rm(tempPath, { force: true });
    if (backedUp) await rename(backupPath, filePath).catch(() => undefined);
    throw error;
  }
}

function recoveryPath(filePath: string): string {
  return `${filePath}.recovery`;
}

async function readRecent(): Promise<RecentFile[]> {
  try {
    const value = JSON.parse(await readFile(recentPath(), "utf8"));
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

async function touchRecent(filePath: string): Promise<void> {
  const current = await readRecent();
  const normalized = path.resolve(filePath).toLowerCase();
  const next = [
    { filePath: path.resolve(filePath), touchedAt: new Date().toISOString() },
    ...current.filter((item) => path.resolve(item.filePath).toLowerCase() !== normalized),
  ].slice(0, 40);
  await mkdir(path.dirname(recentPath()), { recursive: true });
  await writeFile(recentPath(), JSON.stringify(next, null, 2), "utf8");
}

async function cardFor(filePath: string): Promise<ProjectCard> {
  const archive = unpackProject(new Uint8Array(await readFile(filePath)));
  const fileStats = await stat(filePath);
  let recoveryAvailable = false;
  try {
    const recoveryStats = await stat(recoveryPath(filePath));
    recoveryAvailable = recoveryStats.mtimeMs > fileStats.mtimeMs;
  } catch {
    recoveryAvailable = false;
  }
  return {
    filePath,
    name: archive.document.name,
    previewDataUrl: archive.previewDataUrl,
    modifiedAt: fileStats.mtime.toISOString(),
    recoveryAvailable,
  };
}

export async function listProjects(): Promise<ProjectCard[]> {
  const settings = await getSettings();
  await mkdir(settings.projectLibraryPath, { recursive: true });
  const libraryFiles = (await readdir(settings.projectLibraryPath))
    .filter((name) => name.toLowerCase().endsWith(".sketcher"))
    .map((name) => path.join(settings.projectLibraryPath, name));
  const recentFiles = (await readRecent()).map((item) => item.filePath);
  const uniqueFiles = [
    ...new Set([...libraryFiles, ...recentFiles].map((file) => path.resolve(file))),
  ];
  const cards = await Promise.all(
    uniqueFiles.map(async (filePath) => {
      try {
        return await cardFor(filePath);
      } catch {
        return null;
      }
    }),
  );
  return cards
    .filter((card): card is ProjectCard => card !== null)
    .sort((left, right) => right.modifiedAt.localeCompare(left.modifiedAt));
}

function safeFileName(name: string): string {
  const invalid = '<>:"/\\|?*';
  const cleaned = Array.from(name)
    .map((character) =>
      character.charCodeAt(0) < 32 || invalid.includes(character) ? " " : character,
    )
    .join("")
    .trim();
  return (cleaned || "Untitled").slice(0, 80);
}

export async function createProjectFile(name: string): Promise<OpenProjectResult> {
  const settings = await getSettings();
  await mkdir(settings.projectLibraryPath, { recursive: true });
  const base = safeFileName(name);
  let filePath = path.join(settings.projectLibraryPath, `${base}.sketcher`);
  let counter = 2;
  while (true) {
    try {
      await stat(filePath);
      filePath = path.join(settings.projectLibraryPath, `${base} ${counter}.sketcher`);
      counter += 1;
    } catch {
      break;
    }
  }
  const document = createProject(name.trim() || "Untitled");
  document.settings = {
    areaFormat: settings.areaFormat,
    gridSpacing: settings.gridSpacing,
    majorGridSpacing: settings.majorGridSpacing,
    snapTolerance: settings.snapTolerance,
    angleIncrement: 5,
  };
  const archive: ProjectArchive = { document, assets: {}, terrainAssets: {} };
  await writeAtomic(filePath, packProject(archive));
  await touchRecent(filePath);
  return { ...archive, filePath, recoveryAvailable: false };
}

export async function openProjectFile(filePath: string): Promise<OpenProjectResult> {
  const archive = unpackProject(new Uint8Array(await readFile(filePath)));
  const card = await cardFor(filePath);
  await touchRecent(filePath);
  return { ...archive, filePath, recoveryAvailable: card.recoveryAvailable };
}

export async function saveProjectFile(
  filePath: string,
  archive: ProjectArchive,
): Promise<ProjectCard> {
  await writeAtomic(filePath, packProject(archive));
  await rm(recoveryPath(filePath), { force: true });
  await touchRecent(filePath);
  return cardFor(filePath);
}

export async function saveRecovery(filePath: string, archive: ProjectArchive): Promise<void> {
  await writeAtomic(recoveryPath(filePath), packProject(archive));
}

export async function restoreRecovery(filePath: string): Promise<OpenProjectResult> {
  const archive = unpackProject(new Uint8Array(await readFile(recoveryPath(filePath))));
  return { ...archive, filePath, recoveryAvailable: true };
}

export async function clearRecovery(filePath: string): Promise<void> {
  await rm(recoveryPath(filePath), { force: true });
}

export function importedAsset(fileName: string, data: Buffer): ImportedAsset {
  return {
    name: path.parse(fileName).name,
    extension: path.extname(fileName).slice(1).toLowerCase(),
    dataBase64: data.toString("base64"),
    contentHash: createHash("sha256").update(data).digest("hex"),
  };
}

async function readSecrets(): Promise<Record<string, string>> {
  try {
    return JSON.parse(await readFile(secretsPath(), "utf8"));
  } catch {
    return {};
  }
}

export async function getSecret(key: string): Promise<string | null> {
  if (!safeStorage.isEncryptionAvailable()) return null;
  const secrets = await readSecrets();
  const encrypted = secrets[key];
  if (!encrypted) return null;
  return safeStorage.decryptString(Buffer.from(encrypted, "base64"));
}

export async function setSecret(key: string, value: string): Promise<void> {
  if (!safeStorage.isEncryptionAvailable())
    throw new Error("Secure credential storage is unavailable.");
  const secrets = await readSecrets();
  secrets[key] = safeStorage.encryptString(value).toString("base64");
  await mkdir(path.dirname(secretsPath()), { recursive: true });
  await writeFile(secretsPath(), JSON.stringify(secrets, null, 2), "utf8");
}

export async function deleteSecret(key: string): Promise<void> {
  const secrets = await readSecrets();
  delete secrets[key];
  await mkdir(path.dirname(secretsPath()), { recursive: true });
  await writeFile(secretsPath(), JSON.stringify(secrets, null, 2), "utf8");
}
