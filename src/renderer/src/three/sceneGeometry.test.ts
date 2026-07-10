import { Box3, type Object3D } from "three";
import { describe, expect, it } from "vitest";
import type { BuildingDefinition, Vec2 } from "../../../shared/model";
import { createBuildingGroup } from "./sceneGeometry";

function buildingFor(footprint: Vec2[]): BuildingDefinition {
  return {
    id: "building",
    name: "Envelope test",
    footprint,
    defaults: {
      externalWallThickness: 250,
      internalWallThickness: 100,
      floorHeight: 2700,
      slabThickness: 200,
    },
    floors: [
      {
        id: "ground",
        name: "Ground floor",
        type: "story",
        elevation: 0,
        height: 2700,
        slabThickness: 200,
      },
      {
        id: "roof",
        name: "Roof",
        type: "roof",
        elevation: 2900,
        height: 200,
        slabThickness: 200,
      },
    ],
    walls: [
      {
        id: "outside-wall",
        floorId: "ground",
        start: footprint[0] ?? { x: 0, y: 0 },
        end: footprint[1] ?? { x: 5000, y: 0 },
        type: "external",
        typeSource: "auto",
        thickness: 250,
        alignment: "inside",
      },
    ],
    openings: [],
    stairs: [],
    roof: {
      floorId: "roof",
      pitchDegrees: 30,
      overhang: 300,
      thickness: 200,
      ridgeRotationDegrees: 0,
      flipped: false,
    },
  };
}

function childByType(group: Object3D, entityType: string): Object3D {
  let found: Object3D | undefined;
  group.traverse((child) => {
    if (child.userData.entityType === entityType) found = child;
  });
  if (!found) throw new Error(`Missing ${entityType}`);
  return found;
}

describe("building envelope geometry", () => {
  it("keeps automatic exterior walls entirely inside both footprint windings", () => {
    const counterClockwise = createBuildingGroup(
      buildingFor([
        { x: 0, y: 0 },
        { x: 5000, y: 0 },
        { x: 5000, y: 4000 },
        { x: 0, y: 4000 },
      ]),
    );
    const clockwise = createBuildingGroup(
      buildingFor([
        { x: 0, y: 0 },
        { x: 0, y: 4000 },
        { x: 5000, y: 4000 },
        { x: 5000, y: 0 },
      ]),
    );
    expect(new Box3().setFromObject(childByType(counterClockwise, "wall")).min.y).toBeCloseTo(0);
    expect(new Box3().setFromObject(childByType(clockwise, "wall")).min.x).toBeCloseTo(0);
  });

  it("creates a closed roof volume over an L-shaped footprint at the wall top", () => {
    const group = createBuildingGroup(
      buildingFor([
        { x: 0, y: 0 },
        { x: 6000, y: 0 },
        { x: 6000, y: 2500 },
        { x: 2500, y: 2500 },
        { x: 2500, y: 5000 },
        { x: 0, y: 5000 },
      ]),
    );
    const roofBounds = new Box3().setFromObject(childByType(group, "roof"));
    expect(roofBounds.min.z).toBeCloseTo(2.7);
    expect(roofBounds.max.z).toBeGreaterThan(2.9);
    expect(roofBounds.max.x).toBeGreaterThan(6);
    expect(roofBounds.max.y).toBeGreaterThan(5);
  });
});
