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
  const addRoof = useEditorStore((state) => state.addRoof);
  const save = useEditorStore((state) => state.save);
  const closeProject = useEditorStore((state) => state.closeProject);
  const undo = useEditorStore((state) => state.undo);
  const redo = useEditorStore((state) => state.redo);
  const commit = useEditorStore((state) => state.commit);
  const [terrainOpen, setTerrainOpen] = useState(false);

  const activeBuilding = project?.buildingDefinitions.find((item) => item.id === activeBuildingId);
  const displayedPoints = activeBuilding?.footprint ?? draft.points;

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!event.ctrlKey) return;
      if (event.key.toLowerCase() === "s") {
        event.preventDefault();
        void save(event.shiftKey);
      }
      if (event.key.toLowerCase() === "z") {
        event.preventDefault();
        undo();
      }
      if (event.key.toLowerCase() === "y") {
        event.preventDefault();
        redo();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [save, undo, redo]);

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
        <nav className="tool-rail">
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
                </>
              ) : (
                <>
                  <ToolButton tool="select" label="Select" />
                  <ToolButton tool="wall" label="Wall" hint="Click start + end" />
                  <ToolButton tool="door" label="Door" hint="900 × 2100" />
                  <ToolButton tool="window" label="Window" hint="1200 × 1200" />
                  <ToolButton tool="stair" label="Stair" hint="Straight flight" />
                  <button
                    className="tool-button"
                    disabled={Boolean(activeBuilding.roof)}
                    onClick={addRoof}
                  >
                    <span>R</span>
                    <div>
                      <strong>Gable roof</strong>
                      <small>Final floor</small>
                    </div>
                  </button>
                </>
              )}
              <div className="rail-note">
                Shift + wheel
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
              <div className="library-section">
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
        {mode === "builder" && (
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
