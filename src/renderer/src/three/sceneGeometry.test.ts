import { Box3, type Mesh, type Object3D } from "three";
import { describe, expect, it } from "vitest";
import type {
  AssetDefinition,
  BuildingDefinition,
  TerrainLayer,
  Vec2,
} from "../../../shared/model";
import {
  calculateWallMiterProfile,
  createBuildingGroup,
  createBuiltinAsset,
  createTerrainMesh,
  deriveAutomaticRoofLayout,
} from "./sceneGeometry";

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

function countByType(group: Object3D, entityType: string): number {
  let count = 0;
  group.traverse((child) => {
    if (child.userData.entityType === entityType) count += 1;
  });
  return count;
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

  it("creates merged primary and cross-gable roofs over an L-shaped footprint", () => {
    const footprint = [
      { x: 0, y: 0 },
      { x: 6000, y: 0 },
      { x: 6000, y: 2500 },
      { x: 2500, y: 2500 },
      { x: 2500, y: 5000 },
      { x: 0, y: 5000 },
    ];
    const layout = deriveAutomaticRoofLayout(footprint);
    expect(layout.axisU.x).toBeCloseTo(1);
    expect(layout.axisU.y).toBeCloseTo(0);
    expect(layout.modules).toHaveLength(2);
    expect(layout.modules[0]).toMatchObject({ primary: true, ridgeAxis: "u" });
    expect(layout.modules[1]).toMatchObject({ primary: false, ridgeAxis: "v" });

    const roof = childByType(createBuildingGroup(buildingFor(footprint)), "roof");
    const roofBounds = new Box3().setFromObject(roof);
    expect(roof.userData.roofModuleCount).toBe(2);
    expect(roofBounds.min.z).toBeCloseTo(2.9);
    expect(roofBounds.max.z).toBeGreaterThan(2.9);
    expect(roofBounds.max.x).toBeGreaterThan(6);
    expect(roofBounds.max.y).toBeGreaterThan(5);
  });

  it("keeps the automatic roof stable for rotated extensions and angled footprints", () => {
    const angle = Math.PI / 6;
    const rotate = ({ x, y }: { x: number; y: number }) => ({
      x: x * Math.cos(angle) - y * Math.sin(angle),
      y: x * Math.sin(angle) + y * Math.cos(angle),
    });
    const rotatedL = [
      { x: 0, y: 0 },
      { x: 6000, y: 0 },
      { x: 6000, y: 2500 },
      { x: 2500, y: 2500 },
      { x: 2500, y: 5000 },
      { x: 0, y: 5000 },
    ].map(rotate);
    expect(deriveAutomaticRoofLayout(rotatedL).modules).toHaveLength(2);

    const angled = [
      { x: 0, y: 0 },
      { x: 5400, y: 900 },
      { x: 4700, y: 4200 },
      { x: -700, y: 3500 },
    ];
    const layout = deriveAutomaticRoofLayout(angled);
    expect(layout.modules).toHaveLength(1);
    const roof = childByType(createBuildingGroup(buildingFor(angled)), "roof") as Mesh;
    const positions = (roof.geometry.getAttribute("position")?.array ?? []) as ArrayLike<number>;
    expect(Array.from(positions).every(Number.isFinite)).toBe(true);
    expect(new Box3().setFromObject(roof).min.z).toBeCloseTo(2.9);
  });

  it("miters exterior walls at a right-angle foundation corner", () => {
    const footprint = [
      { x: 0, y: 0 },
      { x: 5000, y: 0 },
      { x: 5000, y: 4000 },
      { x: 0, y: 4000 },
    ];
    const first = buildingFor(footprint).walls[0];
    if (!first) throw new Error("Missing first wall");
    const second = {
      ...first,
      id: "outside-wall-2",
      start: { x: 5000, y: 0 },
      end: { x: 5000, y: 4000 },
    };
    const firstProfile = calculateWallMiterProfile(first, [first, second], footprint);
    const secondProfile = calculateWallMiterProfile(second, [first, second], footprint);
    expect(firstProfile.hasMiter).toBe(true);
    expect(firstProfile.end).toEqual({ low: 5000, high: 4750 });
    expect(secondProfile.start).toEqual({ low: 0, high: 250 });
  });

  it("derives finite asymmetric cuts for an angled exterior corner", () => {
    const footprint = [
      { x: 0, y: 0 },
      { x: 5000, y: 0 },
      { x: 7000, y: 3000 },
      { x: 0, y: 3000 },
    ];
    const first = buildingFor(footprint).walls[0];
    if (!first) throw new Error("Missing first wall");
    const angled = {
      ...first,
      id: "angled-wall",
      start: { x: 5000, y: 0 },
      end: { x: 7000, y: 3000 },
    };
    const profile = calculateWallMiterProfile(first, [first, angled], footprint);
    expect(profile.hasMiter).toBe(true);
    expect(profile.end.low).not.toBeCloseTo(profile.end.high);
    expect(profile.end.low).toBeGreaterThan(4000);
    expect(profile.end.high).toBeGreaterThan(4000);
  });

  it("hides upper Builder floors until their floor or roof is selected", () => {
    const building = buildingFor([
      { x: 0, y: 0 },
      { x: 5000, y: 0 },
      { x: 5000, y: 4000 },
      { x: 0, y: 4000 },
    ]);
    const ground = building.floors[0];
    const roof = building.floors[1];
    if (!ground || !roof) throw new Error("Missing test floors");
    const upper = {
      ...ground,
      id: "upper",
      name: "Upper floor",
      elevation: 2900,
    };
    roof.elevation = 5800;
    building.floors = [ground, upper, roof];

    const groundView = createBuildingGroup(building, ground.id);
    const upperView = createBuildingGroup(building, upper.id);
    const roofView = createBuildingGroup(building, roof.id);
    expect(countByType(groundView, "floor")).toBe(1);
    expect(countByType(groundView, "roof")).toBe(0);
    expect(countByType(upperView, "floor")).toBe(2);
    expect(countByType(upperView, "roof")).toBe(0);
    expect(countByType(roofView, "floor")).toBe(2);
    expect(countByType(roofView, "roof")).toBe(1);
  });

  it("renders a clicked map polygon as a clipped terrain surface", () => {
    const layer: TerrainLayer = {
      id: "terrain",
      name: "Triangle",
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
      verticalOffset: 125,
      widthMm: 1_000_000,
      heightMm: 1_000_000,
      gridSize: [2, 2],
      elevationsMm: [0, 0, 0, 0],
      visible: true,
    };
    const mesh = createTerrainMesh(layer);
    expect(mesh.geometry.type).toBe("ShapeGeometry");
    expect(mesh.position.z).toBeCloseTo(0.125);
    const uvs = mesh.geometry.getAttribute("uv");
    const uCoordinates = Array.from({ length: uvs.count }, (_, index) => uvs.getX(index));
    const vCoordinates = Array.from({ length: uvs.count }, (_, index) => uvs.getY(index));
    expect(Math.min(...uCoordinates)).toBeCloseTo(0);
    expect(Math.max(...uCoordinates)).toBeCloseTo(1);
    expect(Math.min(...vCoordinates)).toBeCloseTo(0);
    expect(Math.max(...vCoordinates)).toBeCloseTo(1);
  });

  it("renders a generated polygon face as an editable vertical extrusion", () => {
    const face: AssetDefinition = {
      id: "face",
      name: "Extruded face",
      source: "generated",
      kind: "polygon-face",
      polygon: {
        points: [
          { x: 0, y: 0 },
          { x: 3000, y: 0 },
          { x: 3000, y: 2000 },
          { x: 0, y: 2000 },
        ],
        extrusionHeight: 2500,
      },
    };
    const bounds = new Box3().setFromObject(createBuiltinAsset(face));
    expect(bounds.max.z).toBeCloseTo(2.5);
    expect(bounds.max.x - bounds.min.x).toBeCloseTo(3);
    expect(bounds.max.y - bounds.min.y).toBeCloseTo(2);
  });
});
