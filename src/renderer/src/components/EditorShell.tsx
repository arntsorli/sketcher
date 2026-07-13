import { useEffect, useState } from "react";
import { formatArea, polygonAreaMm2 } from "../../../shared/geometry";
import { type EditorTool, useEditorStore } from "../store";
import { SceneCanvas } from "../three/SceneCanvas";
import { exportSceneToGlb } from "../three/sceneBridge";
import { Inspector } from "./Inspector";
import { TerrainDialog } from "./TerrainDialog";

interface Props {
  onSettings(): void;
}

function ToolButton({ tool, label, hint }: { tool: EditorTool; label: string; hint?: string }) {
  const active = useEditorStore((state) => state.tool === tool);
  const setTool = useEditorStore((state) => state.setTool);
  return (
    <button className={`tool-button ${active ? "active" : ""}`} onClick={() => setTool(tool)}>
      <span>{label.slice(0, 1)}</span>
      <div>
        <strong>{label}</strong>
        {hint && <small>{hint}</small>}
      </div>
    </button>
  );
}

function ViewportToolbar({ onTerrain }: { onTerrain(): void }) {
  const project = useEditorStore((state) => state.project);
  const mode = useEditorStore((state) => state.mode);
  const tool = useEditorStore((state) => state.tool);
  const transformMode = useEditorStore((state) => state.transformMode);
  const clipping = useEditorStore((state) => state.clipping);
  const selection = useEditorStore((state) => state.selection);
  const clipboard = useEditorStore((state) => state.clipboard);
  const activeBuildingId = useEditorStore((state) => state.activeBuildingId);
  const draft = useEditorStore((state) => state.draft);
  const setTool = useEditorStore((state) => state.setTool);
  const setTransformMode = useEditorStore((state) => state.setTransformMode);
  const setClipping = useEditorStore((state) => state.setClipping);
  const startNewBuilding = useEditorStore((state) => state.startNewBuilding);
  const placeAsset = useEditorStore((state) => state.placeAsset);
  const importAsset = useEditorStore((state) => state.importAsset);
  const copySelection = useEditorStore((state) => state.copySelection);
  const pasteClipboard = useEditorStore((state) => state.pasteClipboard);
  const finishFoundation = useEditorStore((state) => state.finishFoundation);
  const removeLastFoundationPoint = useEditorStore((state) => state.removeLastFoundationPoint);
  const finishPolygonFace = useEditorStore((state) => state.finishPolygonFace);
  const removeLastPolygonPoint = useEditorStore((state) => state.removeLastPolygonPoint);
  const addRoof = useEditorStore((state) => state.addRoof);
  const [addOpen, setAddOpen] = useState(false);
  const [clipOpen, setClipOpen] = useState(false);
  const activeBuilding = project?.buildingDefinitions.find((item) => item.id === activeBuildingId);

  if (!project) return null;

  const action = (
    label: string,
    icon: string,
    onClick: () => void,
    options?: { active?: boolean; disabled?: boolean; title?: string },
  ) => (
    <button
      className={`viewport-tool-button ${options?.active ? "active" : ""}`}
      disabled={options?.disabled}
      onClick={onClick}
      title={options?.title ?? label}
      aria-label={label}
    >
      <span>{icon}</span>
      <small>{label}</small>
    </button>
  );

  return (
    <div className="viewport-toolbar-shell">
      {addOpen && mode === "architecture" && (
        <div className="viewport-tool-popover add-object-popover">
          <div className="viewport-popover-heading">
            <div>
              <strong>Add object</strong>
              <span>Choose an object, then click the scene to place it.</span>
            </div>
            <button onClick={() => setAddOpen(false)} aria-label="Close object palette">
              ×
            </button>
          </div>
          <div className="toolbar-asset-grid">
            {project.assetDefinitions.map((definition) => (
              <button
                key={definition.id}
                onClick={() => {
                  placeAsset(definition.id);
                  setAddOpen(false);
                }}
                aria-label={definition.name}
              >
                <span>{definition.source === "imported" ? "◇" : definition.name.slice(0, 1)}</span>
                <small>{definition.name}</small>
              </button>
            ))}
          </div>
          <button
            className="button secondary wide small"
            onClick={() => {
              void importAsset();
              setAddOpen(false);
            }}
          >
            Import GLB object
          </button>
        </div>
      )}

      {clipOpen && (
        <div className="viewport-tool-popover clipping-popover">
          <div className="viewport-popover-heading">
            <strong>Section plane</strong>
            <button onClick={() => setClipOpen(false)} aria-label="Close clipping controls">
              ×
            </button>
          </div>
          <div className="clipping-primary-row">
            <label className="clipping-toggle">
              <input
                type="checkbox"
                checked={clipping.enabled}
                onChange={(event) => setClipping({ enabled: event.target.checked })}
              />
              Enabled
            </label>
            <button
              className="button ghost small"
              onClick={() => setClipping({ inverted: !clipping.inverted, enabled: true })}
            >
              Flip
            </button>
            <button
              className="button ghost small"
              onClick={() =>
                setClipping({
                  enabled: false,
                  axis: "x",
                  offsetMm: 0,
                  inverted: false,
                  showHelper: true,
                })
              }
            >
              Reset
            </button>
          </div>
          <fieldset className="clipping-axis-switch">
            <legend>Handle axis</legend>
            {(["x", "y", "z"] as const).map((axis) => (
              <button
                type="button"
                className={clipping.axis === axis ? "active" : ""}
                key={axis}
                onClick={() => setClipping({ axis, enabled: true })}
              >
                {axis.toUpperCase()}
              </button>
            ))}
          </fieldset>
          <div className="clipping-readout">
            {clipping.axis.toUpperCase()} · {clipping.offsetMm} mm · drag the in-scene handle
          </div>
        </div>
      )}

      <div className="viewport-toolbar" role="toolbar" aria-label="3D modelling tools">
        {mode === "architecture" ? (
          <>
            {action("Select", "S", () => setTool("select"), { active: tool === "select" })}
            <span className="viewport-toolbar-divider" />
            {action("Move", "G", () => setTransformMode("translate"), {
              active: transformMode === "translate",
              disabled: !selection || selection.type === "terrain",
              title: "Move selected object (G)",
            })}
            {action("Rotate", "R", () => setTransformMode("rotate"), {
              active: transformMode === "rotate",
              disabled: !selection || selection.type === "terrain",
              title: "Rotate selected object (R)",
            })}
            {action("Scale", "S", () => setTransformMode("scale"), {
              active: transformMode === "scale",
              disabled: selection?.type !== "asset",
              title: "Scale selected object (S)",
            })}
            <span className="viewport-toolbar-divider" />
            {action("Polygon face", "P", () => setTool("polygon"), {
              active: tool === "polygon",
            })}
            {tool === "polygon" &&
              action("Create face", "✓", finishPolygonFace, {
                disabled: draft.points.length < 3,
              })}
            {tool === "polygon" &&
              action("Undo point", "↶", removeLastPolygonPoint, {
                disabled: draft.points.length === 0,
              })}
            {action("New building", "+B", startNewBuilding)}
            {action(
              "Add object",
              "+",
              () => {
                setAddOpen((value) => !value);
                setClipOpen(false);
              },
              { active: addOpen },
            )}
            {action("Add terrain layer", "M", onTerrain)}
            <span className="viewport-toolbar-divider" />
            {action("Copy object", "C", copySelection, {
              disabled: selection?.type !== "building" && selection?.type !== "asset",
              title: "Copy selected object (Ctrl+C)",
            })}
            {action("Paste object", "V", pasteClipboard, {
              disabled: !clipboard,
              title: "Paste copied object (Ctrl+V)",
            })}
          </>
        ) : (
          <>
            {!activeBuilding &&
              action("Foundation", "F", () => setTool("foundation"), {
                active: tool === "foundation",
              })}
            {!activeBuilding &&
              action("Close foundation", "✓", finishFoundation, {
                disabled: draft.points.length < 3,
              })}
            {!activeBuilding &&
              action("Undo last point", "↶", removeLastFoundationPoint, {
                disabled: draft.points.length === 0,
              })}
            {activeBuilding && (
              <>
                {action("Select", "S", () => setTool("select"), { active: tool === "select" })}
                {action("Wall", "W", () => setTool("wall"), { active: tool === "wall" })}
                {action("Door", "D", () => setTool("door"), { active: tool === "door" })}
                {action("Window", "O", () => setTool("window"), {
                  active: tool === "window",
                })}
                {action("Carport", "C", () => setTool("carport"), {
                  active: tool === "carport",
                })}
                {action("Stair", "T", () => setTool("stair"), { active: tool === "stair" })}
                {action("Add roof", "R", addRoof, {
                  disabled: Boolean(activeBuilding.roof),
                })}
                {tool === "wall" && (
                  <div className="toolbar-angle-status">
                    <span>Wall angle</span>
                    <strong>{draft.axisAngle}°</strong>
                    <small>Ctrl + wheel</small>
                  </div>
                )}
              </>
            )}
          </>
        )}
        <span className="viewport-toolbar-divider" />
        {action(
          "Clipping plane",
          "⌁",
          () => {
            setClipOpen((value) => !value);
            setAddOpen(false);
          },
          { active: clipOpen || clipping.enabled },
        )}
      </div>
    </div>
  );
}

