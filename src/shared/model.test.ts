import { describe, expect, it } from "vitest";
import { createProject, parseProjectDocument } from "./model";

describe("project schema", () => {
  it("round-trips a current project", () => {
    const project = createProject("Round trip");
    expect(parseProjectDocument(JSON.parse(JSON.stringify(project)))).toEqual(project);
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
