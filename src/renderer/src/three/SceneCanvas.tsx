import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { TransformControls } from "three/addons/controls/TransformControls.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { OutlinePass } from "three/addons/postprocessing/OutlinePass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import {
  calculateOpeningPlacement,
  distance,
  lockToConstructionAxis,
  OPENING_SNAP_RADIUS_MM,
  openingClearances,
  pointAlongWall,
  pointAtLength,
  snapToGrid,
} from "../../../shared/geometry";
import type { AssetDefinition, ProjectDocument, Vec2, Wall } from "../../../shared/model";
import birchTreeModelUrl from "../assets/models/birch-tree.glb?url";
import carModelUrl from "../assets/models/car.glb?url";
import coniferModelUrl from "../assets/models/conifer.glb?url";
import deciduousTreeModelUrl from "../assets/models/deciduous-tree.glb?url";
import personModelUrl from "../assets/models/person.glb?url";
import { isWallTool, useEditorStore } from "../store";
import { clippingHandlePosition, clippingOffsetFromHandle, createClippingPlane } from "./clipping";
import { setExportRoot } from "./sceneBridge";
import { createBuildingGroup, createBuiltinAsset, createProjectContent } from "./sceneGeometry";

type DimensionEdit =
  | { kind: "footprint-edge"; buildingId: string; startIndex: number; value: number }
  | { kind: "wall-length"; buildingId: string; wallId: string; value: number }
  | { kind: "opening-width"; buildingId: string; openingId: string; value: number };

interface DimensionLine {
  key: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  labelX: number;
  labelY: number;
  angle: number;
  text: string;
  edit?: DimensionEdit;
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes.buffer;
}

function disposeGeometry(root: THREE.Object3D): void {
  root.traverse((child) => {
    if (child instanceof THREE.Mesh || child instanceof THREE.Line) child.geometry.dispose();
  });
}

function entityRoot(object: THREE.Object3D | null): { type?: string; id?: string } {
  let current = object;
  while (current) {
    const type = current.userData.rootEntityType ?? current.userData.entityType;
    const id = current.userData.rootEntityId ?? current.userData.entityId;
    if (type && id) return { type, id };
    current = current.parent;
  }
  return {};
}

function findEntity(root: THREE.Object3D, type: string, id: string): THREE.Object3D | undefined {
  let found: THREE.Object3D | undefined;
  root.traverse((child) => {
    if (!found && child.userData.entityType === type && child.userData.entityId === id) {
      found = child;
    }
  });
  return found;
}

interface BundledModel {
  url: string;
  fitAxis: "x" | "z";
  targetSize: number;
  rotationZ?: number;
}

const bundledModels: Partial<Record<AssetDefinition["kind"], BundledModel>> = {
  car: { url: carModelUrl, fitAxis: "x", targetSize: 4.4, rotationZ: Math.PI / 2 },
  "deciduous-tree": { url: deciduousTreeModelUrl, fitAxis: "z", targetSize: 5.5 },
  conifer: { url: coniferModelUrl, fitAxis: "z", targetSize: 6 },
  "birch-tree": { url: birchTreeModelUrl, fitAxis: "z", targetSize: 6 },
  person: { url: personModelUrl, fitAxis: "z", targetSize: 1.72 },
};

const bundledModelLoader = new GLTFLoader();
const bundledModelCache = new Map<string, Promise<THREE.Group>>();

function cloneBundledModel(template: THREE.Group): THREE.Group {
  const clone = template.clone(true);
  clone.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    child.geometry = child.geometry.clone();
    child.material = Array.isArray(child.material)
      ? child.material.map((item) => item.clone())
      : child.material.clone();
    child.castShadow = true;
    child.receiveShadow = true;
  });
  return clone;
}

async function loadBundledModel(kind: AssetDefinition["kind"]): Promise<THREE.Group | null> {
  const specification = bundledModels[kind];
  if (!specification) return null;
  let pending = bundledModelCache.get(specification.url);
  if (!pending) {
    pending = bundledModelLoader.loadAsync(specification.url).then((gltf) => gltf.scene);
    bundledModelCache.set(specification.url, pending);
  }

  const source = cloneBundledModel(await pending);
  const axisCorrection = new THREE.Group();
  axisCorrection.rotation.x = Math.PI / 2;
  axisCorrection.add(source);
  const oriented = new THREE.Group();
  oriented.rotation.z = specification.rotationZ ?? 0;
  oriented.add(axisCorrection);
  oriented.updateMatrixWorld(true);

  const initialBounds = new THREE.Box3().setFromObject(oriented);
  const initialSize = initialBounds.getSize(new THREE.Vector3());
  const sourceSize = specification.fitAxis === "x" ? initialSize.x : initialSize.z;
  if (sourceSize > 0) oriented.scale.setScalar(specification.targetSize / sourceSize);
  oriented.updateMatrixWorld(true);

  const bounds = new THREE.Box3().setFromObject(oriented);
  const center = bounds.getCenter(new THREE.Vector3());
  oriented.position.set(-center.x, -center.y, -bounds.min.z);
  oriented.updateMatrixWorld(true);
  return oriented;
}

const DEFAULT_CANVAS_BACKGROUND = "#dfe7ee";

function isLightBackground(backgroundColor: string): boolean {
  const background = new THREE.Color(backgroundColor);
  return background.r * 0.2126 + background.g * 0.7152 + background.b * 0.0722 > 0.45;
}

type SceneEngine = {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera | THREE.OrthographicCamera;
  architectureCamera: THREE.PerspectiveCamera;
  builderCamera: THREE.OrthographicCamera;
  builderViewHeight: number;
  renderer: THREE.WebGLRenderer;
  composer: EffectComposer;
  renderPass: RenderPass;
  outline: OutlinePass;
  orbit: OrbitControls;
  transform: TransformControls;
  grid: THREE.GridHelper;
  clippingHelper: THREE.PlaneHelper;
  clippingHandle: THREE.Mesh;
  clippingTransform: TransformControls;
  content: THREE.Group;
  draft: THREE.Group;
  ground: THREE.Mesh;
  raycaster: THREE.Raycaster;
  pointer: THREE.Vector2;
};

function applyCanvasAppearance(engine: SceneEngine, backgroundColor: string): void {
  const background = new THREE.Color(backgroundColor);
  engine.scene.background = background;
  if (engine.scene.fog) engine.scene.fog.color.copy(background);
  engine.renderer.setClearColor(background);
  const isLight = isLightBackground(backgroundColor);
  const colors = isLight ? [0x536675, 0xa4b2bc] : [0x7890a2, 0x2d3b46];
  const materials = Array.isArray(engine.grid.material)
    ? engine.grid.material
    : [engine.grid.material];
  materials.forEach((material, index) => {
    material.color.setHex(colors[index] ?? colors[1] ?? 0xa4b2bc);
  });
}

function builderSnapRadiusMm(
  engine: SceneEngine,
  viewportWidth: number,
  configuredPixels: number,
): number {
  if (!(engine.camera instanceof THREE.OrthographicCamera)) {
    return Math.max(300, configuredPixels * 30);
  }
  const worldWidth = (engine.camera.right - engine.camera.left) / engine.camera.zoom;
  const pixels = Math.max(24, configuredPixels * 2);
  return Math.max(150, Math.min(1200, (worldWidth * 1000 * pixels) / viewportWidth));
}

function closestPointOnSegment(point: Vec2, start: Vec2, end: Vec2): Vec2 {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared === 0) return start;
  const t = Math.max(
    0,
    Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared),
  );
  return { x: start.x + dx * t, y: start.y + dy * t };
}

