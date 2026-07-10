import { describe, expect, it } from "vitest";
import { createProject, parseProjectDocument } from "./model";

describe("project schema", () => {
  it("round-trips a current project", () => {
    const project = createProject("Round trip");
    expect(parseProjectDocument(JSON.parse(JSON.stringify(project)))).toEqual(project);
    expect(project.assetDefinitions.map((asset) => asset.kind)).toEqual(
      expect.arrayContaining(["hedge-segment", "fence-segment", "garbage-shed", "flag-pole"]),
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
    expect(parseProjectDocument(project).buildingDefinitions[0]?.openings[0]?.kind).toBe("carport");
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
