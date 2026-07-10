import type { GlobalSettings, ProjectDocument } from "./model";

export interface ProjectCard {
  filePath: string;
  name: string;
  previewDataUrl?: string;
  modifiedAt: string;
  recoveryAvailable: boolean;
}

export interface ProjectArchive {
  document: ProjectDocument;
  previewDataUrl?: string;
  assets: Record<string, string>;
  terrainAssets: Record<string, string>;
}

export interface OpenProjectResult extends ProjectArchive {
  filePath: string;
  recoveryAvailable: boolean;
}

export interface ImportedAsset {
  name: string;
  extension: string;
  dataBase64: string;
  contentHash: string;
}

export interface PlaceSearchResult {
  name: string;
  municipality?: string;
  latitude: number;
  longitude: number;
}

export interface ElevationGridResult {
  columns: number;
  rows: number;
  elevationsMeters: number[];
  dataSource: string;
}

export interface SketcherApi {
  projects: {
    list(): Promise<ProjectCard[]>;
    create(name: string): Promise<OpenProjectResult>;
    open(filePath?: string): Promise<OpenProjectResult | null>;
    save(filePath: string, archive: ProjectArchive): Promise<ProjectCard>;
    saveAs(archive: ProjectArchive): Promise<ProjectCard | null>;
    saveRecovery(filePath: string, archive: ProjectArchive): Promise<void>;
    restoreRecovery(filePath: string): Promise<OpenProjectResult>;
    clearRecovery(filePath: string): Promise<void>;
    trash(filePath: string): Promise<void>;
  };
  settings: {
    get(): Promise<GlobalSettings>;
    update(settings: GlobalSettings): Promise<GlobalSettings>;
  };
  dialogs: {
    importAsset(): Promise<ImportedAsset | null>;
    importTerrain(): Promise<ImportedAsset | null>;
    exportModel(name: string, dataBase64: string): Promise<string | null>;
  };
  terrain: {
    search(query: string): Promise<PlaceSearchResult[]>;
    fetchCapabilities(url: string): Promise<string>;
    sampleElevation(
      latitude: number,
      longitude: number,
      widthMeters: number,
      heightMeters: number,
      resolution: number,
    ): Promise<ElevationGridResult>;
  };
  secrets: {
    get(key: string): Promise<string | null>;
    set(key: string, value: string): Promise<void>;
    delete(key: string): Promise<void>;
  };
  app: {
    version(): Promise<string>;
  };
}
