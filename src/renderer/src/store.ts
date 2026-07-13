import { create } from "zustand";
import {
  calculateOpeningPlacement,
  calculateStair,
  createWall,
  distance,
  validateNextPolygonPoint,
  validatePolygon,
} from "../../shared/geometry";
import type { ProjectArchive, ProjectCard } from "../../shared/ipc";
import {
  type AssetInstance,
  type BuildingInstance,
  createBuilding,
  type GlobalSettings,
  type ProjectDocument,
  type TerrainLayer,
  type Vec2,
} from "../../shared/model";

export type EditorMode = "architecture" | "builder";
export type TransformMode = "translate" | "rotate" | "scale";
export interface ClippingState {
  enabled: boolean;
  axis: "x" | "y" | "z";
  offsetMm: number;
  inverted: boolean;
  showHelper: boolean;
}

type SceneClipboard =
  | { type: "building"; instance: BuildingInstance; pasteCount: number }
  | { type: "asset"; instance: AssetInstance; pasteCount: number };

export type EditorTool =
  | "select"
  | "foundation"
  | "wall"
  | "door"
  | "window"
  | "carport"
  | "stair"
  | "roof"
  | "polygon"
  | "place-building"
  | "place-asset"
  | "terrain";

export type Selection =
  | { type: "building"; id: string }
  | { type: "asset"; id: string }
  | { type: "terrain"; id: string }
  | { type: "wall"; id: string }
  | { type: "opening"; id: string }
  | null;

interface DraftState {
  points: Vec2[];
  hover?: Vec2;
  wallStart?: Vec2;
  axisAngle: number;
  numericInput: string;
}

interface EditorState {
  screen: "home" | "editor";
  cards: ProjectCard[];
  project?: ProjectDocument;
  filePath?: string;
  previewDataUrl?: string;
  assets: Record<string, string>;
  terrainAssets: Record<string, string>;
  settings?: GlobalSettings;
  version: string;
  mode: EditorMode;
  tool: EditorTool;
  transformMode: TransformMode;
  clipping: ClippingState;
  clipboard?: SceneClipboard;
  selection: Selection;
  activeBuildingId?: string;
  activeFloorId?: string;
  placementDefinitionId?: string;
  placementAssetId?: string;
  draft: DraftState;
  dirty: boolean;
  past: ProjectDocument[];
  future: ProjectDocument[];
  status: string;
  error?: string;
  loadHome(): Promise<void>;
  createProject(name: string): Promise<void>;
  openProject(filePath?: string): Promise<void>;
  closeProject(): Promise<void>;
  save(saveAs?: boolean): Promise<void>;
  setMode(mode: EditorMode): void;
  startNewBuilding(): void;
  editBuilding(definitionId: string): void;
  setActiveFloor(floorId: string): void;
  setTool(tool: EditorTool): void;
  setTransformMode(mode: TransformMode): void;
  setClipping(update: Partial<ClippingState>): void;
  setSelection(selection: Selection): void;
  setStatus(status: string): void;
  setError(error?: string): void;
  setDraft(update: Partial<DraftState>): void;
  commit(label: string, mutate: (project: ProjectDocument) => void): void;
  undo(): void;
  redo(): void;
  copySelection(): void;
  pasteClipboard(): void;
  addFoundationPoint(point: Vec2): void;
  removeLastFoundationPoint(): void;
  finishFoundation(): void;
  addPolygonPoint(point: Vec2): void;
  removeLastPolygonPoint(): void;
  finishPolygonFace(): void;
  extrudeSelectedPolygon(heightMm: number): void;
  addWallSegment(start: Vec2, end: Vec2): void;
  addOpening(kind: "door" | "window" | "carport", point: Vec2): void;
  addStair(point: Vec2): void;
  addFloor(): void;
  addRoof(): void;
  placeBuilding(definitionId: string, position?: Vec2): void;
  makeSelectedBuildingUnique(): void;
  placeAsset(definitionId: string, position?: Vec2): void;
  addTerrain(layer: TerrainLayer, elevationArchiveData?: string, imageryArchiveData?: string): void;
  updateSettings(settings: GlobalSettings): Promise<void>;
  importAsset(): Promise<void>;
  importTerrain(): Promise<void>;
}

