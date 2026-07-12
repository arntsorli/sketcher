import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { TransformControls } from "three/addons/controls/TransformControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { OutlinePass } from "three/addons/postprocessing/OutlinePass.js";
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
import type { ProjectDocument, Vec2, Wall } from "../../../shared/model";
import { useEditorStore } from "../store";
import { buildWallSolid } from "../workers/geometryClient";
import type { WallSolidRequest } from "../workers/geometryTypes";
import { setExportRoot } from "./sceneBridge";
import { createBuildingGroup, createBuiltinAsset, createProjectContent } from "./sceneGeometry";

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

const DEFAULT_CANVAS_BACKGROUND = "#dfe7ee";

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
  content: THREE.Group;
  draft: THREE.Group;
  raycaster: THREE.Raycaster;
  pointer: THREE.Vector2;
};

function applyCanvasAppearance(engine: SceneEngine, backgroundColor: string): void {
  const background = new THREE.Color(backgroundColor);
  engine.scene.background = background;
  if (engine.scene.fog) engine.scene.fog.color.copy(background);
  engine.renderer.setClearColor(background);
  const luminance = background.r * 0.2126 + background.g * 0.7152 + background.b * 0.0722;
  const isLight = luminance > 0.45;
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
  lines.push(projectDimension(engine, rect, `${key}-opening`, start, end, label, 56));
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
  const engineRef = useRef<SceneEngine | null>(null);
  const [dimensions, setDimensions] = useState<DimensionLine[]>([]);
  const [inputPosition, setInputPosition] = useState({ x: 0, y: 0, visible: false });

  const project = useEditorStore((state) => state.project);
  const mode = useEditorStore((state) => state.mode);
  const tool = useEditorStore((state) => state.tool);
  const selection = useEditorStore((state) => state.selection);
  const activeBuildingId = useEditorStore((state) => state.activeBuildingId);
  const activeFloorId = useEditorStore((state) => state.activeFloorId);
  const placementDefinitionId = useEditorStore((state) => state.placementDefinitionId);
  const placementAssetId = useEditorStore((state) => state.placementAssetId);
  const draft = useEditorStore((state) => state.draft);
  const setDraft = useEditorStore((state) => state.setDraft);
  const addFoundationPoint = useEditorStore((state) => state.addFoundationPoint);
  const addPolygonPoint = useEditorStore((state) => state.addPolygonPoint);
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
    host.appendChild(renderer.domElement);

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
      material.opacity = 0.55;
      material.transparent = true;
    });
    scene.add(grid);

    const hemisphere = new THREE.HemisphereLight(0xdce7f2, 0x273039, 2.2);
    const sun = new THREE.DirectionalLight(0xffffff, 2.3);
    sun.position.set(-18, -14, 28);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
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
    outline.edgeStrength = 4;
    outline.edgeThickness = 1.5;
    outline.visibleEdgeColor.set(0x45b8ff);
    outline.hiddenEdgeColor.set(0x2b78c5);
    composer.addPass(outline);

    const transform = new TransformControls(architectureCamera, renderer.domElement);
    transform.setSize(0.8);
    transform.setRotationSnap((5 * Math.PI) / 180);
    scene.add(transform.getHelper());
    transform.addEventListener("dragging-changed", (event) => {
      orbit.enabled = !(event as THREE.Event & { value: boolean }).value;
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
      content,
      draft: draftGroup,
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
      orbit.dispose();
      composer.dispose();
      renderer.dispose();
      host.removeChild(renderer.domElement);
      engineRef.current = null;
    };
  }, []);

  useEffect(() => {
    const engine = engineRef.current;
    if (!engine) return;
    applyCanvasAppearance(engine, settings?.backgroundColor ?? DEFAULT_CANVAS_BACKGROUND);
  }, [settings?.backgroundColor]);

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
    } else {
      engine.camera = engine.architectureCamera;
      engine.orbit.object = engine.architectureCamera;
      engine.orbit.enableRotate = true;
      engine.orbit.maxPolarAngle = Math.PI * 0.49;
      const gridMaterials = Array.isArray(engine.grid.material)
        ? engine.grid.material
        : [engine.grid.material];
      gridMaterials.forEach((material) => {
        material.opacity = 0.55;
      });
    }
    engine.renderPass.camera = engine.camera;
    engine.outline.renderCamera = engine.camera;
    engine.transform.camera = engine.camera;
    engine.orbit.update();
  }, [mode, activeBuildingId]);

  useEffect(() => {
    const engine = engineRef.current;
    if (!engine || !project) return;
    let cancelled = false;
    const controller = new AbortController();
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

    engine.content.traverse((object) => {
      const request = object.userData.manifoldRequest as WallSolidRequest | undefined;
      if (!(object instanceof THREE.Group) || !request) return;
      void buildWallSolid(request, controller.signal)
        .then((result) => {
          if (cancelled || !object.parent) return;
          for (let index = 0; index < result.positions.length; index += 1) {
            result.positions[index] = (result.positions[index] ?? 0) / 1000;
          }
          const geometry = new THREE.BufferGeometry();
          geometry.setAttribute("position", new THREE.BufferAttribute(result.positions, 3));
          geometry.setIndex(new THREE.BufferAttribute(result.indices, 1));
          geometry.computeVertexNormals();
          disposeGeometry(object);
          object.clear();
          const mesh = new THREE.Mesh(
            geometry,
            new THREE.MeshStandardMaterial({
              color: object.userData.wallType === "external" ? 0xd9d5cc : 0xc7c3ba,
              roughness: 0.78,
              metalness: 0.03,
            }),
          );
          mesh.castShadow = true;
          mesh.receiveShadow = true;
          mesh.userData.manifoldVolumeMm3 = result.volume;
          object.add(mesh);
          hostRef.current?.setAttribute("data-geometry-worker", "ready");
        })
        .catch((error) => {
          if (error instanceof DOMException && error.name === "AbortError") return;
          hostRef.current?.setAttribute("data-geometry-worker", "fallback");
          console.warn("Manifold wall generation failed; keeping fallback geometry.", error);
        });
    });

    if (mode === "architecture") {
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
            if (cancelled) return;
            const group = gltf.scene;
            group.position.set(
              instance.transform.position.x / 1000,
              instance.transform.position.y / 1000,
              instance.transform.position.z / 1000,
            );
            group.rotation.z = instance.transform.rotationZ;
            group.scale.setScalar(instance.transform.scale);
            group.userData = { entityType: "asset", entityId: instance.id };
            group.traverse((child) => {
              child.userData.rootEntityType = "asset";
              child.userData.rootEntityId = instance.id;
            });
            engine.content.add(group);
          },
          (error) => console.error("Unable to load imported GLB", error),
        );
      }
    }
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [project, mode, activeBuildingId, activeFloorId, assets, terrainAssets]);

  useEffect(() => {
    const engine = engineRef.current;
    if (!engine || !project) return;
    engine.transform.detach();
    engine.outline.selectedObjects = [];
    if (!selection) return;
    const object = engine.content.children.find(
      (child) =>
        child.userData.entityType === selection.type && child.userData.entityId === selection.id,
    );
    if (!object) return;
    engine.outline.selectedObjects = [object];
    if (mode === "architecture" && (selection.type === "building" || selection.type === "asset")) {
      engine.transform.attach(object);
      const onMouseUp = () => {
        const current = useEditorStore.getState();
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
        current.setStatus("Transform committed");
      };
      engine.transform.addEventListener("mouseUp", onMouseUp);
      return () => engine.transform.removeEventListener("mouseUp", onMouseUp);
    }
  }, [selection, mode, project, commit]);

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
            color: 0x179bd1,
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
        new THREE.LineBasicMaterial({ color: 0x007db8, depthTest: false }),
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
            color: isClosureTarget ? 0x37e0a5 : 0x9bddff,
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
          color: openingPreview.valid ? 0x36c7a1 : 0xe26d71,
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
          color: openingPreview.valid ? 0x20d5ac : 0xff6d72,
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
          color: openingPreview.valid ? 0x1ba990 : 0xd25c60,
          depthTest: false,
        }),
      );
      guideLine.renderOrder = 999;
      engine.draft.add(guideLine);
    }
  }, [draft, mode, openingPreview, placementAssetId, placementDefinitionId, project, tool]);

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
      if (aggressiveSnap) return aggressiveSnap;
      const origin =
        current.tool === "wall" ? current.draft.wallStart : current.draft.points.at(-1);
      if (current.mode === "builder" && origin) {
        return lockToConstructionAxis(origin, rawPoint, current.draft.axisAngle);
      }
      return snapToGrid(rawPoint, project?.settings.gridSpacing ?? 100);
    };

    const onPointerMove = (event: PointerEvent) => {
      if (engine.transform.dragging) return;
      const point = pointerPoint(event);
      if (
        point &&
        ((mode === "builder" &&
          ["foundation", "wall", "door", "window", "carport", "stair"].includes(tool)) ||
          (mode === "architecture" && ["place-building", "place-asset", "polygon"].includes(tool)))
      ) {
        setDraft({ hover: point });
      }
    };

    const onPointerDown = (event: PointerEvent) => {
      if (event.button !== 0 || engine.transform.dragging) return;
      const point = pointerPoint(event);
      if (!point) return;
      if (mode === "builder") {
        if (tool === "foundation") addFoundationPoint(point);
        else if (tool === "wall") {
          if (draft.wallStart) addWallSegment(draft.wallStart, point);
          else setDraft({ wallStart: point });
        } else if (tool === "door" || tool === "window" || tool === "carport") {
          addOpening(tool, point);
        } else if (tool === "stair") addStair(point);
        else if (tool === "select") {
          engine.raycaster.setFromCamera(engine.pointer, engine.camera);
          const intersections = engine.raycaster.intersectObjects(engine.content.children, true);
          const entity = entityRoot(intersections[0]?.object ?? null);
          if (entity.type === "wall" && entity.id) setSelection({ type: "wall", id: entity.id });
          else setSelection(null);
        }
        return;
      }
      const current = useEditorStore.getState();
      if (tool === "polygon") {
        addPolygonPoint(point);
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
      if (mode !== "builder" || !event.shiftKey || !["foundation", "wall"].includes(tool)) return;
      event.preventDefault();
      const increment = project?.settings.angleIncrement ?? 5;
      setDraft({ axisAngle: draft.axisAngle + (event.deltaY > 0 ? increment : -increment) });
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
    addFoundationPoint,
    addPolygonPoint,
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
      if (event.key.toLowerCase() === "f" && state.selection) {
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
      if (event.key.toLowerCase() === "g") engine.transform.setMode("translate");
      if (event.key.toLowerCase() === "r") engine.transform.setMode("rotate");
      if (event.key.toLowerCase() === "s" && state.selection?.type === "asset")
        engine.transform.setMode("scale");
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
          state.removeLastPolygonPoint();
        } else if (event.key === "Enter" && state.draft.points.length >= 3) {
          event.preventDefault();
          state.finishPolygonFace();
        }
        return;
      }
      if (state.mode !== "builder" || !["foundation", "wall"].includes(state.tool)) return;
      const target = event.target;
      if (target instanceof HTMLInputElement && target !== inputRef.current) return;
      if (event.key === "Escape") {
        event.preventDefault();
        if (state.tool === "wall" && state.draft.wallStart) {
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
          state.removeLastFoundationPoint();
        } else if (state.tool === "wall" && state.draft.wallStart) {
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
      const hasOrigin =
        state.tool === "wall" ? state.draft.wallStart : state.draft.points.length > 0;
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
          );
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
    const origin = state.tool === "wall" ? state.draft.wallStart : state.draft.points.at(-1);
    const toward = state.draft.hover;
    if (!origin || !toward || !Number.isFinite(length) || length <= 0) return;
    const point = pointAtLength(origin, toward, length);
    if (state.tool === "foundation") state.addFoundationPoint(point);
    else if (state.tool === "wall") state.addWallSegment(origin, point);
    state.setDraft({ numericInput: "" });
  };

  const lastDraftPoint = draft.points.at(-1);

  return (
    <div
      className="scene-host"
      data-view={mode === "builder" ? "top-locked" : "perspective"}
      ref={hostRef}
    >
      <svg className="dimension-overlay" aria-hidden="true">
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
              <text
                x={line.labelX}
                y={line.labelY}
                transform={`rotate(${line.angle} ${line.labelX} ${line.labelY})`}
              >
                {line.text}
              </text>
            </g>
          );
        })}
      </svg>
      {inputPosition.visible && (
        <input
          ref={inputRef}
          className="direct-input"
          aria-label="Direct length in millimetres"
          style={{ left: inputPosition.x, top: inputPosition.y }}
          value={
            draft.numericInput ||
            (draft.hover && lastDraftPoint
              ? Math.round(distance(lastDraftPoint, draft.hover)).toString()
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