function aggressiveBuilderSnap(
  point: Vec2,
  project: ProjectDocument | undefined,
  activeBuildingId: string | undefined,
  tool: string,
  draftPoints: Vec2[],
  radius: number,
): Vec2 | null {
  const building = project?.buildingDefinitions.find((item) => item.id === activeBuildingId);
  const vertices = [...draftPoints];
  const segments: Array<{ start: Vec2; end: Vec2 }> = [];
  for (let index = 1; index < draftPoints.length; index += 1) {
    const start = draftPoints[index - 1];
    const end = draftPoints[index];
    if (start && end) segments.push({ start, end });
  }
  if (building) {
    vertices.push(
      ...building.footprint,
      ...building.walls.flatMap((wall) => [wall.start, wall.end]),
    );
    for (let index = 0; index < building.footprint.length; index += 1) {
      const start = building.footprint[index];
      const end = building.footprint[(index + 1) % building.footprint.length];
      if (start && end) segments.push({ start, end });
    }
    segments.push(...building.walls.map((wall) => ({ start: wall.start, end: wall.end })));
  }
  const nearestVertex = vertices
    .map((vertex) => ({ vertex, proximity: distance(point, vertex) }))
    .sort((left, right) => left.proximity - right.proximity)[0];
  if (nearestVertex && nearestVertex.proximity <= radius) return nearestVertex.vertex;
  if (tool === "foundation" && draftPoints[0] && distance(point, draftPoints[0]) <= radius) {
    return draftPoints[0];
  }
  const nearestEdge = segments
    .map((segment) => {
      const snapped = closestPointOnSegment(point, segment.start, segment.end);
      return { snapped, proximity: distance(point, snapped) };
    })
    .sort((left, right) => left.proximity - right.proximity)[0];
  return nearestEdge && nearestEdge.proximity <= radius ? nearestEdge.snapped : null;
}

function projectDimension(
  engine: SceneEngine,
  rect: DOMRect,
  key: string,
  start: Vec2,
  end: Vec2,
  text: string,
  offset: number,
  edit?: DimensionEdit,
): DimensionLine {
  const a = new THREE.Vector3(start.x / 1000, start.y / 1000, 0.03).project(engine.camera);
  const b = new THREE.Vector3(end.x / 1000, end.y / 1000, 0.03).project(engine.camera);
  const x1 = ((a.x + 1) / 2) * rect.width;
  const y1 = ((1 - a.y) / 2) * rect.height;
  const x2 = ((b.x + 1) / 2) * rect.width;
  const y2 = ((1 - b.y) / 2) * rect.height;
  const dx = x2 - x1;
  const dy = y2 - y1;
  const screenLength = Math.max(1, Math.hypot(dx, dy));
  const offsetX = (-dy / screenLength) * offset;
  const offsetY = (dx / screenLength) * offset;
  return {
    key,
    x1: x1 + offsetX,
    y1: y1 + offsetY,
    x2: x2 + offsetX,
    y2: y2 + offsetY,
    labelX: (x1 + x2) / 2 + offsetX,
    labelY: (y1 + y2) / 2 + offsetY,
    angle: (Math.atan2(dy, dx) * 180) / Math.PI,
    text,
    edit,
  };
}

function appendOpeningDimensions(
  lines: DimensionLine[],
  engine: SceneEngine,
  rect: DOMRect,
  key: string,
  wall: Wall,
  offset: number,
  width: number,
  clearances: {
    leftBoundaryOffset: number;
    rightBoundaryOffset: number;
    left: number;
    right: number;
  },
  label: string,
  edit?: DimensionEdit,
): void {
  const leftBoundary = pointAlongWall(wall, clearances.leftBoundaryOffset);
  const start = pointAlongWall(wall, offset);
  const end = pointAlongWall(wall, offset + width);
  const rightBoundary = pointAlongWall(wall, clearances.rightBoundaryOffset);
  if (clearances.left > 1) {
    lines.push(
      projectDimension(
        engine,
        rect,
        `${key}-left`,
        leftBoundary,
        start,
        `L ${Math.round(clearances.left)} mm`,
        36,
      ),
    );
  }
  lines.push(projectDimension(engine, rect, `${key}-opening`, start, end, label, 56, edit));
  if (clearances.right > 1) {
    lines.push(
      projectDimension(
        engine,
        rect,
        `${key}-right`,
        end,
        rightBoundary,
        `R ${Math.round(clearances.right)} mm`,
        36,
      ),
    );
  }
}

