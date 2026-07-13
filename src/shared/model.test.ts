import { describe, expect, it } from "vitest";
import { createProject, parseProjectDocument } from "./model";

describe("project schema", () => {
  it("round-trips a current project", () => {
    const project = createProject("Round trip");
    expect(parseProjectDocument(JSON.parse(JSON.stringify(project)))).toEqual(project);
    expect(project.assetDefinitions.map((asset) => asset.kind)).toEqual(
      expect.arrayContaining([
        "hedge-segment",
        "fence-segment",
        "garbage-shed",
        "flag-pole",
        "plane",
        "sphere",
        "cylinder",
        "cone",
      ]),
    );
  });

  it("persists a generated polygon face and extrusion height", () => {
    const project = createProject("Extruded face");
    project.assetDefinitions.push({
      id: "face",
      name: "Face",
      source: "generated",
      kind: "polygon-face",
      polygon: {
        points: [
          { x: 0, y: 0 },
          { x: 1000, y: 0 },
          { x: 0, y: 1000 },
        ],
        extrusionHeight: 2700,
      },
    });
    project.scene.assetInstances.push({
      id: "face-instance",
      definitionId: "face",
      name: "Face",
      transform: { position: { x: 500, y: 750, z: 0 }, rotationZ: 0, scale: 1 },
      visible: true,
    });
    expect(parseProjectDocument(project).assetDefinitions.at(-1)?.polygon?.extrusionHeight).toBe(
      2700,
    );
  });

  it("persists a vehicle-scale carport opening", () => {
    const project = createProject("Carport");
    const building = {
      id: "building",
      name: "Garage",
      footprint: [
        { x: 0, y: 0 },
        { x: 5000, y: 0 },
        { x: 5000, y: 5000 },
      ],
      defaults: {
        externalWallThickness: 250,
        internalWallThickness: 100,
        floorHeight: 2700,
        slabThickness: 200,
      },
      floors: [
        {
          id: "floor",
          name: "Ground",
          type: "story" as const,
          elevation: 0,
          height: 2700,
          slabThickness: 200,
        },
      ],
      walls: [
        {
          id: "wall",
          floorId: "floor",
          start: { x: 0, y: 0 },
          end: { x: 5000, y: 0 },
          type: "external" as const,
          typeSource: "auto" as const,
          thickness: 250,
          alignment: "inside" as const,
        },
      ],
      openings: [
        {
          id: "carport",
          floorId: "floor",
          wallId: "wall",
          kind: "carport" as const,
          width: 3000,
          height: 2200,
          offset: 1000,
          sillHeight: 0,
        },
      ],
      stairs: [],
    };
    project.buildingDefinitions.push(building);
    const parsed = parseProjectDocument(project);
    expect(parsed.buildingDefinitions[0]?.openings[0]?.kind).toBe("carport");
    expect(parsed.buildingDefinitions[0]?.walls[0]).not.toHaveProperty("typeSource");
  });

  it("persists a clicked polygon map layer", () => {
    const project = createProject("Map polygon");
    project.scene.terrainLayers.push({
      id: "map-layer",
      name: "Selected map area",
      provider: "custom",
      attribution: "Map provider",
      boundsWgs84: [10, 59, 10.01, 59.01],
      clipPolygonWgs84: [
        [10, 59],
        [10.01, 59],
        [10.005, 59.01],
      ],
      sourceEpsg: "EPSG:4326",
      anchorWgs84: [10.005, 59.005],
      absoluteAnchorElevation: 0,
      verticalOffset: 0,
      widthMm: 1_000_000,
      heightMm: 1_000_000,
      gridSize: [2, 2],
      elevationsMm: [0, 0, 0, 0],
      visible: true,
    });
    expect(parseProjectDocument(project).scene.terrainLayers[0]?.clipPolygonWgs84).toHaveLength(3);
  });

  it("migrates an unversioned legacy project", () => {
    const migrated = parseProjectDocument({
      id: "legacy",
      name: "Legacy",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });
    expect(migrated.schemaVersion).toBe(1);
    expect(migrated.units).toBe("mm");
    expect(migrated.scene.terrainLayers).toEqual([]);
  });

  it("rejects future versions with a useful message", () => {
    expect(() => parseProjectDocument({ schemaVersion: 99 })).toThrow(
      "This project uses schema version 99",
    );
  });

  it("rejects dangling instance references", () => {
    const project = createProject("Broken");
    project.scene.buildingInstances.push({
      id: "instance",
      definitionId: "missing",
      name: "Broken",
      transform: { position: { x: 0, y: 0, z: 0 }, rotationZ: 0, scale: 1 },
      visible: true,
    });
    expect(() => parseProjectDocument(project)).toThrow("references a missing definition");
  });
});