function projectArchive(state: EditorState): ProjectArchive | null {
  if (!state.project) return null;
  return {
    document: state.project,
    previewDataUrl: state.previewDataUrl,
    assets: state.assets,
    terrainAssets: state.terrainAssets,
  };
}

function cloneProject(project: ProjectDocument): ProjectDocument {
  return structuredClone(project);
}

function selectedBuildingDefinition(state: EditorState) {
  return state.project?.buildingDefinitions.find((item) => item.id === state.activeBuildingId);
}

function activeFloorId(state: EditorState): string | undefined {
  const building = selectedBuildingDefinition(state);
  return state.activeFloorId ?? building?.floors.find((floor) => floor.type === "story")?.id;
}

export const useEditorStore = create<EditorState>((set, get) => ({
  screen: "home",
  cards: [],
  assets: {},
  terrainAssets: {},
  version: "0.1.0",
  mode: "architecture",
  tool: "select",
  transformMode: "translate",
  clipping: { enabled: false, axis: "x", offsetMm: 0, inverted: false, showHelper: true },
  selection: null,
  draft: { points: [], axisAngle: 0, numericInput: "" },
  dirty: false,
  past: [],
  future: [],
  status: "Ready",

  async loadHome() {
    const [cards, settings, version] = await Promise.all([
      window.sketcher.projects.list(),
      window.sketcher.settings.get(),
      window.sketcher.app.version(),
    ]);
    set({ cards, settings, version, screen: "home", error: undefined });
  },

  async createProject(name) {
    const opened = await window.sketcher.projects.create(name);
    set({
      screen: "editor",
      project: opened.document,
      filePath: opened.filePath,
      assets: opened.assets,
      terrainAssets: opened.terrainAssets,
      mode: "architecture",
      tool: "select",
      transformMode: "translate",
      clipping: { enabled: false, axis: "x", offsetMm: 0, inverted: false, showHelper: true },
      clipboard: undefined,
      dirty: false,
      past: [],
      future: [],
      selection: null,
      draft: { points: [], axisAngle: 0, numericInput: "" },
      status: "New project created",
    });
  },

  async openProject(filePath) {
    let opened = await window.sketcher.projects.open(filePath);
    if (!opened) return;
    if (opened.recoveryAvailable) {
      const restore = window.confirm(
        "A newer recovery snapshot exists for this project. Restore it? The last manual save remains unchanged until you save again.",
      );
      if (restore) opened = await window.sketcher.projects.restoreRecovery(opened.filePath);
      else await window.sketcher.projects.clearRecovery(opened.filePath);
    }
    set({
      screen: "editor",
      project: opened.document,
      filePath: opened.filePath,
      previewDataUrl: opened.previewDataUrl,
      assets: opened.assets,
      terrainAssets: opened.terrainAssets,
      mode: "architecture",
      tool: "select",
      transformMode: "translate",
      clipping: { enabled: false, axis: "x", offsetMm: 0, inverted: false, showHelper: true },
      clipboard: undefined,
      dirty: false,
      past: [],
      future: [],
      selection: null,
      activeBuildingId: undefined,
      activeFloorId: undefined,
      draft: { points: [], axisAngle: 0, numericInput: "" },
      status: "Project opened",
      error: undefined,
    });
  },

  async closeProject() {
    if (get().dirty) await get().save();
    set({
      screen: "home",
      project: undefined,
      filePath: undefined,
      selection: null,
      activeBuildingId: undefined,
    });
    await get().loadHome();
  },

  async save(saveAs = false) {
    const state = get();
    const canvas = document.querySelector<HTMLCanvasElement>(".scene-host canvas");
    const previewDataUrl = canvas?.toDataURL("image/webp", 0.78) ?? state.previewDataUrl;
    const archive = projectArchive({ ...state, previewDataUrl });
    if (!archive || !state.filePath) return;
    try {
      const card = saveAs
        ? await window.sketcher.projects.saveAs(archive)
        : await window.sketcher.projects.save(state.filePath, archive);
      if (!card) return;
      set({
        filePath: card.filePath,
        previewDataUrl,
        dirty: false,
        status: "Saved",
        error: undefined,
      });
    } catch (error) {
      set({ error: error instanceof Error ? error.message : String(error), status: "Save failed" });
    }
  },

  setMode(mode) {
    const state = get();
    let activeBuildingId = state.activeBuildingId;
    if (mode === "builder" && !activeBuildingId && state.selection?.type === "building") {
      const instance = state.project?.scene.buildingInstances.find(
        (item) => item.id === state.selection?.id,
      );
      activeBuildingId = instance?.definitionId;
    }
    const activeBuilding = state.project?.buildingDefinitions.find(
      (item) => item.id === activeBuildingId,
    );
    set({
      mode,
      activeBuildingId,
      activeFloorId: activeBuilding?.floors.find((floor) => floor.type === "story")?.id,
      tool: mode === "builder" && !activeBuilding ? "foundation" : "select",
      selection: null,
      draft: { points: [], axisAngle: 0, numericInput: "" },
      status: mode === "builder" ? "Builder mode" : "Architecture mode",
    });
  },

  startNewBuilding() {
    set({
      mode: "builder",
      activeBuildingId: undefined,
      activeFloorId: undefined,
      tool: "foundation",
      selection: null,
      draft: { points: [], axisAngle: 0, numericInput: "" },
      status: "Draw a closed foundation polygon",
      error: undefined,
    });
  },

  editBuilding(definitionId) {
    const building = get().project?.buildingDefinitions.find((item) => item.id === definitionId);
    if (!building) return;
    set({
      mode: "builder",
      activeBuildingId: definitionId,
      activeFloorId: building.floors.find((floor) => floor.type === "story")?.id,
      tool: "select",
      selection: null,
      draft: { points: [], axisAngle: 0, numericInput: "" },
      status: `Editing ${building.name}`,
    });
  },

  setActiveFloor(floorId) {
    set({ activeFloorId: floorId, selection: null, status: "Active floor changed" });
  },

  setTool(tool) {
    set({
      tool,
      placementDefinitionId: undefined,
      placementAssetId: undefined,
      draft: {
        points: [],
        axisAngle: tool === "wall" ? 0 : get().draft.axisAngle,
        numericInput: "",
      },
      status: `${tool.replace("-", " ")} tool`,
      error: undefined,
    });
  },
  setTransformMode(transformMode) {
    set({ transformMode, status: `${transformMode} mode` });
  },
  setClipping(update) {
    set((state) => ({
      clipping: { ...state.clipping, ...update },
      status: update.enabled === false ? "Clipping disabled" : "Clipping plane updated",
    }));
  },
  setSelection(selection) {
    set((state) => ({
      selection,
      transformMode:
        selection?.type === "building" && state.transformMode === "scale"
          ? "translate"
          : state.transformMode,
    }));
  },
  setStatus(status) {
    set({ status });
  },
  setError(error) {
    set({ error });
  },
  setDraft(update) {
    set((state) => ({ draft: { ...state.draft, ...update } }));
  },

  commit(label, mutate) {
    const current = get().project;
    if (!current) return;
    const next = cloneProject(current);
    mutate(next);
    next.updatedAt = new Date().toISOString();
    set((state) => ({
      project: next,
      dirty: true,
      past: [...state.past.slice(-99), current],
      future: [],
      status: label,
      error: undefined,
    }));
  },

  undo() {
    const state = get();
    const previous = state.past.at(-1);
    if (!previous || !state.project) return;
    set({
      project: cloneProject(previous),
      past: state.past.slice(0, -1),
      future: [state.project, ...state.future].slice(0, 100),
      dirty: true,
      status: "Undo",
    });
  },
  redo() {
    const state = get();
    const next = state.future[0];
    if (!next || !state.project) return;
    set({
      project: cloneProject(next),
      past: [...state.past, state.project].slice(-100),
      future: state.future.slice(1),
      dirty: true,
      status: "Redo",
    });
  },

  copySelection() {
    const state = get();
    if (state.selection?.type === "building") {
      const instance = state.project?.scene.buildingInstances.find(
        (item) => item.id === state.selection?.id,
      );
      if (instance) {
        set({
          clipboard: { type: "building", instance: structuredClone(instance), pasteCount: 0 },
          status: `${instance.name} copied`,
        });
        return;
      }
    }
    if (state.selection?.type === "asset") {
      const instance = state.project?.scene.assetInstances.find(
        (item) => item.id === state.selection?.id,
      );
      if (instance) {
        set({
          clipboard: { type: "asset", instance: structuredClone(instance), pasteCount: 0 },
          status: `${instance.name} copied`,
        });
        return;
      }
    }
    set({ status: "Select a building or object to copy" });
  },

  pasteClipboard() {
    const clipboard = get().clipboard;
    const project = get().project;
    if (!clipboard || !project) {
      set({ status: "Nothing to paste" });
      return;
    }
    const pasteNumber = clipboard.pasteCount + 1;
    const id = crypto.randomUUID();
    const instance = structuredClone(clipboard.instance);
    instance.id = id;
    instance.name =
      pasteNumber === 1
        ? `${clipboard.instance.name} copy`
        : `${clipboard.instance.name} copy ${pasteNumber}`;
    instance.transform.position.x += pasteNumber * 500;
    instance.transform.position.y += pasteNumber * 500;
    get().commit(`${instance.name} pasted`, (document) => {
      if (clipboard.type === "building") {
        document.scene.buildingInstances.push(instance as BuildingInstance);
      } else {
        document.scene.assetInstances.push(instance as AssetInstance);
      }
    });
    set({
      clipboard: { ...clipboard, pasteCount: pasteNumber },
      selection: { type: clipboard.type, id },
      tool: "select",
    });
  },

  addFoundationPoint(point) {
    const state = get();
    const first = state.draft.points[0];
    if (first && state.draft.points.length >= 3 && distance(first, point) < 1) {
      get().finishFoundation();
      return;
    }
    const error = validateNextPolygonPoint(state.draft.points, point);
    if (error) {
      set({ error, status: "Foundation point rejected" });
      return;
    }
    set({
      draft: {
        ...state.draft,
        points: [...state.draft.points, point],
        hover: undefined,
        numericInput: "",
      },
    });
  },

  removeLastFoundationPoint() {
    const state = get();
    if (state.draft.points.length === 0) return;
    set({
      draft: {
        ...state.draft,
        points: state.draft.points.slice(0, -1),
        hover: undefined,
        numericInput: "",
      },
      status: "Last foundation point removed",
      error: undefined,
    });
  },

  finishFoundation() {
    const state = get();
    const error = validatePolygon(state.draft.points);
    if (error) {
      set({ error });
      return;
    }
    const building = createBuilding(
      `Building ${(state.project?.buildingDefinitions.length ?? 0) + 1}`,
      state.draft.points,
    );
    get().commit("Foundation created", (project) => project.buildingDefinitions.push(building));
    set({
      activeBuildingId: building.id,
      activeFloorId: building.floors[0]?.id,
      tool: "wall",
      draft: { points: [], axisAngle: state.draft.axisAngle, numericInput: "" },
    });
  },

  addPolygonPoint(point) {
    const state = get();
    const first = state.draft.points[0];
    if (first && state.draft.points.length >= 3 && distance(first, point) < 1) {
      get().finishPolygonFace();
      return;
    }
    const error = validateNextPolygonPoint(state.draft.points, point);
    if (error) {
      set({ error, status: "Polygon point rejected" });
      return;
    }
    set({
      draft: {
        ...state.draft,
        points: [...state.draft.points, point],
        hover: undefined,
        numericInput: "",
      },
    });
  },

  removeLastPolygonPoint() {
    const state = get();
    if (state.draft.points.length === 0) return;
    set({
      draft: {
        ...state.draft,
        points: state.draft.points.slice(0, -1),
        hover: undefined,
        numericInput: "",
      },
      status: "Last polygon point removed",
      error: undefined,
    });
  },

  finishPolygonFace() {
    const state = get();
    const error = validatePolygon(state.draft.points);
    if (error) {
      set({ error, status: "Polygon face needs a valid closed outline" });
      return;
    }
    const origin = state.draft.points[0];
    if (!origin) return;
    const definitionId = crypto.randomUUID();
    const instanceId = crypto.randomUUID();
    const index =
      (state.project?.assetDefinitions.filter((item) => item.kind === "polygon-face").length ?? 0) +
      1;
    get().commit("Polygon face created", (project) => {
      project.assetDefinitions.push({
        id: definitionId,
        name: `Polygon face ${index}`,
        source: "generated",
        kind: "polygon-face",
        polygon: {
          points: state.draft.points.map((point) => ({
            x: point.x - origin.x,
            y: point.y - origin.y,
          })),
          extrusionHeight: 0,
        },
      });
      project.scene.assetInstances.push({
        id: instanceId,
        definitionId,
        name: `Polygon face ${index}`,
        transform: { position: { x: origin.x, y: origin.y, z: 0 }, rotationZ: 0, scale: 1 },
        visible: true,
      });
    });
    set({
      selection: { type: "asset", id: instanceId },
      tool: "select",
      draft: { points: [], axisAngle: state.draft.axisAngle, numericInput: "" },
    });
  },

  extrudeSelectedPolygon(heightMm) {
    const state = get();
    if (state.selection?.type !== "asset") return;
    const instance = state.project?.scene.assetInstances.find(
      (item) => item.id === state.selection?.id,
    );
    const definition = state.project?.assetDefinitions.find(
      (item) => item.id === instance?.definitionId,
    );
    if (!instance || definition?.kind !== "polygon-face" || !definition.polygon) return;
    get().commit("Polygon face extruded", (project) => {
      const target = project.assetDefinitions.find((item) => item.id === definition.id);
      if (target?.kind === "polygon-face" && target.polygon) {
        target.polygon.extrusionHeight = Math.max(0, heightMm);
      }
    });
  },

  addWallSegment(start, end) {
    const state = get();
    const building = selectedBuildingDefinition(state);
    const floorId = activeFloorId(state);
    if (!building || !floorId || distance(start, end) < 1) return;
    const wall = createWall(building, floorId, start, end);
    get().commit("Wall added", (project) => {
      project.buildingDefinitions.find((item) => item.id === building.id)?.walls.push(wall);
    });
    set({ draft: { ...state.draft, wallStart: undefined } });
  },

  addOpening(kind, point) {
    const state = get();
    const building = selectedBuildingDefinition(state);
    const floorId = activeFloorId(state);
    if (!building || !floorId) return;
    const width = kind === "carport" ? 3000 : kind === "door" ? 900 : 1200;
    const placement = calculateOpeningPlacement(
      building.walls,
      building.openings,
      floorId,
      point,
      width,
    );
    if (!placement?.valid) {
      set({ error: placement?.reason ?? "Choose a wall with enough clear length." });
      return;
    }
    get().commit(
      `${kind === "carport" ? "Carport opening" : kind === "door" ? "Door" : "Window"} added`,
      (project) => {
        project.buildingDefinitions
          .find((item) => item.id === building.id)
          ?.openings.push({
            id: crypto.randomUUID(),
            floorId,
            wallId: placement.wall.id,
            kind,
            width,
            height: kind === "carport" ? 2200 : kind === "door" ? 2100 : 1200,
            offset: placement.offset,
            sillHeight: kind === "window" ? 900 : 0,
          });
      },
    );
  },

  addStair(point) {
    const state = get();
    const building = selectedBuildingDefinition(state);
    const floorId = activeFloorId(state);
    const floor = building?.floors.find((item) => item.id === floorId);
    if (!building || !floorId || !floor) return;
    const metrics = calculateStair(floor.height);
    get().commit("Straight stair added", (project) => {
      project.buildingDefinitions
        .find((item) => item.id === building.id)
        ?.stairs.push({
          id: crypto.randomUUID(),
          floorId,
          position: point,
          rotationZ: 0,
          width: 1000,
          treadDepth: 250,
          riserCount: metrics.riserCount,
        });
    });
  },

  addFloor() {
    const state = get();
    const building = selectedBuildingDefinition(state);
    if (!building || building.roof) return;
    const stories = building.floors.filter((floor) => floor.type === "story");
    const elevation = stories.reduce((total, floor) => total + floor.height, 0);
    const floorId = crypto.randomUUID();
    get().commit("Floor added", (project) => {
      project.buildingDefinitions
        .find((item) => item.id === building.id)
        ?.floors.push({
          id: floorId,
          name: `Floor ${stories.length + 1}`,
          type: "story",
          elevation,
          height: building.defaults.floorHeight,
          slabThickness: building.defaults.slabThickness,
        });
    });
    set({ activeFloorId: floorId });
  },

  addRoof() {
    const state = get();
    const building = selectedBuildingDefinition(state);
    if (!building || building.roof) return;
    const stories = building.floors.filter((floor) => floor.type === "story");
    const finalStory = stories.at(-1);
    const elevation = finalStory
      ? finalStory.elevation + finalStory.slabThickness + finalStory.height
      : 0;
    const floorId = crypto.randomUUID();
    get().commit("Automatic pitched roof added", (project) => {
      const target = project.buildingDefinitions.find((item) => item.id === building.id);
      if (!target) return;
      target.floors.push({
        id: floorId,
        name: "Roof",
        type: "roof",
        elevation,
        height: 200,
        slabThickness: 200,
      });
      target.roof = {
        floorId,
        pitchDegrees: 30,
        overhang: 300,
        thickness: 200,
        ridgeRotationDegrees:
          Math.max(...target.footprint.map((point) => point.x)) -
            Math.min(...target.footprint.map((point) => point.x)) >=
          Math.max(...target.footprint.map((point) => point.y)) -
            Math.min(...target.footprint.map((point) => point.y))
            ? 0
            : 90,
        flipped: false,
      };
    });
    set({ activeFloorId: floorId, tool: "select" });
  },

  placeBuilding(definitionId, position?: Vec2) {
    const definition = get().project?.buildingDefinitions.find((item) => item.id === definitionId);
    if (!definition) return;
    if (!position) {
      set({
        tool: "place-building",
        placementDefinitionId: definitionId,
        placementAssetId: undefined,
        selection: null,
        draft: { points: [], axisAngle: get().draft.axisAngle, numericInput: "" },
        status: `Click the grid to place ${definition.name}. Escape cancels.`,
        error: undefined,
      });
      return;
    }
    const id = crypto.randomUUID();
    get().commit("Building placed", (project) => {
      project.scene.buildingInstances.push({
        id,
        definitionId,
        name: definition.name,
        transform: { position: { x: position.x, y: position.y, z: 0 }, rotationZ: 0, scale: 1 },
        visible: true,
      });
    });
    set({
      selection: { type: "building", id },
      tool: "select",
      placementDefinitionId: undefined,
      placementAssetId: undefined,
      draft: { points: [], axisAngle: get().draft.axisAngle, numericInput: "" },
    });
  },

  makeSelectedBuildingUnique() {
    const state = get();
    if (state.selection?.type !== "building") return;
    const instance = state.project?.scene.buildingInstances.find(
      (item) => item.id === state.selection?.id,
    );
    const definition = state.project?.buildingDefinitions.find(
      (item) => item.id === instance?.definitionId,
    );
    if (!instance || !definition) return;
    const clone = structuredClone(definition);
    clone.id = crypto.randomUUID();
    clone.name = `${definition.name} copy`;
    get().commit("Building made unique", (project) => {
      project.buildingDefinitions.push(clone);
      const target = project.scene.buildingInstances.find((item) => item.id === instance.id);
      if (target) {
        target.definitionId = clone.id;
        target.name = clone.name;
      }
    });
  },

  placeAsset(definitionId, position?: Vec2) {
    const definition = get().project?.assetDefinitions.find((item) => item.id === definitionId);
    if (!definition) return;
    if (!position) {
      set({
        tool: "place-asset",
        placementDefinitionId: undefined,
        placementAssetId: definitionId,
        selection: null,
        draft: { points: [], axisAngle: get().draft.axisAngle, numericInput: "" },
        status: `Click the grid to place ${definition.name}. Escape cancels.`,
        error: undefined,
      });
      return;
    }
    const id = crypto.randomUUID();
    get().commit("Object placed", (project) => {
      project.scene.assetInstances.push({
        id,
        definitionId,
        name: definition.name,
        transform: { position: { x: position.x, y: position.y, z: 0 }, rotationZ: 0, scale: 1 },
        visible: true,
      });
    });
    set({
      selection: { type: "asset", id },
      tool: "select",
      placementDefinitionId: undefined,
      placementAssetId: undefined,
      draft: { points: [], axisAngle: get().draft.axisAngle, numericInput: "" },
    });
  },

  addTerrain(layer, elevationArchiveData, imageryArchiveData) {
    get().commit("Terrain layer added", (project) => {
      project.scene.terrainLayers.push(layer);
      project.georeference ??= { anchorWgs84: layer.anchorWgs84, epsg: layer.sourceEpsg };
    });
    set({ selection: { type: "terrain", id: layer.id }, status: `${layer.name} added` });
    if (elevationArchiveData && layer.elevationArchivePath) {
      set((state) => ({
        terrainAssets: {
          ...state.terrainAssets,
          [layer.elevationArchivePath ?? "terrain.tif"]: elevationArchiveData,
        },
      }));
    }
    if (imageryArchiveData && layer.imageryArchivePath) {
      set((state) => ({
        terrainAssets: {
          ...state.terrainAssets,
          [layer.imageryArchivePath ?? "imagery.png"]: imageryArchiveData,
        },
      }));
    }
  },

  async updateSettings(settings) {
    const saved = await window.sketcher.settings.update(settings);
    set({ settings: saved, status: "Global settings saved" });
  },

  async importAsset() {
    const imported = await window.sketcher.dialogs.importAsset();
    if (!imported || !get().project) return;
    const existing = get().project?.assetDefinitions.find(
      (asset) => asset.contentHash === imported.contentHash,
    );
    if (existing) {
      get().placeAsset(existing.id);
      return;
    }
    const id = crypto.randomUUID();
    const archivePath = `${id}.${imported.extension}`;
    get().commit("Asset imported", (project) => {
      project.assetDefinitions.push({
        id,
        name: imported.name,
        source: "imported",
        kind: "glb",
        archivePath,
        contentHash: imported.contentHash,
      });
    });
    set((state) => ({ assets: { ...state.assets, [archivePath]: imported.dataBase64 } }));
    get().placeAsset(id);
  },

  async importTerrain() {
    const imported = await window.sketcher.dialogs.importTerrain();
    if (!imported) return;
    set({ status: `Decoding ${imported.name}…` });
    const { fromArrayBuffer } = await import("geotiff");
    const bytes = Uint8Array.from(atob(imported.dataBase64), (character) =>
      character.charCodeAt(0),
    );
    const tiff = await fromArrayBuffer(bytes.buffer);
    const image = await tiff.getImage();
    const sourceWidth = image.getWidth();
    const sourceHeight = image.getHeight();
    const maxDimension = 256;
    const scale = Math.min(1, maxDimension / Math.max(sourceWidth, sourceHeight));
    const width = Math.max(2, Math.round(sourceWidth * scale));
    const height = Math.max(2, Math.round(sourceHeight * scale));
    const raster = await image.readRasters({ width, height, samples: [0], interleave: true });
    const values = Array.from(raster as ArrayLike<number>);
    const noData = image.getGDALNoData();
    const valid = values.filter(
      (value) => Number.isFinite(value) && (noData === null || value !== noData),
    );
    const centerValue = values[Math.floor(values.length / 2)];
    const anchorElevation =
      centerValue !== undefined &&
      Number.isFinite(centerValue) &&
      (noData === null || centerValue !== noData)
        ? centerValue
        : (valid[Math.floor(valid.length / 2)] ?? 0);
    const boundingBox = image.getBoundingBox();
    const [minX = 0, minY = 0, maxX = sourceWidth, maxY = sourceHeight] = boundingBox;
    const geoKeys = image.getGeoKeys() as Record<string, unknown> | null;
    const epsgNumber = Number(geoKeys?.ProjectedCSTypeGeoKey ?? geoKeys?.GeographicTypeGeoKey ?? 0);
    const sourceEpsg = epsgNumber > 0 ? `EPSG:${epsgNumber}` : "unknown";
    const { default: proj4 } = await import("proj4");
    proj4.defs("EPSG:25832", "+proj=utm +zone=32 +ellps=GRS80 +units=m +no_defs +type=crs");
    proj4.defs("EPSG:25833", "+proj=utm +zone=33 +ellps=GRS80 +units=m +no_defs +type=crs");
    proj4.defs("EPSG:25835", "+proj=utm +zone=35 +ellps=GRS80 +units=m +no_defs +type=crs");
    const geographic = epsgNumber === 4326 || epsgNumber === 4258;
    const toWgs84 = (x: number, y: number): [number, number] => {
      if (geographic) return [x, y];
      if (epsgNumber > 0 && proj4.defs(sourceEpsg)) {
        return proj4(sourceEpsg, "EPSG:4326", [x, y]) as [number, number];
      }
      return [0, 0];
    };
    const southWest = toWgs84(minX, minY);
    const northEast = toWgs84(maxX, maxY);
    const anchorWgs84 = toWgs84((minX + maxX) / 2, (minY + maxY) / 2);
    const centreLatitude = anchorWgs84[1];
    const widthMeters = geographic
      ? Math.abs(maxX - minX) * 111_320 * Math.cos((centreLatitude * Math.PI) / 180)
      : Math.abs(maxX - minX);
    const heightMeters = geographic ? Math.abs(maxY - minY) * 111_320 : Math.abs(maxY - minY);
    const layerId = crypto.randomUUID();
    const archivePath = `${layerId}.${imported.extension}`;
    get().addTerrain(
      {
        id: layerId,
        name: imported.name,
        provider: "local-geotiff",
        attribution: "User-provided GeoTIFF",
        boundsWgs84: [southWest[0], southWest[1], northEast[0], northEast[1]],
        sourceEpsg,
        anchorWgs84,
        absoluteAnchorElevation: anchorElevation,
        verticalOffset: 0,
        widthMm: Math.max(1, widthMeters * 1000),
        heightMm: Math.max(1, heightMeters * 1000),
        elevationArchivePath: archivePath,
        gridSize: [width, height],
        elevationsMm: values.map((value) =>
          Number.isFinite(value) && (noData === null || value !== noData)
            ? (value - anchorElevation) * 1000
            : 0,
        ),
        visible: true,
      },
      imported.dataBase64,
    );
    set({ status: `Terrain imported · ${sourceEpsg} · ${width}×${height} samples` });
  },
}));
