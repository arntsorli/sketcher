import { formatArea, polygonAreaMm2, polygonPerimeterMm } from "../../../shared/geometry";
import type { BuildingDefinition, ProjectDocument } from "../../../shared/model";
import { useEditorStore } from "../store";

function numberOnBlur(value: string, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function BuilderInspector({
  project,
  building,
}: {
  project: ProjectDocument;
  building?: BuildingDefinition;
}) {
  const activeFloorId = useEditorStore((state) => state.activeFloorId);
  const selection = useEditorStore((state) => state.selection);
  const settings = useEditorStore((state) => state.settings);
  const commit = useEditorStore((state) => state.commit);
  const setSelection = useEditorStore((state) => state.setSelection);
  const setActiveFloor = useEditorStore((state) => state.setActiveFloor);
  const addFloor = useEditorStore((state) => state.addFloor);
  const addRoof = useEditorStore((state) => state.addRoof);
  if (!building) {
    return (
      <aside className="inspector">
        <div className="panel-heading">
          <span className="eyebrow">Builder</span>
          <h2>Foundation</h2>
        </div>
        <div className="instruction-card">
          <span>01</span>
          <div>
            <strong>Draw a closed outline</strong>
            <p>
              Click to add corners. Type a length in mm and press Enter. Shift+wheel rotates axes
              5°.
            </p>
          </div>
        </div>
      </aside>
    );
  }
  const floor = building.floors.find((item) => item.id === activeFloorId) ?? building.floors[0];
  const wall =
    selection?.type === "wall"
      ? building.walls.find((item) => item.id === selection.id)
      : undefined;
  const selectedOpening =
    selection?.type === "opening"
      ? building.openings.find((item) => item.id === selection.id)
      : undefined;
  const areaFormat = settings?.areaFormat ?? project.settings.areaFormat;

  return (
    <aside className="inspector">
      <div className="panel-heading">
        <span className="eyebrow">Building definition</span>
        <input
          className="title-input"
          defaultValue={building.name}
          key={building.id + building.name}
          onBlur={(event) =>
            commit("Building renamed", (document) => {
              const target = document.buildingDefinitions.find((item) => item.id === building.id);
              if (target) target.name = event.target.value.trim() || building.name;
            })
          }
        />
        <div className="metric-row">
          <span>{formatArea(polygonAreaMm2(building.footprint), areaFormat)}</span>
          <span>
            {Math.round(polygonPerimeterMm(building.footprint)).toLocaleString()} mm perimeter
          </span>
        </div>
      </div>

      <details open className="panel-section">
        <summary>Building properties</summary>
        <div className="field-row">
          <label>
            External wall
            <input
              type="number"
              defaultValue={building.defaults.externalWallThickness}
              onBlur={(event) =>
                commit("External wall default changed", (document) => {
                  const target = document.buildingDefinitions.find(
                    (item) => item.id === building.id,
                  );
                  if (target)
                    target.defaults.externalWallThickness = numberOnBlur(
                      event.target.value,
                      building.defaults.externalWallThickness,
                    );
                })
              }
            />
          </label>
          <label>
            Internal wall
            <input
              type="number"
              defaultValue={building.defaults.internalWallThickness}
              onBlur={(event) =>
                commit("Internal wall default changed", (document) => {
                  const target = document.buildingDefinitions.find(
                    (item) => item.id === building.id,
                  );
                  if (target)
                    target.defaults.internalWallThickness = numberOnBlur(
                      event.target.value,
                      building.defaults.internalWallThickness,
                    );
                })
              }
            />
          </label>
        </div>
        <div className="field-row">
          <label>
            Default floor height
            <input
              type="number"
              defaultValue={building.defaults.floorHeight}
              onBlur={(event) =>
                commit("Floor-height default changed", (document) => {
                  const target = document.buildingDefinitions.find(
                    (item) => item.id === building.id,
                  );
                  if (target)
                    target.defaults.floorHeight = numberOnBlur(
                      event.target.value,
                      building.defaults.floorHeight,
                    );
                })
              }
            />
          </label>
          <label>
            Default slab
            <input
              type="number"
              defaultValue={building.defaults.slabThickness}
              onBlur={(event) =>
                commit("Slab default changed", (document) => {
                  const target = document.buildingDefinitions.find(
                    (item) => item.id === building.id,
                  );
                  if (target)
                    target.defaults.slabThickness = numberOnBlur(
                      event.target.value,
                      building.defaults.slabThickness,
                    );
                })
              }
            />
          </label>
        </div>
      </details>

      <details open className="panel-section">
        <summary>Floors</summary>
        <div className="scene-list compact">
          {building.floors.map((item, index) => (
            <button
              className={item.id === floor?.id ? "active" : ""}
              key={item.id}
              onClick={() => setActiveFloor(item.id)}
            >
              <span>{item.type === "roof" ? "⌂" : String(index + 1).padStart(2, "0")}</span>
              <div>
                <strong>{item.name}</strong>
                <small>{item.elevation.toLocaleString()} mm elevation</small>
              </div>
            </button>
          ))}
        </div>
        {floor && floor.type === "story" && (
          <div className="field-row inset-fields">
            <label>
              Height
              <input
                type="number"
                defaultValue={floor.height}
                key={`${floor.id}-height-${floor.height}`}
                onBlur={(event) =>
                  commit("Floor height changed", (document) => {
                    const targetBuilding = document.buildingDefinitions.find(
                      (item) => item.id === building.id,
                    );
                    const target = targetBuilding?.floors.find((item) => item.id === floor.id);
                    if (!target || !targetBuilding) return;
                    target.height = numberOnBlur(event.target.value, floor.height);
                    let elevation = 0;
                    for (const entry of targetBuilding.floors.filter(
                      (item) => item.type === "story",
                    )) {
                      entry.elevation = elevation;
                      elevation += entry.height;
                    }
                    const roofFloor = targetBuilding.floors.find((item) => item.type === "roof");
                    if (roofFloor) roofFloor.elevation = elevation;
                  })
                }
              />
            </label>
            <label>
              Slab
              <input
                type="number"
                defaultValue={floor.slabThickness}
                key={`${floor.id}-slab-${floor.slabThickness}`}
                onBlur={(event) =>
                  commit("Slab thickness changed", (document) => {
                    const target = document.buildingDefinitions
                      .find((item) => item.id === building.id)
                      ?.floors.find((item) => item.id === floor.id);
                    if (target)
                      target.slabThickness = numberOnBlur(event.target.value, floor.slabThickness);
                  })
                }
              />
            </label>
          </div>
        )}
        {floor &&
          floor.type === "story" &&
          building.floors.filter((item) => item.type === "story").length > 1 && (
            <div className="button-row wrap">
              <button
                className="button ghost small"
                onClick={() =>
                  commit("Floor moved down", (document) => {
                    const target = document.buildingDefinitions.find(
                      (item) => item.id === building.id,
                    );
                    if (!target) return;
                    const stories = target.floors.filter((item) => item.type === "story");
                    const index = stories.findIndex((item) => item.id === floor.id);
                    if (index <= 0) return;
                    const previous = stories[index - 1];
                    const current = stories[index];
                    if (!previous || !current) return;
                    stories[index - 1] = current;
                    stories[index] = previous;
                    const roofFloor = target.floors.find((item) => item.type === "roof");
                    target.floors = roofFloor ? [...stories, roofFloor] : stories;
                    let elevation = 0;
                    for (const story of stories) {
                      story.elevation = elevation;
                      elevation += story.height;
                    }
                    if (roofFloor) roofFloor.elevation = elevation;
                  })
                }
              >
                ↓ Lower
              </button>
              <button
                className="button ghost small"
                onClick={() =>
                  commit("Floor moved up", (document) => {
                    const target = document.buildingDefinitions.find(
                      (item) => item.id === building.id,
                    );
                    if (!target) return;
                    const stories = target.floors.filter((item) => item.type === "story");
                    const index = stories.findIndex((item) => item.id === floor.id);
                    if (index < 0 || index >= stories.length - 1) return;
                    const current = stories[index];
                    const next = stories[index + 1];
                    if (!current || !next) return;
                    stories[index] = next;
                    stories[index + 1] = current;
                    const roofFloor = target.floors.find((item) => item.type === "roof");
                    target.floors = roofFloor ? [...stories, roofFloor] : stories;
                    let elevation = 0;
                    for (const story of stories) {
                      story.elevation = elevation;
                      elevation += story.height;
                    }
                    if (roofFloor) roofFloor.elevation = elevation;
                  })
                }
              >
                ↑ Raise
              </button>
              <button
                className="button ghost small danger-text"
                onClick={() => {
                  if (
                    !window.confirm(
                      `Delete ${floor.name} and all of its walls, openings, and stairs?`,
                    )
                  )
                    return;
                  const fallbackFloor = building.floors.find(
                    (item) => item.type === "story" && item.id !== floor.id,
                  );
                  commit("Floor deleted", (document) => {
                    const target = document.buildingDefinitions.find(
                      (item) => item.id === building.id,
                    );
                    if (!target) return;
                    const removedWallIds = new Set(
                      target.walls
                        .filter((item) => item.floorId === floor.id)
                        .map((item) => item.id),
                    );
                    target.floors = target.floors.filter((item) => item.id !== floor.id);
                    target.walls = target.walls.filter((item) => item.floorId !== floor.id);
                    target.openings = target.openings.filter(
                      (item) => item.floorId !== floor.id && !removedWallIds.has(item.wallId),
                    );
                    target.stairs = target.stairs.filter((item) => item.floorId !== floor.id);
                    let elevation = 0;
                    for (const story of target.floors.filter((item) => item.type === "story")) {
                      story.elevation = elevation;
                      elevation += story.height;
                    }
                    const roofFloor = target.floors.find((item) => item.type === "roof");
                    if (roofFloor) roofFloor.elevation = elevation;
                  });
                  if (fallbackFloor) setActiveFloor(fallbackFloor.id);
                }}
              >
                Delete
              </button>
            </div>
          )}
        <div className="button-row wrap">
          <button
            className="button secondary small"
            disabled={Boolean(building.roof)}
            onClick={addFloor}
          >
            + Floor
          </button>
          {!building.roof ? (
            <button className="button secondary small" onClick={addRoof}>
              + Gable roof
            </button>
          ) : (
            <button
              className="button ghost small"
              onClick={() =>
                commit("Roof removed", (document) => {
                  const target = document.buildingDefinitions.find(
                    (item) => item.id === building.id,
                  );
                  if (!target?.roof) return;
                  target.floors = target.floors.filter((item) => item.id !== target.roof?.floorId);
                  delete target.roof;
                })
              }
            >
              Remove roof
            </button>
          )}
        </div>
        {building.roof && (
          <div className="property-card">
            <span className="eyebrow">Gable properties</span>
            <div className="field-row">
              <label>
                Pitch (°)
                <input
                  type="number"
                  min={1}
                  max={80}
                  defaultValue={building.roof.pitchDegrees}
                  onBlur={(event) =>
                    commit("Roof pitch changed", (document) => {
                      const roof = document.buildingDefinitions.find(
                        (item) => item.id === building.id,
                      )?.roof;
                      if (roof)
                        roof.pitchDegrees = Math.min(
                          80,
                          Math.max(1, numberOnBlur(event.target.value, roof.pitchDegrees)),
                        );
                    })
                  }
                />
              </label>
              <label>
                Overhang (mm)
                <input
                  type="number"
                  min={0}
                  defaultValue={building.roof.overhang}
                  onBlur={(event) =>
                    commit("Roof overhang changed", (document) => {
                      const roof = document.buildingDefinitions.find(
                        (item) => item.id === building.id,
                      )?.roof;
                      if (roof) roof.overhang = numberOnBlur(event.target.value, roof.overhang);
                    })
                  }
                />
              </label>
            </div>
            <div className="field-row">
              <label>
                Thickness (mm)
                <input
                  type="number"
                  min={1}
                  defaultValue={building.roof.thickness}
                  onBlur={(event) =>
                    commit("Roof thickness changed", (document) => {
                      const roof = document.buildingDefinitions.find(
                        (item) => item.id === building.id,
                      )?.roof;
                      if (roof)
                        roof.thickness = Math.max(
                          1,
                          numberOnBlur(event.target.value, roof.thickness),
                        );
                    })
                  }
                />
              </label>
              <label>
                Ridge direction
                <select
                  value={Math.abs(building.roof.ridgeRotationDegrees % 180) < 45 ? 0 : 90}
                  onChange={(event) =>
                    commit("Roof ridge rotated", (document) => {
                      const roof = document.buildingDefinitions.find(
                        (item) => item.id === building.id,
                      )?.roof;
                      if (roof) roof.ridgeRotationDegrees = Number(event.target.value);
                    })
                  }
                >
                  <option value={0}>Longest axis</option>
                  <option value={90}>Across longest axis</option>
                </select>
              </label>
            </div>
            <label className="check-label">
              <input
                type="checkbox"
                checked={building.roof.flipped}
                onChange={(event) =>
                  commit("Roof slope flipped", (document) => {
                    const roof = document.buildingDefinitions.find(
                      (item) => item.id === building.id,
                    )?.roof;
                    if (roof) roof.flipped = event.target.checked;
                  })
                }
              />
              Flip slope metadata
            </label>
          </div>
        )}
      </details>

      <details open className="panel-section">
        <summary>
          Walls · {building.walls.filter((item) => item.floorId === floor?.id).length}
        </summary>
        <div className="scene-list compact">
          {building.walls
            .filter((item) => item.floorId === floor?.id)
            .map((item, index) => (
              <button
                className={wall?.id === item.id ? "active" : ""}
                key={item.id}
                onClick={() => setSelection({ type: "wall", id: item.id })}
              >
                <span>W{index + 1}</span>
                <div>
                  <strong>{item.type === "external" ? "External wall" : "Internal wall"}</strong>
                  <small>
                    {item.thickness} mm · {item.typeSource}
                  </small>
                </div>
              </button>
            ))}
        </div>
        {wall && (
          <div className="property-card">
            <label>
              Wall type
              <select
                value={wall.type}
                onChange={(event) =>
                  commit("Wall type overridden", (document) => {
                    const target = document.buildingDefinitions
                      .find((item) => item.id === building.id)
                      ?.walls.find((item) => item.id === wall.id);
                    if (!target) return;
                    target.type = event.target.value as "external" | "internal";
                    target.typeSource = "manual";
                    target.thickness =
                      target.type === "external"
                        ? building.defaults.externalWallThickness
                        : building.defaults.internalWallThickness;
                    target.alignment = target.type === "external" ? "inside" : "center";
                  })
                }
              >
                <option value="external">External</option>
                <option value="internal">Internal</option>
              </select>
            </label>
            <div className="field-row">
              <label>
                Thickness
                <input
                  type="number"
                  defaultValue={wall.thickness}
                  onBlur={(event) =>
                    commit("Wall thickness changed", (document) => {
                      const target = document.buildingDefinitions
                        .find((item) => item.id === building.id)
                        ?.walls.find((item) => item.id === wall.id);
                      if (!target) return;
                      target.thickness = numberOnBlur(event.target.value, wall.thickness);
                      target.typeSource = "manual";
                    })
                  }
                />
              </label>
              <label>
                Alignment
                <select
                  value={wall.alignment}
                  onChange={(event) =>
                    commit("Wall alignment changed", (document) => {
                      const target = document.buildingDefinitions
                        .find((item) => item.id === building.id)
                        ?.walls.find((item) => item.id === wall.id);
                      if (target)
                        target.alignment = event.target.value as "inside" | "center" | "outside";
                    })
                  }
                >
                  <option value="inside">Inside</option>
                  <option value="center">Centre</option>
                  <option value="outside">Outside</option>
                </select>
              </label>
            </div>
          </div>
        )}
      </details>

      <details className="panel-section">
        <summary>
          Openings · {building.openings.filter((item) => item.floorId === floor?.id).length}
        </summary>
        <div className="scene-list compact">
          {building.openings
            .filter((item) => item.floorId === floor?.id)
            .map((opening) => (
              <button
                className={selectedOpening?.id === opening.id ? "active" : ""}
                key={opening.id}
                onClick={() => setSelection({ type: "opening", id: opening.id })}
              >
                <span>{opening.kind === "door" ? "D" : "▣"}</span>
                <div>
                  <strong>
                    {opening.kind === "carport"
                      ? "Carport opening"
                      : opening.kind === "door"
                        ? "Door"
                        : "Window"}
                  </strong>
                  <small>
                    {opening.width} × {opening.height} mm
                  </small>
                </div>
              </button>
            ))}
        </div>
        {selectedOpening && (
          <div className="property-card">
            <label>
              Preset
              <select
                value={`${selectedOpening.width}x${selectedOpening.height}`}
                onChange={(event) => {
                  const [width, height] = event.target.value.split("x").map(Number);
                  commit("Opening preset changed", (document) => {
                    const target = document.buildingDefinitions
                      .find((item) => item.id === building.id)
                      ?.openings.find((item) => item.id === selectedOpening.id);
                    if (!target || !width || !height) return;
                    target.width = width;
                    target.height = height;
                  });
                }}
              >
                {selectedOpening.kind === "carport" ? (
                  <>
                    <option value="2500x2100">2500 Ã— 2100</option>
                    <option value="3000x2200">3000 Ã— 2200</option>
                  </>
                ) : selectedOpening.kind === "door" ? (
                  <>
                    <option value="800x2100">800 × 2100</option>
                    <option value="900x2100">900 × 2100</option>
                    <option value="1000x2100">1000 × 2100</option>
                  </>
                ) : (
                  <>
                    <option value="600x900">600 × 900</option>
                    <option value="900x1200">900 × 1200</option>
                    <option value="1200x1200">1200 × 1200</option>
                    <option value="1200x1500">1200 × 1500</option>
                  </>
                )}
              </select>
            </label>
            <div className="field-row">
              <label>
                Offset (mm)
                <input
                  type="number"
                  min={0}
                  defaultValue={selectedOpening.offset}
                  onBlur={(event) =>
                    commit("Opening moved", (document) => {
                      const target = document.buildingDefinitions
                        .find((item) => item.id === building.id)
                        ?.openings.find((item) => item.id === selectedOpening.id);
                      if (target)
                        target.offset = numberOnBlur(event.target.value, selectedOpening.offset);
                    })
                  }
                />
              </label>
              <label>
                Sill (mm)
                <input
                  type="number"
                  min={0}
                  disabled={selectedOpening.kind !== "window"}
                  defaultValue={selectedOpening.sillHeight}
                  onBlur={(event) =>
                    commit("Opening sill changed", (document) => {
                      const target = document.buildingDefinitions
                        .find((item) => item.id === building.id)
                        ?.openings.find((item) => item.id === selectedOpening.id);
                      if (target)
                        target.sillHeight = numberOnBlur(
                          event.target.value,
                          selectedOpening.sillHeight,
                        );
                    })
                  }
                />
              </label>
            </div>
            <button
              className="button ghost small danger-text"
              onClick={() =>
                commit("Opening deleted", (document) => {
                  const target = document.buildingDefinitions.find(
                    (item) => item.id === building.id,
                  );
                  if (target)
                    target.openings = target.openings.filter(
                      (item) => item.id !== selectedOpening.id,
                    );
                })
              }
            >
              Delete opening
            </button>
          </div>
        )}
      </details>
    </aside>
  );
}

function ArchitectureInspector({ project }: { project: ProjectDocument }) {
  const selection = useEditorStore((state) => state.selection);
  const setSelection = useEditorStore((state) => state.setSelection);
  const makeUnique = useEditorStore((state) => state.makeSelectedBuildingUnique);
  const editBuilding = useEditorStore((state) => state.editBuilding);
  const commit = useEditorStore((state) => state.commit);
  const selectedBuilding =
    selection?.type === "building"
      ? project.scene.buildingInstances.find((item) => item.id === selection.id)
      : undefined;
  const selectedAsset =
    selection?.type === "asset"
      ? project.scene.assetInstances.find((item) => item.id === selection.id)
      : undefined;
  const selectedTerrain =
    selection?.type === "terrain"
      ? project.scene.terrainLayers.find((item) => item.id === selection.id)
      : undefined;

  return (
    <aside className="inspector">
      <div className="panel-heading">
        <span className="eyebrow">Project scene</span>
        <h2>{project.name}</h2>
        <p>
          {project.scene.buildingInstances.length} buildings · {project.scene.assetInstances.length}{" "}
          objects
        </p>
      </div>
      <details open className="panel-section">
        <summary>Buildings</summary>
        <div className="scene-list">
          {project.scene.buildingInstances.map((item) => (
            <button
              className={selectedBuilding?.id === item.id ? "active" : ""}
              key={item.id}
              onClick={() => setSelection({ type: "building", id: item.id })}
            >
              <span>⌂</span>
              <div>
                <strong>{item.name}</strong>
                <small>
                  {Math.round(item.transform.position.x)}, {Math.round(item.transform.position.y)}{" "}
                  mm
                </small>
              </div>
            </button>
          ))}
        </div>
      </details>
      <details open className="panel-section">
        <summary>Objects</summary>
        <div className="scene-list">
          {project.scene.assetInstances.map((item) => (
            <button
              className={selectedAsset?.id === item.id ? "active" : ""}
              key={item.id}
              onClick={() => setSelection({ type: "asset", id: item.id })}
            >
              <span>◇</span>
              <div>
                <strong>{item.name}</strong>
                <small>Scale {item.transform.scale.toFixed(2)}</small>
              </div>
            </button>
          ))}
        </div>
      </details>
      <details open className="panel-section">
        <summary>Terrain</summary>
        <div className="scene-list">
          {project.scene.terrainLayers.map((item) => (
            <button
              className={selectedTerrain?.id === item.id ? "active" : ""}
              key={item.id}
              onClick={() => setSelection({ type: "terrain", id: item.id })}
            >
              <span>≋</span>
              <div>
                <strong>{item.name}</strong>
                <small>{item.attribution}</small>
              </div>
            </button>
          ))}
        </div>
      </details>

      {selectedBuilding && (
        <div className="selection-properties">
          <span className="eyebrow">Selected building</span>
          <h3>{selectedBuilding.name}</h3>
          <div className="button-row wrap">
            <button
              className="button secondary small"
              onClick={() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "f" }))}
            >
              Focus · F
            </button>
            <button className="button secondary small" onClick={makeUnique}>
              Make unique
            </button>
            <button
              className="button primary small"
              onClick={() => editBuilding(selectedBuilding.definitionId)}
            >
              Edit in Builder
            </button>
          </div>
          <p className="supporting-text">G translate · R rotate. Building scale is locked.</p>
        </div>
      )}
      {selectedAsset && (
        <div className="selection-properties">
          <span className="eyebrow">Selected object</span>
          <h3>{selectedAsset.name}</h3>
          <p className="supporting-text">G translate · R rotate · S uniform scale · F focus</p>
        </div>
      )}
      {selectedTerrain && (
        <div className="selection-properties">
          <span className="eyebrow">Terrain layer</span>
          <h3>{selectedTerrain.name}</h3>
          <label>
            Vertical offset (mm)
            <input
              type="number"
              defaultValue={selectedTerrain.verticalOffset}
              onBlur={(event) =>
                commit("Terrain elevation changed", (document) => {
                  const target = document.scene.terrainLayers.find(
                    (item) => item.id === selectedTerrain.id,
                  );
                  if (target)
                    target.verticalOffset = numberOnBlur(
                      event.target.value,
                      selectedTerrain.verticalOffset,
                    );
                })
              }
            />
          </label>
          <p className="supporting-text">
            Absolute centre elevation: {selectedTerrain.absoluteAnchorElevation.toFixed(2)} m
          </p>
        </div>
      )}
    </aside>
  );
}

export function Inspector() {
  const project = useEditorStore((state) => state.project);
  const mode = useEditorStore((state) => state.mode);
  const activeBuildingId = useEditorStore((state) => state.activeBuildingId);
  if (!project) return null;
  const building = project.buildingDefinitions.find((item) => item.id === activeBuildingId);
  return mode === "builder" ? (
    <BuilderInspector project={project} building={building} />
  ) : (
    <ArchitectureInspector project={project} />
  );
}