export function SceneCanvas() {
  const hostRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const dimensionInputRef = useRef<HTMLInputElement>(null);
  const engineRef = useRef<SceneEngine | null>(null);
  const rawPointerRef = useRef<Vec2 | null>(null);
  const [dimensions, setDimensions] = useState<DimensionLine[]>([]);
  const [dimensionEdit, setDimensionEdit] = useState<{
    line: DimensionLine;
    value: string;
  } | null>(null);
  const isDimensionEditing = Boolean(dimensionEdit);
  const [inputPosition, setInputPosition] = useState({ x: 0, y: 0, visible: false });

  const project = useEditorStore((state) => state.project);
  const mode = useEditorStore((state) => state.mode);
  const tool = useEditorStore((state) => state.tool);
  const transformMode = useEditorStore((state) => state.transformMode);
  const clipping = useEditorStore((state) => state.clipping);
  const selection = useEditorStore((state) => state.selection);
  const activeBuildingId = useEditorStore((state) => state.activeBuildingId);
  const activeFloorId = useEditorStore((state) => state.activeFloorId);
  const placementDefinitionId = useEditorStore((state) => state.placementDefinitionId);
  const placementAssetId = useEditorStore((state) => state.placementAssetId);
  const draft = useEditorStore((state) => state.draft);
  const setDraft = useEditorStore((state) => state.setDraft);
  const addDraftPoint = useEditorStore((state) => state.addDraftPoint);
  const addWallSegment = useEditorStore((state) => state.addWallSegment);
  const addOpening = useEditorStore((state) => state.addOpening);
  const addStair = useEditorStore((state) => state.addStair);
  const placeBuilding = useEditorStore((state) => state.placeBuilding);
  const placeAsset = useEditorStore((state) => state.placeAsset);
  const setSelection = useEditorStore((state) => state.setSelection);
  const commit = useEditorStore((state) => state.commit);
  const assets = useEditorStore((state) => state.assets);
  const terrainAssets = useEditorStore((state) => state.terrainAssets);
  const settings = useEditorStore((state) => state.settings);
  const activeBuilding = project?.buildingDefinitions.find((item) => item.id === activeBuildingId);
  const openingPreview =
    activeBuilding &&
    activeFloorId &&
    draft.hover &&
    (tool === "door" || tool === "window" || tool === "carport")
      ? calculateOpeningPlacement(
          activeBuilding.walls,
          activeBuilding.openings,
          activeFloorId,
          draft.hover,
          tool === "carport" ? 3000 : tool === "door" ? 900 : 1200,
        )
      : null;

  useEffect(() => {
    if (!isDimensionEditing) return;
    const frame = requestAnimationFrame(() => {
      dimensionInputRef.current?.focus();
      dimensionInputRef.current?.select();
    });
    return () => cancelAnimationFrame(frame);
  }, [isDimensionEditing]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(DEFAULT_CANVAS_BACKGROUND);
    scene.fog = new THREE.FogExp2(DEFAULT_CANVAS_BACKGROUND, 0.0015);
    const architectureCamera = new THREE.PerspectiveCamera(
      45,
      host.clientWidth / host.clientHeight,
      0.01,
      5000,
    );
    architectureCamera.up.set(0, 0, 1);
    architectureCamera.position.set(14, -16, 12);
    const builderViewHeight = 14;
    const builderCamera = new THREE.OrthographicCamera(
      (-builderViewHeight * architectureCamera.aspect) / 2,
      (builderViewHeight * architectureCamera.aspect) / 2,
      builderViewHeight / 2,
      -builderViewHeight / 2,
      0.01,
      5000,
    );
    builderCamera.up.set(0, 1, 0);
    builderCamera.position.set(0, 0, 100);
    builderCamera.lookAt(0, 0, 0);

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      preserveDrawingBuffer: true,
      powerPreference: "high-performance",
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(host.clientWidth, host.clientHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.12;
    host.appendChild(renderer.domElement);

    const environmentGenerator = new THREE.PMREMGenerator(renderer);
    const environment = environmentGenerator.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = environment;

    const orbit = new OrbitControls(architectureCamera, renderer.domElement);
    orbit.target.set(2, 2, 0);
    orbit.enableDamping = true;
    orbit.dampingFactor = 0.08;
    orbit.maxPolarAngle = Math.PI * 0.49;
    orbit.update();

    const grid = new THREE.GridHelper(200, 200, 0x536675, 0xa4b2bc);
    grid.rotation.x = Math.PI / 2;
    grid.position.z = -0.001;
    const gridMaterials = Array.isArray(grid.material) ? grid.material : [grid.material];
    gridMaterials.forEach((material) => {
      material.opacity = 0.28;
      material.transparent = true;
    });
    scene.add(grid);
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(200, 200),
      new THREE.ShadowMaterial({ color: 0x24313a, opacity: 0.13 }),
    );
    ground.position.z = -0.004;
    ground.receiveShadow = true;
    ground.name = "Ground shadow catcher";
    scene.add(ground);
    const clippingHelper = new THREE.PlaneHelper(
      createClippingPlane({
        enabled: false,
        axis: "x",
        offsetMm: 0,
        inverted: false,
        showHelper: true,
      }),
      6,
      0x5b402d,
    );
    clippingHelper.visible = false;
    const clippingHandle = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.14),
      new THREE.MeshBasicMaterial({ color: 0x6e4329, depthTest: false }),
    );
    clippingHandle.visible = false;
    clippingHandle.renderOrder = 2000;
    scene.add(clippingHelper, clippingHandle);

    const hemisphere = new THREE.HemisphereLight(0xe8f1f7, 0x53616a, 1.45);
    const sun = new THREE.DirectionalLight(0xfff4df, 2.65);
    sun.position.set(-18, -14, 28);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.bias = -0.0002;
    sun.shadow.normalBias = 0.018;
    sun.shadow.radius = 2;
    sun.shadow.camera.left = -40;
    sun.shadow.camera.right = 40;
    sun.shadow.camera.top = 40;
    sun.shadow.camera.bottom = -40;
    scene.add(hemisphere, sun);

    const content = new THREE.Group();
    const draftGroup = new THREE.Group();
    scene.add(content, draftGroup);

    const composer = new EffectComposer(renderer);
    const renderPass = new RenderPass(scene, architectureCamera);
    composer.addPass(renderPass);
    const outline = new OutlinePass(
      new THREE.Vector2(host.clientWidth, host.clientHeight),
      scene,
      architectureCamera,
    );
    outline.edgeStrength = 3;
    outline.edgeThickness = 1;
    outline.visibleEdgeColor.set(0x45b8ff);
    outline.hiddenEdgeColor.set(0x2b78c5);
    composer.addPass(outline);
    composer.addPass(new OutputPass());

    const transform = new TransformControls(architectureCamera, renderer.domElement);
    transform.setSize(0.8);
    transform.setRotationSnap((5 * Math.PI) / 180);
    scene.add(transform.getHelper());
    transform.addEventListener("dragging-changed", (event) => {
      orbit.enabled = !(event as THREE.Event & { value: boolean }).value;
    });
    const clippingTransform = new TransformControls(architectureCamera, renderer.domElement);
    clippingTransform.setMode("translate");
    clippingTransform.setSpace("world");
    clippingTransform.setSize(0.62);
    clippingTransform.enabled = false;
    clippingTransform.attach(clippingHandle);
    clippingTransform.getHelper().visible = false;
    scene.add(clippingTransform.getHelper());
    clippingTransform.addEventListener("dragging-changed", (event) => {
      orbit.enabled = !(event as THREE.Event & { value: boolean }).value;
    });
    clippingTransform.addEventListener("objectChange", () => {
      const state = useEditorStore.getState();
      state.setClipping({
        offsetMm: clippingOffsetFromHandle(state.clipping.axis, clippingHandle.position),
        enabled: true,
      });
    });

    const engine = {
      scene,
      camera: architectureCamera,
      architectureCamera,
      builderCamera,
      builderViewHeight,
      renderer,
      composer,
      renderPass,
      outline,
      orbit,
      transform,
      grid,
      clippingHelper,
      clippingHandle,
      clippingTransform,
      content,
      draft: draftGroup,
      ground,
      raycaster: new THREE.Raycaster(),
      pointer: new THREE.Vector2(),
    };
    engineRef.current = engine;

    const resizeObserver = new ResizeObserver(() => {
      if (!host.clientWidth || !host.clientHeight) return;
      architectureCamera.aspect = host.clientWidth / host.clientHeight;
      architectureCamera.updateProjectionMatrix();
      builderCamera.left = (-engine.builderViewHeight * architectureCamera.aspect) / 2;
      builderCamera.right = (engine.builderViewHeight * architectureCamera.aspect) / 2;
      builderCamera.top = engine.builderViewHeight / 2;
      builderCamera.bottom = -engine.builderViewHeight / 2;
      builderCamera.updateProjectionMatrix();
      renderer.setSize(host.clientWidth, host.clientHeight);
      composer.setSize(host.clientWidth, host.clientHeight);
      outline.setSize(host.clientWidth, host.clientHeight);
    });
    resizeObserver.observe(host);

    let frame = 0;
    const render = () => {
      orbit.update();
      composer.render();
      frame = requestAnimationFrame(render);
    };
    render();
    return () => {
      cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      setExportRoot(null);
      transform.dispose();
      clippingTransform.dispose();
      orbit.dispose();
      composer.dispose();
      environment.dispose();
      environmentGenerator.dispose();
      ground.geometry.dispose();
      (ground.material as THREE.Material).dispose();
      renderer.dispose();
      host.removeChild(renderer.domElement);
      engineRef.current = null;
    };
  }, []);

  useEffect(() => {
    const engine = engineRef.current;
    const host = hostRef.current;
    if (!engine || !host) return;
    const background = settings?.backgroundColor ?? DEFAULT_CANVAS_BACKGROUND;
    applyCanvasAppearance(engine, background);
    host.dataset.canvasTone = isLightBackground(background) ? "light" : "dark";
  }, [settings?.backgroundColor]);

  useEffect(() => {
    const engine = engineRef.current;
    const host = hostRef.current;
    if (!engine || !host) return;
    const plane = createClippingPlane(clipping);
    engine.renderer.clippingPlanes = clipping.enabled ? [plane] : [];
    engine.clippingHelper.plane.copy(plane);
    engine.clippingHelper.visible = clipping.enabled;
    if (!engine.clippingTransform.dragging) {
      engine.clippingHandle.position.copy(clippingHandlePosition(clipping));
    }
    engine.clippingHandle.visible = clipping.enabled;
    engine.clippingTransform.enabled = clipping.enabled;
    engine.clippingTransform.getHelper().visible = clipping.enabled;
    engine.clippingTransform.showX = clipping.axis === "x";
    engine.clippingTransform.showY = clipping.axis === "y";
    engine.clippingTransform.showZ = clipping.axis === "z";
    host.dataset.clippingEnabled = String(clipping.enabled);
    host.dataset.clippingAxis = clipping.axis;
    host.dataset.clippingOffset = String(clipping.offsetMm);
  }, [clipping]);

  useEffect(() => {
    const engine = engineRef.current;
    if (!engine) return;
    engine.transform.setMode(transformMode);
  }, [transformMode]);

  useEffect(() => {
    const engine = engineRef.current;
    const host = hostRef.current;
    if (!engine || !host) return;
    if (mode === "builder") {
      const footprint =
        useEditorStore
          .getState()
          .project?.buildingDefinitions.find((item) => item.id === activeBuildingId)?.footprint ??
        [];
      const xs = footprint.map((point) => point.x);
      const ys = footprint.map((point) => point.y);
      const minX = xs.length ? Math.min(...xs) : -4000;
      const maxX = xs.length ? Math.max(...xs) : 4000;
      const minY = ys.length ? Math.min(...ys) : -4000;
      const maxY = ys.length ? Math.max(...ys) : 4000;
      const span = Math.max(maxX - minX, maxY - minY, 8000) / 1000;
      engine.builderViewHeight = span * 1.7;
      const aspect = host.clientWidth / host.clientHeight;
      engine.builderCamera.left = (-engine.builderViewHeight * aspect) / 2;
      engine.builderCamera.right = (engine.builderViewHeight * aspect) / 2;
      engine.builderCamera.top = engine.builderViewHeight / 2;
      engine.builderCamera.bottom = -engine.builderViewHeight / 2;
      engine.builderCamera.position.set((minX + maxX) / 2000, (minY + maxY) / 2000, 100);
      engine.builderCamera.lookAt((minX + maxX) / 2000, (minY + maxY) / 2000, 0);
      engine.builderCamera.updateProjectionMatrix();
      engine.camera = engine.builderCamera;
      engine.orbit.object = engine.builderCamera;
      engine.orbit.target.set((minX + maxX) / 2000, (minY + maxY) / 2000, 0);
      engine.orbit.enableRotate = false;
      const gridMaterials = Array.isArray(engine.grid.material)
        ? engine.grid.material
        : [engine.grid.material];
      gridMaterials.forEach((material, index) => {
        material.opacity = index === 0 ? 0.9 : 0.68;
        material.transparent = true;
      });
      engine.ground.visible = false;
    } else {
      engine.camera = engine.architectureCamera;
      engine.orbit.object = engine.architectureCamera;
      engine.orbit.enableRotate = true;
      engine.orbit.maxPolarAngle = Math.PI * 0.49;
      const gridMaterials = Array.isArray(engine.grid.material)
        ? engine.grid.material
        : [engine.grid.material];
      gridMaterials.forEach((material) => {
        material.opacity = 0.28;
      });
      engine.ground.visible = true;
    }
    engine.renderPass.camera = engine.camera;
    engine.outline.renderCamera = engine.camera;
    engine.transform.camera = engine.camera;
    engine.clippingTransform.camera = engine.camera;
    engine.orbit.update();
  }, [mode, activeBuildingId]);

  useEffect(() => {
    const engine = engineRef.current;
    const host = hostRef.current;
    if (!engine || !host || !project) return;
    let cancelled = false;
    disposeGeometry(engine.content);
    engine.content.clear();
    const next = createProjectContent(
      project,
      mode === "builder" ? activeBuildingId : undefined,
      terrainAssets,
      mode === "builder" ? activeFloorId : undefined,
    );
    while (next.children.length > 0) {
      const child = next.children[0];
      if (child) engine.content.add(child);
    }
    setExportRoot(engine.content);

    if (mode === "architecture") {
      const bundledInstances = project.scene.assetInstances.filter((instance) => {
        if (!instance.visible) return false;
        const definition = project.assetDefinitions.find(
          (item) => item.id === instance.definitionId,
        );
        return definition?.source === "builtin" && Boolean(bundledModels[definition.kind]);
      });
      let bundledModelsLoaded = 0;
      host.dataset.bundledModels = bundledInstances.length > 0 ? "loading" : "ready";
      for (const instance of bundledInstances) {
        const definition = project.assetDefinitions.find(
          (item) => item.id === instance.definitionId,
        );
        if (!definition) continue;
        void loadBundledModel(definition.kind)
          .then((model) => {
            if (cancelled || !model) return;
            const group = engine.content.children.find(
              (child) =>
                child.userData.entityType === "asset" && child.userData.entityId === instance.id,
            );
            if (!group) return;
            disposeGeometry(group);
            group.clear();
            group.add(model);
            group.traverse((child) => {
              child.userData.rootEntityType = "asset";
              child.userData.rootEntityId = instance.id;
            });
            bundledModelsLoaded += 1;
            host.dataset.bundledModels =
              bundledModelsLoaded === bundledInstances.length ? "ready" : "loading";
          })
          .catch((error) => {
            console.error(`Unable to load bundled ${definition.kind} model`, error);
            bundledModelsLoaded += 1;
            host.dataset.bundledModels =
              bundledModelsLoaded === bundledInstances.length ? "fallback" : "loading";
          });
      }

      const loader = new GLTFLoader();
      for (const instance of project.scene.assetInstances.filter((item) => item.visible)) {
        const definition = project.assetDefinitions.find(
          (item) => item.id === instance.definitionId,
        );
        const base64 = definition?.archivePath ? assets[definition.archivePath] : undefined;
        if (definition?.source !== "imported" || !base64) continue;
        loader.parse(
          base64ToArrayBuffer(base64),
          "",
          (gltf) => {
            if (cancelled) {
              disposeGeometry(gltf.scene);
              return;
            }
            const group = new THREE.Group();
            group.position.set(
              instance.transform.position.x / 1000,
              instance.transform.position.y / 1000,
              instance.transform.position.z / 1000,
            );
            group.rotation.z = instance.transform.rotationZ;
            group.scale.setScalar(instance.transform.scale);
            group.userData = { entityType: "asset", entityId: instance.id };
            const axisCorrection = new THREE.Group();
            axisCorrection.rotation.x = Math.PI / 2;
            axisCorrection.add(gltf.scene);
            group.add(axisCorrection);
            group.traverse((child) => {
              child.userData.rootEntityType = "asset";
              child.userData.rootEntityId = instance.id;
              if (child instanceof THREE.Mesh) {
                child.castShadow = true;
                child.receiveShadow = true;
              }
            });
            engine.content.add(group);
          },
          (error) => console.error("Unable to load imported GLB", error),
        );
      }
    }
    return () => {
      cancelled = true;
    };
  }, [project, mode, activeBuildingId, activeFloorId, assets, terrainAssets]);

  useEffect(() => {
    const engine = engineRef.current;
    if (!engine || !project) return;
    engine.transform.detach();
    engine.outline.selectedObjects = [];
    if (!selection) return;
    const object =
      mode === "architecture"
        ? engine.content.children.find(
            (child) =>
              child.userData.entityType === selection.type &&
              child.userData.entityId === selection.id,
          )
        : findEntity(engine.content, selection.type, selection.id);
    if (!object) return;
    engine.outline.selectedObjects = [object];
    const building = project.buildingDefinitions.find((item) => item.id === activeBuildingId);
    const selectedWall =
      selection.type === "wall"
        ? building?.walls.find((item) => item.id === selection.id)
        : undefined;
    const builderTransformable =
      mode === "builder" &&
      tool === "select" &&
      (selection.type === "stair" ||
        (selection.type === "wall" && selectedWall?.type === "internal"));
    const architectureTransformable =
      mode === "architecture" &&
      tool === "select" &&
      !clipping.enabled &&
      (selection.type === "building" || selection.type === "asset");
    if (builderTransformable || architectureTransformable) {
      if (mode === "builder") {
        engine.transform.setSpace("world");
        engine.transform.setTranslationSnap((project.settings.gridSpacing ?? 100) / 1000);
        engine.transform.showX = transformMode !== "rotate";
        engine.transform.showY = transformMode !== "rotate";
        engine.transform.showZ = transformMode === "rotate";
      } else {
        engine.transform.setSpace("world");
        engine.transform.setTranslationSnap(null);
        engine.transform.showX = true;
        engine.transform.showY = true;
        engine.transform.showZ = true;
      }
      engine.transform.attach(object);
      const onMouseUp = () => {
        const current = useEditorStore.getState();
        if (mode === "builder" && building) {
          commit(
            selection.type === "wall" ? "Inner wall transformed" : "Stair transformed",
            (document) => {
              const targetBuilding = document.buildingDefinitions.find(
                (item) => item.id === building.id,
              );
              if (!targetBuilding) return;
              if (selection.type === "wall") {
                const target = targetBuilding.walls.find((item) => item.id === selection.id);
                if (!target) return;
                const length = distance(target.start, target.end);
                const center = { x: object.position.x * 1000, y: object.position.y * 1000 };
                const direction = {
                  x: Math.cos(object.rotation.z),
                  y: Math.sin(object.rotation.z),
                };
                target.start = {
                  x: Math.round(center.x - (direction.x * length) / 2),
                  y: Math.round(center.y - (direction.y * length) / 2),
                };
                target.end = {
                  x: Math.round(center.x + (direction.x * length) / 2),
                  y: Math.round(center.y + (direction.y * length) / 2),
                };
              } else if (selection.type === "stair") {
                const target = targetBuilding.stairs.find((item) => item.id === selection.id);
                if (!target) return;
                target.position = {
                  x: Math.round(object.position.x * 1000),
                  y: Math.round(object.position.y * 1000),
                };
                target.rotationZ = object.rotation.z;
              }
            },
          );
        } else {
          commit("Object transformed", (document) => {
            const target =
              selection.type === "building"
                ? document.scene.buildingInstances.find((item) => item.id === selection.id)
                : document.scene.assetInstances.find((item) => item.id === selection.id);
            if (!target) return;
            target.transform.position = {
              x: Math.round(object.position.x * 1000),
              y: Math.round(object.position.y * 1000),
              z: Math.round(object.position.z * 1000),
            };
            target.transform.rotationZ = object.rotation.z;
            if (selection.type === "asset") target.transform.scale = object.scale.x;
          });
        }
        current.setStatus("Transform committed");
      };
      engine.transform.addEventListener("mouseUp", onMouseUp);
      return () => engine.transform.removeEventListener("mouseUp", onMouseUp);
    }
  }, [selection, mode, tool, project, activeBuildingId, transformMode, commit, clipping.enabled]);

  useEffect(() => {
    const engine = engineRef.current;
    if (!engine) return;
    disposeGeometry(engine.draft);
    engine.draft.clear();
    hostRef.current?.setAttribute(
      "data-opening-preview",
      openingPreview ? (openingPreview.valid ? "valid" : "invalid") : "none",
    );
    hostRef.current?.setAttribute("data-placement-preview", "none");
    const darkHelpers = isLightBackground(settings?.backgroundColor ?? DEFAULT_CANVAS_BACKGROUND);
    const helpColors = darkHelpers
      ? {
          fill: 0x203f50,
          line: 0x183746,
          marker: 0x31566a,
          closure: 0x315a45,
          opening: 0x315b4f,
          openingLine: 0x284a42,
        }
      : {
          fill: 0x179bd1,
          line: 0x65c5ee,
          marker: 0x9bddff,
          closure: 0x37e0a5,
          opening: 0x36c7a1,
          openingLine: 0x1ba990,
        };
    const points = [...draft.points];
    if (draft.wallStart) points.push(draft.wallStart);
    if (draft.hover && (draft.points.length > 0 || draft.wallStart)) points.push(draft.hover);
    if (points.length > 0) {
      if ((tool === "foundation" || tool === "polygon") && points.length >= 3) {
        const shape = new THREE.Shape(
          points.map((point) => new THREE.Vector2(point.x / 1000, point.y / 1000)),
        );
        const fill = new THREE.Mesh(
          new THREE.ShapeGeometry(shape),
          new THREE.MeshBasicMaterial({
            color: helpColors.fill,
            transparent: true,
            opacity: 0.22,
            depthTest: false,
            side: THREE.DoubleSide,
          }),
        );
        fill.position.z = 0.012;
        fill.renderOrder = 997;
        engine.draft.add(fill);
      }
      const geometry = new THREE.BufferGeometry().setFromPoints(
        points.map((point) => new THREE.Vector3(point.x / 1000, point.y / 1000, 0.015)),
      );
      const line = new THREE.Line(
        geometry,
        new THREE.LineBasicMaterial({ color: helpColors.line, depthTest: false }),
      );
      line.renderOrder = 999;
      engine.draft.add(line);
      const closureTarget =
        (tool === "foundation" || tool === "polygon") &&
        draft.points.length >= 3 &&
        draft.points[0] &&
        draft.hover &&
        distance(draft.points[0], draft.hover) < 1;
      for (const [index, point] of points.entries()) {
        const isClosureTarget = closureTarget && index === 0;
        const marker = new THREE.Mesh(
          new THREE.SphereGeometry(isClosureTarget ? 0.11 : 0.06, 12, 8),
          new THREE.MeshBasicMaterial({
            color: isClosureTarget ? helpColors.closure : helpColors.marker,
            depthTest: false,
          }),
        );
        marker.position.set(point.x / 1000, point.y / 1000, 0.02);
        marker.renderOrder = 1000;
        engine.draft.add(marker);
      }
      if ((tool === "foundation" || tool === "polygon") && draft.hover) {
        const gridTarget = new THREE.Mesh(
          new THREE.RingGeometry(0.07, 0.1, 4),
          new THREE.MeshBasicMaterial({
            color: 0xf7a735,
            depthTest: false,
            side: THREE.DoubleSide,
          }),
        );
        gridTarget.position.set(draft.hover.x / 1000, draft.hover.y / 1000, 0.025);
        gridTarget.rotation.z = Math.PI / 4;
        gridTarget.renderOrder = 1001;
        engine.draft.add(gridTarget);
      }
    }
    if ((tool === "foundation" || tool === "polygon") && draft.hover && points.length === 0) {
      const gridTarget = new THREE.Mesh(
        new THREE.RingGeometry(0.07, 0.1, 4),
        new THREE.MeshBasicMaterial({ color: 0xf7a735, depthTest: false, side: THREE.DoubleSide }),
      );
      gridTarget.position.set(draft.hover.x / 1000, draft.hover.y / 1000, 0.025);
      gridTarget.rotation.z = Math.PI / 4;
      gridTarget.renderOrder = 1001;
      engine.draft.add(gridTarget);
    }
    if (
      mode === "architecture" &&
      draft.hover &&
      (tool === "place-building" || tool === "place-asset")
    ) {
      const preview =
        tool === "place-building"
          ? (() => {
              const definition = project?.buildingDefinitions.find(
                (item) => item.id === placementDefinitionId,
              );
              return definition ? createBuildingGroup(definition) : undefined;
            })()
          : (() => {
              const definition = project?.assetDefinitions.find(
                (item) => item.id === placementAssetId,
              );
              return definition ? createBuiltinAsset(definition) : undefined;
            })();
      if (preview) {
        preview.position.set(draft.hover.x / 1000, draft.hover.y / 1000, 0.02);
        preview.traverse((child) => {
          if (!(child instanceof THREE.Mesh)) return;
          const source = Array.isArray(child.material) ? child.material[0] : child.material;
          if (!source) return;
          const previewMaterial = source.clone();
          previewMaterial.transparent = true;
          previewMaterial.opacity = 0.48;
          previewMaterial.depthWrite = false;
          child.material = previewMaterial;
          child.renderOrder = 995;
        });
        preview.userData = { placementPreview: tool };
        engine.draft.add(preview);
        hostRef.current?.setAttribute("data-placement-preview", tool);
      }
    }
    if (openingPreview) {
      const { wall } = openingPreview;
      const wallLength = distance(wall.start, wall.end);
      const angle = Math.atan2(wall.end.y - wall.start.y, wall.end.x - wall.start.x);
      const wallCenter = pointAlongWall(wall, wallLength / 2);
      const guide = new THREE.Mesh(
        new THREE.BoxGeometry(wallLength / 1000, (OPENING_SNAP_RADIUS_MM * 2) / 1000, 0.006),
        new THREE.MeshBasicMaterial({
          color: openingPreview.valid ? helpColors.opening : 0xe26d71,
          transparent: true,
          opacity: 0.09,
          depthTest: false,
        }),
      );
      guide.position.set(wallCenter.x / 1000, wallCenter.y / 1000, 0.035);
      guide.rotation.z = angle;
      guide.renderOrder = 996;
      engine.draft.add(guide);
      const preview = new THREE.Mesh(
        new THREE.BoxGeometry(
          openingPreview.width / 1000,
          Math.max(wall.thickness / 1000, 0.18),
          0.03,
        ),
        new THREE.MeshBasicMaterial({
          color: openingPreview.valid ? helpColors.opening : 0xff6d72,
          transparent: true,
          opacity: 0.62,
          depthTest: false,
        }),
      );
      preview.position.set(openingPreview.center.x / 1000, openingPreview.center.y / 1000, 0.06);
      preview.rotation.z = angle;
      preview.renderOrder = 998;
      engine.draft.add(preview);
      const guideLine = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(wall.start.x / 1000, wall.start.y / 1000, 0.07),
          new THREE.Vector3(wall.end.x / 1000, wall.end.y / 1000, 0.07),
        ]),
        new THREE.LineBasicMaterial({
          color: openingPreview.valid ? helpColors.openingLine : 0xd25c60,
          depthTest: false,
        }),
      );
      guideLine.renderOrder = 999;
      engine.draft.add(guideLine);
    }
  }, [
    draft,
    mode,
    openingPreview,
    placementAssetId,
    placementDefinitionId,
    project,
    settings?.backgroundColor,
    tool,
  ]);

  useEffect(() => {
    const host = hostRef.current;
    const engine = engineRef.current;
    if (!host || !engine) return;

    const pointerPoint = (event: PointerEvent): Vec2 | null => {
      const rect = host.getBoundingClientRect();
      engine.pointer.set(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        -((event.clientY - rect.top) / rect.height) * 2 + 1,
      );
      engine.raycaster.setFromCamera(engine.pointer, engine.camera);
      const hit = new THREE.Vector3();
      if (
        !engine.raycaster.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 0, 1), 0), hit)
      ) {
        return null;
      }
      const rawPoint = { x: hit.x * 1000, y: hit.y * 1000 };
      rawPointerRef.current = rawPoint;
      const current = useEditorStore.getState();
      if (
        current.mode === "builder" &&
        (current.tool === "door" || current.tool === "window" || current.tool === "carport")
      ) {
        return rawPoint;
      }
      const aggressiveSnap = aggressiveBuilderSnap(
        rawPoint,
        current.project,
        current.activeBuildingId,
        current.tool,
        current.draft.points,
        builderSnapRadiusMm(engine, rect.width, current.project?.settings.snapTolerance ?? 12),
      );
      const origin = isWallTool(current.tool)
        ? current.draft.wallStart
        : current.draft.points.at(-1);
      if (current.mode === "builder" && isWallTool(current.tool) && origin) {
        return lockToConstructionAxis(origin, aggressiveSnap ?? rawPoint, current.draft.axisAngle);
      }
      if (aggressiveSnap) return aggressiveSnap;
      if (current.mode === "builder" && origin) {
        return lockToConstructionAxis(origin, rawPoint, current.draft.axisAngle);
      }
      return snapToGrid(rawPoint, project?.settings.gridSpacing ?? 100);
    };

    const onPointerMove = (event: PointerEvent) => {
      if (engine.transform.dragging || engine.clippingTransform.dragging) return;
      const point = pointerPoint(event);
      if (
        point &&
        ((mode === "builder" &&
          (isWallTool(tool) ||
            ["foundation", "door", "window", "carport", "stair"].includes(tool))) ||
          (mode === "architecture" && ["place-building", "place-asset", "polygon"].includes(tool)))
      ) {
        setDraft({ hover: point });
      }
    };

    const onPointerDown = (event: PointerEvent) => {
      if (event.button !== 0 || engine.transform.dragging || engine.clippingTransform.dragging)
        return;
      const point = pointerPoint(event);
      if (!point) return;
      if (mode === "builder") {
        if (tool === "foundation") addDraftPoint(point);
        else if (isWallTool(tool)) {
          if (draft.wallStart) addWallSegment(draft.wallStart, point);
          else setDraft({ wallStart: point });
        } else if (tool === "door" || tool === "window" || tool === "carport") {
          addOpening(tool, point);
        } else if (tool === "stair") addStair(point);
        else if (tool === "select") {
          engine.raycaster.setFromCamera(engine.pointer, engine.camera);
          const intersections = engine.raycaster.intersectObjects(engine.content.children, true);
          const entity = entityRoot(intersections[0]?.object ?? null);
          if (
            entity.id &&
            (entity.type === "wall" || entity.type === "opening" || entity.type === "stair")
          ) {
            setSelection({ type: entity.type, id: entity.id });
          } else setSelection(null);
        }
        return;
      }
      const current = useEditorStore.getState();
      if (tool === "polygon") {
        addDraftPoint(point);
        return;
      }
      if (tool === "place-building" && current.placementDefinitionId) {
        placeBuilding(current.placementDefinitionId, point);
        return;
      }
      if (tool === "place-asset" && current.placementAssetId) {
        placeAsset(current.placementAssetId, point);
        return;
      }
      engine.raycaster.setFromCamera(engine.pointer, engine.camera);
      const intersections = engine.raycaster.intersectObjects(engine.content.children, true);
      const entity = entityRoot(intersections[0]?.object ?? null);
      if (entity.type === "building" && entity.id)
        setSelection({ type: "building", id: entity.id });
      else if (entity.type === "asset" && entity.id) setSelection({ type: "asset", id: entity.id });
      else if (entity.type === "terrain" && entity.id)
        setSelection({ type: "terrain", id: entity.id });
      else setSelection(null);
    };

    const onWheel = (event: WheelEvent) => {
      if (mode !== "builder" || !event.ctrlKey || (tool !== "foundation" && !isWallTool(tool)))
        return;
      event.preventDefault();
      const state = useEditorStore.getState();
      const increment = state.project?.settings.angleIncrement ?? 5;
      const next = state.draft.axisAngle + (event.deltaY > 0 ? increment : -increment);
      const axisAngle = ((next % 180) + 180) % 180;
      const origin = isWallTool(state.tool) ? state.draft.wallStart : state.draft.points.at(-1);
      const rawHover = rawPointerRef.current ?? state.draft.hover;
      state.setDraft({
        axisAngle,
        ...(origin && rawHover
          ? { hover: lockToConstructionAxis(origin, rawHover, axisAngle) }
          : {}),
      });
    };

    host.addEventListener("pointermove", onPointerMove);
    host.addEventListener("pointerdown", onPointerDown);
    host.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      host.removeEventListener("pointermove", onPointerMove);
      host.removeEventListener("pointerdown", onPointerDown);
      host.removeEventListener("wheel", onWheel);
    };
  }, [
    mode,
    tool,
    project,
    draft,
    setDraft,
    addDraftPoint,
    addWallSegment,
    addOpening,
    addStair,
    placeAsset,
    placeBuilding,
    setSelection,
  ]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const state = useEditorStore.getState();
      const engine = engineRef.current;
      if (!engine) return;
      const modellingShortcut = !event.ctrlKey && !event.metaKey && !event.altKey;
      if (modellingShortcut && event.key.toLowerCase() === "f" && state.selection) {
        const object = engine.content.children.find(
          (child) => child.userData.entityId === state.selection?.id,
        );
        if (object) {
          const bounds = new THREE.Box3().setFromObject(object);
          const sphere = bounds.getBoundingSphere(new THREE.Sphere());
          engine.orbit.target.copy(sphere.center);
          engine.camera.position
            .copy(sphere.center)
            .add(
              new THREE.Vector3(1, -1, 0.8)
                .normalize()
                .multiplyScalar(Math.max(4, sphere.radius * 3)),
            );
        }
      }
      if (modellingShortcut && event.key.toLowerCase() === "g") state.setTransformMode("translate");
      if (modellingShortcut && event.key.toLowerCase() === "r") state.setTransformMode("rotate");
      if (modellingShortcut && event.key.toLowerCase() === "s" && state.selection?.type === "asset")
        state.setTransformMode("scale");
      if (
        event.key === "Escape" &&
        state.mode === "architecture" &&
        (state.tool === "place-building" || state.tool === "place-asset")
      ) {
        event.preventDefault();
        state.setTool("select");
        state.setStatus("Placement cancelled");
        return;
      }
      if (state.mode === "architecture" && state.tool === "polygon") {
        if (event.key === "Escape") {
          event.preventDefault();
          state.setTool("select");
          state.setStatus("Polygon face cancelled");
        } else if (event.key === "Backspace") {
          event.preventDefault();
          state.removeLastDraftPoint();
        } else if (event.key === "Enter" && state.draft.points.length >= 3) {
          event.preventDefault();
          state.finishPolygonFace();
        }
        return;
      }
      if (state.mode !== "builder" || (state.tool !== "foundation" && !isWallTool(state.tool)))
        return;
      const target = event.target;
      if (target instanceof HTMLInputElement && target !== inputRef.current) return;
      if (event.key === "Escape") {
        event.preventDefault();
        if (isWallTool(state.tool) && state.draft.wallStart) {
          state.setDraft({ wallStart: undefined, numericInput: "", hover: undefined });
          state.setStatus("Wall segment cancelled");
        } else {
          state.setDraft({ numericInput: "", hover: undefined });
          state.setStatus("Current segment cancelled");
        }
        return;
      }
      if (event.key === "Backspace") {
        if (state.draft.numericInput) {
          event.preventDefault();
          state.setDraft({ numericInput: state.draft.numericInput.slice(0, -1) });
        } else if (state.tool === "foundation" && state.draft.points.length > 0) {
          event.preventDefault();
          state.removeLastDraftPoint();
        } else if (isWallTool(state.tool) && state.draft.wallStart) {
          event.preventDefault();
          state.setDraft({ wallStart: undefined, hover: undefined });
        }
        return;
      }
      if (
        event.key === "Enter" &&
        state.tool === "foundation" &&
        state.draft.points.length >= 3 &&
        state.draft.points[0] &&
        state.draft.hover &&
        distance(state.draft.points[0], state.draft.hover) < 1
      ) {
        event.preventDefault();
        state.finishFoundation();
        return;
      }
      const hasOrigin = isWallTool(state.tool)
        ? state.draft.wallStart
        : state.draft.points.length > 0;
      if (!hasOrigin) return;
      if (/^[0-9.,]$/.test(event.key)) {
        event.preventDefault();
        const next = state.draft.numericInput + event.key.replace(",", ".");
        state.setDraft({ numericInput: next });
        inputRef.current?.focus();
        requestAnimationFrame(() => inputRef.current?.select());
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    const engine = engineRef.current;
    const host = hostRef.current;
    if (!engine || !host) return;
    let frame = 0;
    let previous = "";
    const update = () => {
      const state = useEditorStore.getState();
      const building = state.project?.buildingDefinitions.find(
        (item) => item.id === state.activeBuildingId,
      );
      const source = state.mode === "builder" ? (building?.footprint ?? state.draft.points) : [];
      const lines: DimensionLine[] = [];
      const rect = host.getBoundingClientRect();
      for (let index = 0; index < source.length; index += 1) {
        const start = source[index];
        const end = source[(index + 1) % source.length];
        if (!start || !end || (source === state.draft.points && index === source.length - 1))
          continue;
        lines.push(
          projectDimension(
            engine,
            rect,
            `${index}-${start.x}-${start.y}`,
            start,
            end,
            `${Math.round(distance(start, end))} mm`,
            18,
            building
              ? {
                  kind: "footprint-edge",
                  buildingId: building.id,
                  startIndex: index,
                  value: distance(start, end),
                }
              : undefined,
          ),
        );
      }
      if (state.mode === "builder" && building) {
        for (const opening of building.openings) {
          const wall = building.walls.find((item) => item.id === opening.wallId);
          if (!wall) continue;
          appendOpeningDimensions(
            lines,
            engine,
            rect,
            `opening-${opening.id}`,
            wall,
            opening.offset,
            opening.width,
            openingClearances(wall, building.openings, opening.offset, opening.width, opening.id),
            `${opening.kind === "carport" ? "Carport" : opening.kind === "door" ? "Door" : "Window"} ${Math.round(opening.width)} mm`,
            {
              kind: "opening-width",
              buildingId: building.id,
              openingId: opening.id,
              value: opening.width,
            },
          );
        }
        if (state.selection?.type === "wall") {
          const selectedWall = building.walls.find((item) => item.id === state.selection?.id);
          if (selectedWall && selectedWall.floorId === state.activeFloorId) {
            const wallLength = distance(selectedWall.start, selectedWall.end);
            lines.push(
              projectDimension(
                engine,
                rect,
                `wall-${selectedWall.id}`,
                selectedWall.start,
                selectedWall.end,
                `${Math.round(wallLength)} mm`,
                28,
                {
                  kind: "wall-length",
                  buildingId: building.id,
                  wallId: selectedWall.id,
                  value: wallLength,
                },
              ),
            );
          }
        }
        const hover = state.draft.hover;
        if (
          hover &&
          state.activeFloorId &&
          (state.tool === "door" || state.tool === "window" || state.tool === "carport")
        ) {
          const preview = calculateOpeningPlacement(
            building.walls,
            building.openings,
            state.activeFloorId,
            hover,
            state.tool === "carport" ? 3000 : state.tool === "door" ? 900 : 1200,
          );
          if (preview?.valid) {
            appendOpeningDimensions(
              lines,
              engine,
              rect,
              "opening-preview",
              preview.wall,
              preview.offset,
              preview.width,
              preview.clearances,
              `${state.tool === "carport" ? "Carport" : state.tool === "door" ? "Door" : "Window"} ${preview.width} mm`,
            );
          }
        }
      }
      const serialized = JSON.stringify(lines);
      if (serialized !== previous) {
        previous = serialized;
        setDimensions(lines);
      }
      const hover = state.draft.hover;
      if (hover && state.mode === "builder") {
        const projected = new THREE.Vector3(hover.x / 1000, hover.y / 1000, 0.05).project(
          engine.camera,
        );
        setInputPosition({
          x: ((projected.x + 1) / 2) * rect.width,
          y: ((1 - projected.y) / 2) * rect.height - 32,
          visible: state.draft.points.length > 0 || Boolean(state.draft.wallStart),
        });
      } else setInputPosition((value) => ({ ...value, visible: false }));
      frame = requestAnimationFrame(update);
    };
    update();
    return () => cancelAnimationFrame(frame);
  }, []);

  const commitNumeric = () => {
    const state = useEditorStore.getState();
    const length = Number.parseFloat(state.draft.numericInput);
    const origin = isWallTool(state.tool) ? state.draft.wallStart : state.draft.points.at(-1);
    const toward = state.draft.hover;
    if (!origin || !toward || !Number.isFinite(length) || length <= 0) return;
    const point = pointAtLength(origin, toward, length);
    if (state.tool === "foundation") state.addDraftPoint(point);
    else if (isWallTool(state.tool)) state.addWallSegment(origin, point);
    state.setDraft({ numericInput: "" });
  };

  const commitDimensionEdit = () => {
    const edit = dimensionEdit?.line.edit;
    const value = Number.parseFloat(dimensionEdit?.value ?? "");
    setDimensionEdit(null);
    if (!edit || !Number.isFinite(value) || value <= 0) return;
    if (edit.kind === "footprint-edge") {
      commit("Foundation dimension changed", (document) => {
        const building = document.buildingDefinitions.find((item) => item.id === edit.buildingId);
        const start = building?.footprint[edit.startIndex];
        const endIndex = building ? (edit.startIndex + 1) % building.footprint.length : -1;
        const end = building?.footprint[endIndex];
        if (!building || !start || !end) return;
        const currentLength = distance(start, end);
        if (currentLength <= 0) return;
        const previousEnd = { ...end };
        const scale = value / currentLength;
        const nextEnd = {
          x: Math.round(start.x + (end.x - start.x) * scale),
          y: Math.round(start.y + (end.y - start.y) * scale),
        };
        building.footprint[endIndex] = nextEnd;
        for (const wall of building.walls) {
          if (distance(wall.start, previousEnd) <= 1) wall.start = { ...nextEnd };
          if (distance(wall.end, previousEnd) <= 1) wall.end = { ...nextEnd };
        }
      });
    } else if (edit.kind === "wall-length") {
      commit("Wall length changed", (document) => {
        const building = document.buildingDefinitions.find((item) => item.id === edit.buildingId);
        const wall = building?.walls.find((item) => item.id === edit.wallId);
        if (!building || !wall) return;
        const currentLength = distance(wall.start, wall.end);
        if (currentLength <= 0) return;
        const scale = value / currentLength;
        wall.end = {
          x: Math.round(wall.start.x + (wall.end.x - wall.start.x) * scale),
          y: Math.round(wall.start.y + (wall.end.y - wall.start.y) * scale),
        };
        for (const opening of building.openings.filter((item) => item.wallId === wall.id)) {
          opening.offset = Math.min(opening.offset, Math.max(0, value - opening.width));
        }
      });
    } else {
      commit("Opening width changed", (document) => {
        const building = document.buildingDefinitions.find((item) => item.id === edit.buildingId);
        const opening = building?.openings.find((item) => item.id === edit.openingId);
        const wall = building?.walls.find((item) => item.id === opening?.wallId);
        if (!opening || !wall) return;
        opening.width = Math.max(
          100,
          Math.min(value, distance(wall.start, wall.end) - opening.offset),
        );
      });
    }
  };

  const lastDraftPoint = draft.points.at(-1);

  return (
    <div
      className="scene-host"
      data-axis-angle={draft.axisAngle}
      data-wall-element={
        tool === "external-wall" ? "outer" : tool === "internal-wall" ? "inner" : "none"
      }
      data-transform-mode={transformMode}
      data-view={mode === "builder" ? "top-locked" : "perspective"}
      ref={hostRef}
    >
      <svg
        className={`dimension-overlay${tool === "select" ? " editing-enabled" : ""}`}
        aria-label="Dimensions"
      >
        {dimensions.map((line) => {
          const dx = line.x2 - line.x1;
          const dy = line.y2 - line.y1;
          const length = Math.max(1, Math.hypot(dx, dy));
          const capX = (-dy / length) * 5;
          const capY = (dx / length) * 5;
          return (
            <g key={line.key}>
              <line x1={line.x1} y1={line.y1} x2={line.x2} y2={line.y2} />
              <line
                x1={line.x1 - capX}
                y1={line.y1 - capY}
                x2={line.x1 + capX}
                y2={line.y1 + capY}
              />
              <line
                x1={line.x2 - capX}
                y1={line.y2 - capY}
                x2={line.x2 + capX}
                y2={line.y2 + capY}
              />
              {line.edit ? (
                <a
                  aria-label={`Edit ${line.text}`}
                  href={`#dimension-${line.key}`}
                  onClick={(event) => event.preventDefault()}
                  onPointerDown={(event) => event.stopPropagation()}
                  onDoubleClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    setDimensionEdit({ line, value: String(Math.round(line.edit?.value ?? 0)) });
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      setDimensionEdit({ line, value: String(Math.round(line.edit?.value ?? 0)) });
                    }
                  }}
                >
                  <text
                    className="editable"
                    x={line.labelX}
                    y={line.labelY}
                    transform={`rotate(${line.angle} ${line.labelX} ${line.labelY})`}
                  >
                    {line.text}
                  </text>
                </a>
              ) : (
                <text
                  x={line.labelX}
                  y={line.labelY}
                  transform={`rotate(${line.angle} ${line.labelX} ${line.labelY})`}
                >
                  {line.text}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      {dimensionEdit && (
        <input
          ref={dimensionInputRef}
          className="dimension-edit-input"
          aria-label="Edit dimension in millimetres"
          style={{ left: dimensionEdit.line.labelX, top: dimensionEdit.line.labelY }}
          value={dimensionEdit.value}
          onChange={(event) => setDimensionEdit({ ...dimensionEdit, value: event.target.value })}
          onBlur={commitDimensionEdit}
          onFocus={(event) => event.currentTarget.select()}
          onPointerDown={(event) => event.stopPropagation()}
          onKeyDown={(event) => {
            event.stopPropagation();
            if (event.key === "Enter") {
              event.preventDefault();
              commitDimensionEdit();
            } else if (event.key === "Escape") {
              event.preventDefault();
              setDimensionEdit(null);
            }
          }}
        />
      )}
      {mode === "builder" && draft.hover && (tool === "foundation" || isWallTool(tool)) && (
        <div
          className="angle-offset-label"
          style={{
            left: inputPosition.x + (inputPosition.visible ? 62 : 14),
            top: inputPosition.y,
          }}
        >
          {draft.axisAngle}°
        </div>
      )}
      {inputPosition.visible && (
        <input
          ref={inputRef}
          className="direct-input"
          aria-label="Direct length in millimetres"
          style={{ left: inputPosition.x, top: inputPosition.y }}
          value={
            draft.numericInput ||
            (draft.hover && (isWallTool(tool) ? draft.wallStart : lastDraftPoint)
              ? Math.round(
                  distance(
                    isWallTool(tool)
                      ? (draft.wallStart ?? draft.hover)
                      : (lastDraftPoint ?? draft.hover),
                    draft.hover,
                  ),
                ).toString()
              : "")
          }
          onChange={(event) => setDraft({ numericInput: event.target.value })}
          onFocus={(event) => event.currentTarget.select()}
          onKeyDown={(event) => {
            event.stopPropagation();
            if (event.key === "Enter") {
              event.preventDefault();
              commitNumeric();
            }
            if (event.key === "Escape") setDraft({ numericInput: "" });
          }}
        />
      )}
    </div>
  );
}