export function EditorShell({ onSettings }: Props) {
  const project = useEditorStore((state) => state.project);
  const filePath = useEditorStore((state) => state.filePath);
  const mode = useEditorStore((state) => state.mode);
  const tool = useEditorStore((state) => state.tool);
  const activeBuildingId = useEditorStore((state) => state.activeBuildingId);
  const draft = useEditorStore((state) => state.draft);
  const dirty = useEditorStore((state) => state.dirty);
  const past = useEditorStore((state) => state.past);
  const future = useEditorStore((state) => state.future);
  const status = useEditorStore((state) => state.status);
  const error = useEditorStore((state) => state.error);
  const settings = useEditorStore((state) => state.settings);
  const assets = useEditorStore((state) => state.assets);
  const terrainAssets = useEditorStore((state) => state.terrainAssets);
  const setMode = useEditorStore((state) => state.setMode);
  const startNewBuilding = useEditorStore((state) => state.startNewBuilding);
  const editBuilding = useEditorStore((state) => state.editBuilding);
  const placeBuilding = useEditorStore((state) => state.placeBuilding);
  const placeAsset = useEditorStore((state) => state.placeAsset);
  const importAsset = useEditorStore((state) => state.importAsset);
  const finishFoundation = useEditorStore((state) => state.finishFoundation);
  const removeLastFoundationPoint = useEditorStore((state) => state.removeLastFoundationPoint);
  const finishPolygonFace = useEditorStore((state) => state.finishPolygonFace);
  const removeLastPolygonPoint = useEditorStore((state) => state.removeLastPolygonPoint);
  const addRoof = useEditorStore((state) => state.addRoof);
  const save = useEditorStore((state) => state.save);
  const closeProject = useEditorStore((state) => state.closeProject);
  const undo = useEditorStore((state) => state.undo);
  const redo = useEditorStore((state) => state.redo);
  const copySelection = useEditorStore((state) => state.copySelection);
  const pasteClipboard = useEditorStore((state) => state.pasteClipboard);
  const commit = useEditorStore((state) => state.commit);
  const [terrainOpen, setTerrainOpen] = useState(false);

  const activeBuilding = project?.buildingDefinitions.find((item) => item.id === activeBuildingId);
  const displayedPoints =
    tool === "polygon" ? draft.points : (activeBuilding?.footprint ?? draft.points);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!event.ctrlKey) return;
      const key = event.key.toLowerCase();
      const target = event.target;
      const editingText =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        (target instanceof HTMLElement && target.isContentEditable);
      if (key === "s") {
        event.preventDefault();
        void save(event.shiftKey);
      }
      if (key === "z" && !editingText) {
        event.preventDefault();
        undo();
      }
      if (key === "y" && !editingText) {
        event.preventDefault();
        redo();
      }
      if (key === "c" && !editingText) {
        event.preventDefault();
        copySelection();
      }
      if (key === "v" && !editingText) {
        event.preventDefault();
        pasteClipboard();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [save, undo, redo, copySelection, pasteClipboard]);

  useEffect(() => {
    if (!dirty || !filePath || !project || !settings) return;
    const timeout = window.setTimeout(() => {
      const canvas = document.querySelector<HTMLCanvasElement>(".scene-host canvas");
      const previewDataUrl = canvas?.toDataURL("image/webp", 0.7);
      void window.sketcher.projects.saveRecovery(filePath, {
        document: project,
        previewDataUrl,
        assets,
        terrainAssets,
      });
    }, settings.autosaveSeconds * 1000);
    return () => window.clearTimeout(timeout);
  }, [dirty, filePath, project, settings, assets, terrainAssets]);

  if (!project) return null;
  return (
    <div className="editor-shell">
      <header className="editor-topbar">
        <div className="topbar-group">
          <button
            className="brand-button"
            onClick={() => void closeProject()}
            aria-label="Back to home"
          >
            S
          </button>
          <input
            className="project-name-input"
            defaultValue={project.name}
            key={`${project.id}-${project.name}`}
            onBlur={(event) =>
              commit("Project renamed", (document) => {
                document.name = event.target.value.trim() || "Untitled";
              })
            }
          />
          {dirty && <span className="dirty-dot" title="Unsaved changes" />}
        </div>
        <div className="topbar-group history-buttons">
          <button
            className="icon-button"
            disabled={past.length === 0}
            onClick={undo}
            title="Undo · Ctrl+Z"
          >
            ↶
          </button>
          <button
            className="icon-button"
            disabled={future.length === 0}
            onClick={redo}
            title="Redo · Ctrl+Y"
          >
            ↷
          </button>
        </div>
        <fieldset className="mode-switch">
          <legend className="sr-only">Editor mode</legend>
          <button
            className={mode === "architecture" ? "active" : ""}
            onClick={() => setMode("architecture")}
          >
            Architecture
          </button>
          <button className={mode === "builder" ? "active" : ""} onClick={() => setMode("builder")}>
            Builder
          </button>
        </fieldset>
        <div className="topbar-group topbar-actions">
          <button
            className="button ghost small"
            onClick={() => void exportSceneToGlb(project.name)}
          >
            Export GLB
          </button>
          <button className="button ghost small" onClick={onSettings}>
            Settings
          </button>
          <button className="button primary small" onClick={() => void save()}>
            Save
          </button>
        </div>
      </header>

      <div className="editor-main">
        <nav className={`tool-rail ${mode === "builder" ? "builder-rail" : "architecture-rail"}`}>
          {mode === "builder" ? (
            <>
              <div className="rail-heading">
                <span>BUILD</span>
                <small>{activeBuilding ? activeBuilding.name : "New building"}</small>
              </div>
              {!activeBuilding ? (
                <>
                  <ToolButton tool="foundation" label="Foundation" hint="Closed polygon" />
                  <button
                    className="button primary wide small"
                    disabled={draft.points.length < 3}
                    onClick={finishFoundation}
                  >
                    Close foundation
                  </button>
                  <button
                    className="button secondary wide small"
                    disabled={draft.points.length === 0}
                    onClick={removeLastFoundationPoint}
                  >
                    Undo last point
                  </button>
                </>
              ) : (
                <>
                  <ToolButton tool="select" label="Select" />
                  <ToolButton tool="wall" label="Wall" hint="Click start + end" />
                  <ToolButton tool="door" label="Door" hint="900 × 2100" />
                  <ToolButton tool="window" label="Window" hint="1200 × 1200" />
                  <ToolButton tool="carport" label="Carport" hint="3000 mm garage opening" />
                  <ToolButton tool="stair" label="Stair" hint="Straight flight" />
                  <button
                    className="tool-button"
                    disabled={Boolean(activeBuilding.roof)}
                    onClick={addRoof}
                  >
                    <span>R</span>
                    <div>
                      <strong>Automatic roof</strong>
                      <small>30° pitched roof</small>
                    </div>
                  </button>
                </>
              )}
              <div className="rail-note">
                <strong>Locked top view</strong>
                <br />
                Ctrl + wheel
                <br />
                <strong>{draft.axisAngle}° axis offset</strong>
              </div>
            </>
          ) : (
            <>
              <div className="rail-heading">
                <span>SCENE</span>
                <small>Compose the site</small>
              </div>
              <ToolButton tool="select" label="Select" hint="G · R · S" />
              <ToolButton tool="polygon" label="Polygon face" hint="Click a closed outline" />
              {tool === "polygon" && (
                <>
                  <button
                    className="button primary wide small"
                    disabled={draft.points.length < 3}
                    onClick={finishPolygonFace}
                  >
                    Create face
                  </button>
                  <button
                    className="button secondary wide small"
                    disabled={draft.points.length === 0}
                    onClick={removeLastPolygonPoint}
                  >
                    Undo last point
                  </button>
                </>
              )}
              <button className="tool-button accent" onClick={startNewBuilding}>
                <span>+</span>
                <div>
                  <strong>New building</strong>
                  <small>Open Builder</small>
                </div>
              </button>
              <div className="library-section">
                <h3>Buildings</h3>
                {project.buildingDefinitions.map((definition) => (
                  <div className="library-item" key={definition.id}>
                    <button onClick={() => placeBuilding(definition.id)}>
                      <span>⌂</span>
                      <strong>{definition.name}</strong>
                    </button>
                    <button className="mini-action" onClick={() => editBuilding(definition.id)}>
                      Edit
                    </button>
                  </div>
                ))}
                {project.buildingDefinitions.length === 0 && <p>Build a definition first.</p>}
              </div>
              <div className="library-section object-library">
                <div className="library-title">
                  <h3>Objects</h3>
                  <button onClick={() => void importAsset()}>Import</button>
                </div>
                <div className="asset-grid">
                  {project.assetDefinitions.map((definition) => (
                    <button
                      key={definition.id}
                      onClick={() => placeAsset(definition.id)}
                      title={`Place ${definition.name}`}
                    >
                      <span>
                        {definition.source === "imported" ? "◇" : definition.name.slice(0, 1)}
                      </span>
                      <small>{definition.name}</small>
                    </button>
                  ))}
                </div>
              </div>
              <div className="library-section terrain-actions">
                <h3>Terrain</h3>
                <button
                  className="button secondary wide small"
                  onClick={() => setTerrainOpen(true)}
                >
                  + Add terrain layer
                </button>
              </div>
            </>
          )}
        </nav>
        <main className="viewport-panel">
          <SceneCanvas />
          <ViewportToolbar onTerrain={() => setTerrainOpen(true)} />
          <div className="view-cube" aria-hidden="true">
            <span>Z</span>
            <b>TOP</b>
          </div>
          {mode === "builder" && !activeBuilding && draft.points.length === 0 && (
            <div className="canvas-onboarding">
              <span>01</span>
              <h2>Draw the foundation</h2>
              <p>Click anywhere on the grid to place the first corner.</p>
            </div>
          )}
        </main>
        <Inspector />
      </div>

      <footer className="status-bar">
        <span>{status}</span>
        {(mode === "builder" || tool === "polygon") && (
          <>
            <span>{tool}</span>
            <span>{displayedPoints.length} points</span>
            <span>{formatArea(polygonAreaMm2(displayedPoints), settings?.areaFormat ?? "m2")}</span>
            <span>Units: mm</span>
          </>
        )}
        {filePath && <span className="status-path">{filePath}</span>}
      </footer>
      {error && (
        <div className="error-toast">
          <strong>Couldn’t complete that action</strong>
          <span>{error}</span>
        </div>
      )}
      <TerrainDialog open={terrainOpen} onOpenChange={setTerrainOpen} />
    </div>
  );
}
