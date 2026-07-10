import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { TransformControls } from "three/addons/controls/TransformControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { OutlinePass } from "three/addons/postprocessing/OutlinePass.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import {
  distance,
  lockToConstructionAxis,
  pointAtLength,
  snapToGrid,
} from "../../../shared/geometry";
import type { Vec2 } from "../../../shared/model";
import { useEditorStore } from "../store";
import { buildWallSolid } from "../workers/geometryClient";
import type { WallSolidRequest } from "../workers/geometryTypes";
import { setExportRoot } from "./sceneBridge";
import { createProjectContent } from "./sceneGeometry";

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

export function SceneCanvas() {
  const hostRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const engineRef = useRef<{
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    renderer: THREE.WebGLRenderer;
    composer: EffectComposer;
    outline: OutlinePass;
    orbit: OrbitControls;
    transform: TransformControls;
    content: THREE.Group;
    draft: THREE.Group;
    raycaster: THREE.Raycaster;
    pointer: THREE.Vector2;
  } | null>(null);
  const [dimensions, setDimensions] = useState<DimensionLine[]>([]);
  const [inputPosition, setInputPosition] = useState({ x: 0, y: 0, visible: false });

  const project = useEditorStore((state) => state.project);
  const mode = useEditorStore((state) => state.mode);
  const tool = useEditorStore((state) => state.tool);
  const selection = useEditorStore((state) => state.selection);
  const activeBuildingId = useEditorStore((state) => state.activeBuildingId);
  const draft = useEditorStore((state) => state.draft);
  const setDraft = useEditorStore((state) => state.setDraft);
  const addFoundationPoint = useEditorStore((state) => state.addFoundationPoint);
  const addWallSegment = useEditorStore((state) => state.addWallSegment);
  const addOpening = useEditorStore((state) => state.addOpening);
  const addStair = useEditorStore((state) => state.addStair);
  const setSelection = useEditorStore((state) => state.setSelection);
  const commit = useEditorStore((state) => state.commit);
  const assets = useEditorStore((state) => state.assets);
  const terrainAssets = useEditorStore((state) => state.terrainAssets);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x11161c);
    scene.fog = new THREE.FogExp2(0x11161c, 0.012);
    const camera = new THREE.PerspectiveCamera(
      45,
      host.clientWidth / host.clientHeight,
      0.01,
      5000,
    );
    camera.up.set(0, 0, 1);
    camera.position.set(14, -16, 12);

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

    const orbit = new OrbitControls(camera, renderer.domElement);
    orbit.target.set(2, 2, 0);
    orbit.enableDamping = true;
    orbit.dampingFactor = 0.08;
    orbit.maxPolarAngle = Math.PI * 0.49;
    orbit.update();

    const grid = new THREE.GridHelper(200, 200, 0x69798a, 0x27313b);
    grid.rotation.x = Math.PI / 2;
    grid.position.z = -0.001;
    (grid.material as THREE.Material).opacity = 0.55;
    (grid.material as THREE.Material).transparent = true;
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
    composer.addPass(new RenderPass(scene, camera));
    const outline = new OutlinePass(
      new THREE.Vector2(host.clientWidth, host.clientHeight),
      scene,
      camera,
    );
    outline.edgeStrength = 4;
    outline.edgeThickness = 1.5;
    outline.visibleEdgeColor.set(0x45b8ff);
    outline.hiddenEdgeColor.set(0x2b78c5);
    composer.addPass(outline);

    const transform = new TransformControls(camera, renderer.domElement);
    transform.setSize(0.8);
    transform.setRotationSnap((5 * Math.PI) / 180);
    scene.add(transform.getHelper());
    transform.addEventListener("dragging-changed", (event) => {
      orbit.enabled = !(event as THREE.Event & { value: boolean }).value;
    });

    const engine = {
      scene,
      camera,
      renderer,
      composer,
      outline,
      orbit,
      transform,
      content,
      draft: draftGroup,
      raycaster: new THREE.Raycaster(),
      pointer: new THREE.Vector2(),
    };
    engineRef.current = engine;

    const resizeObserver = new ResizeObserver(() => {
      if (!host.clientWidth || !host.clientHeight) return;
      camera.aspect = host.clientWidth / host.clientHeight;
      camera.updateProjectionMatrix();
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
    if (!engine || !project) return;
    let cancelled = false;
    const controller = new AbortController();
    disposeGeometry(engine.content);
    engine.content.clear();
    const next = createProjectContent(
      project,
      mode === "builder" ? activeBuildingId : undefined,
      terrainAssets,
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
  }, [project, mode, activeBuildingId, assets, terrainAssets]);

  useEffect(() => {
    const engine = engineRef.current;
    if (!engine) return;
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
  }, [selection, mode, commit]);

  useEffect(() => {
    const engine = engineRef.current;
    if (!engine) return;
    disposeGeometry(engine.draft);
    engine.draft.clear();
    const points = [...draft.points];
    if (draft.wallStart) points.push(draft.wallStart);
    if (draft.hover && (draft.points.length > 0 || draft.wallStart)) points.push(draft.hover);
    if (points.length > 0) {
      const geometry = new THREE.BufferGeometry().setFromPoints(
        points.map((point) => new THREE.Vector3(point.x / 1000, point.y / 1000, 0.015)),
      );
      const line = new THREE.Line(
        geometry,
        new THREE.LineBasicMaterial({ color: 0x50c4ff, depthTest: false }),
      );
      line.renderOrder = 999;
      engine.draft.add(line);
      for (const point of points) {
        const marker = new THREE.Mesh(
          new THREE.SphereGeometry(0.06, 12, 8),
          new THREE.MeshBasicMaterial({ color: 0x9bddff, depthTest: false }),
        );
        marker.position.set(point.x / 1000, point.y / 1000, 0.02);
        marker.renderOrder = 1000;
        engine.draft.add(marker);
      }
    }
  }, [draft]);

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
      let point = snapToGrid(
        { x: hit.x * 1000, y: hit.y * 1000 },
        project?.settings.gridSpacing ?? 100,
      );
      const current = useEditorStore.getState();
      const origin =
        current.tool === "wall" ? current.draft.wallStart : current.draft.points.at(-1);
      if (current.mode === "builder" && origin) {
        point = lockToConstructionAxis(origin, point, current.draft.axisAngle);
      }
      const first = current.draft.points[0];
      if (current.tool === "foundation" && first && distance(first, point) <= 250) point = first;
      return point;
    };

    const onPointerMove = (event: PointerEvent) => {
      if (engine.transform.dragging) return;
      const point = pointerPoint(event);
      if (
        point &&
        mode === "builder" &&
        ["foundation", "wall", "door", "window", "stair"].includes(tool)
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
        } else if (tool === "door" || tool === "window") addOpening(tool, point);
        else if (tool === "stair") addStair(point);
        else if (tool === "select") {
          engine.raycaster.setFromCamera(engine.pointer, engine.camera);
          const intersections = engine.raycaster.intersectObjects(engine.content.children, true);
          const entity = entityRoot(intersections[0]?.object ?? null);
          if (entity.type === "wall" && entity.id) setSelection({ type: "wall", id: entity.id });
          else setSelection(null);
        }
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
    addWallSegment,
    addOpening,
    addStair,
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
      if (state.mode !== "builder" || !["foundation", "wall"].includes(state.tool)) return;
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
      if (event.key === "Escape") {
        state.setDraft({ points: [], wallStart: undefined, numericInput: "", hover: undefined });
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
        const a = new THREE.Vector3(start.x / 1000, start.y / 1000, 0.03).project(engine.camera);
        const b = new THREE.Vector3(end.x / 1000, end.y / 1000, 0.03).project(engine.camera);
        const x1 = ((a.x + 1) / 2) * rect.width;
        const y1 = ((1 - a.y) / 2) * rect.height;
        const x2 = ((b.x + 1) / 2) * rect.width;
        const y2 = ((1 - b.y) / 2) * rect.height;
        const dx = x2 - x1;
        const dy = y2 - y1;
        const screenLength = Math.max(1, Math.hypot(dx, dy));
        const offsetX = (-dy / screenLength) * 18;
        const offsetY = (dx / screenLength) * 18;
        lines.push({
          key: `${index}-${start.x}-${start.y}`,
          x1: x1 + offsetX,
          y1: y1 + offsetY,
          x2: x2 + offsetX,
          y2: y2 + offsetY,
          labelX: (x1 + x2) / 2 + offsetX,
          labelY: (y1 + y2) / 2 + offsetY,
          angle: (Math.atan2(dy, dx) * 180) / Math.PI,
          text: `${Math.round(distance(start, end))} mm`,
        });
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
    <div className="scene-host" ref={hostRef}>
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
            if (event.key === "Enter") commitNumeric();
            if (event.key === "Escape") setDraft({ numericInput: "" });
          }}
        />
      )}
    </div>
  );
}
