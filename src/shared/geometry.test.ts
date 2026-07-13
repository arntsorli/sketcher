import { describe, expect, it } from "vitest";
import {
  calculateOpeningPlacement,
  calculateStair,
  formatArea,
  gablePanelRotation,
  lockToConstructionAxis,
  polygonAreaMm2,
  polygonPerimeterMm,
  snapToGrid,
  validateNextPolygonPoint,
  validatePolygon,
} from "./geometry";

const rectangle = [
  { x: 0, y: 0 },
  { x: 5000, y: 0 },
  { x: 5000, y: 8000 },
  { x: 0, y: 8000 },
];

describe("building geometry", () => {
  it("calculates the acceptance foundation", () => {
    expect(polygonAreaMm2(rectangle)).toBe(40_000_000);
    expect(polygonPerimeterMm(rectangle)).toBe(26_000);
    expect(formatArea(polygonAreaMm2(rectangle), "m2")).toBe("40.00 m²");
    expect(validatePolygon(rectangle)).toBeNull();
  });

  it("rejects self-intersecting foundations", () => {
    expect(
      validatePolygon([
        { x: 0, y: 0 },
        { x: 1000, y: 1000 },
        { x: 0, y: -1000 },
        { x: 1000, y: 0 },
      ]),
    ).toBe("Foundation edges cannot cross.");
  });

  it("rejects a crossing segment before it corrupts the foundation draft", () => {
    expect(
      validateNextPolygonPoint(
        [
          { x: 0, y: 0 },
          { x: 2000, y: 0 },
          { x: 2000, y: 2000 },
        ],
        { x: 0, y: -1000 },
      ),
    ).toBe("That segment crosses an existing foundation edge.");
    expect(validateNextPolygonPoint([{ x: 0, y: 0 }], { x: 0, y: 0 })).toBe(
      "Foundation edges must be at least 1 mm long.",
    );
  });

  it("locks to rotated construction axes", () => {
    const result = lockToConstructionAxis({ x: 0, y: 0 }, { x: 900, y: 700 }, 5);
    expect(Math.atan2(result.y, result.x) * (180 / Math.PI)).toBeCloseTo(5);
  });

  it("locks walls to a right angle until an explicit axis offset is applied", () => {
    const orthogonal = lockToConstructionAxis({ x: 400, y: 600 }, { x: 2200, y: 1350 }, 0);
    expect(orthogonal.y).toBe(600);
    expect(orthogonal.x).toBe(2200);

    const offset = lockToConstructionAxis({ x: 400, y: 600 }, { x: 2200, y: 1350 }, 15);
    expect(Math.atan2(offset.y - 600, offset.x - 400) * (180 / Math.PI)).toBeCloseTo(15);
  });

  it("snaps blank-canvas foundation points to the active grid", () => {
    expect(snapToGrid({ x: 1049, y: -151 }, 100)).toEqual({ x: 1000, y: -200 });
  });

  it("calculates stair risers", () => {
    expect(calculateStair(2700)).toEqual({ riserCount: 15, riserHeight: 180 });
  });

  it("raises gable roof panels toward the ridge", () => {
    const pitch = Math.PI / 6;
    expect(gablePanelRotation(-1, true, pitch)).toEqual({ x: pitch, y: 0 });
    expect(gablePanelRotation(1, true, pitch)).toEqual({ x: -pitch, y: 0 });
    expect(gablePanelRotation(-1, false, pitch)).toEqual({ x: 0, y: -pitch });
    expect(gablePanelRotation(1, false, pitch)).toEqual({ x: 0, y: pitch });
  });

  it("previews generous door placement and side clearances", () => {
    const wall = {
      id: "wall",
      floorId: "floor",
      start: { x: 0, y: 0 },
      end: { x: 5000, y: 0 },
      type: "external" as const,
      thickness: 250,
      alignment: "inside" as const,
    };
    const placement = calculateOpeningPlacement(
      [wall],
      [
        {
          id: "existing",
          floorId: "floor",
          wallId: "wall",
          kind: "door" as const,
          width: 900,
          height: 2100,
          offset: 1000,
          sillHeight: 0,
        },
      ],
      "floor",
      { x: 3000, y: 900 },
      1200,
    );
    expect(placement?.valid).toBe(true);
    expect(placement?.offset).toBe(2400);
    expect(placement?.clearances).toMatchObject({ left: 500, right: 1400 });
    expect(placement?.start).toEqual({ x: 2400, y: 0 });
    expect(placement?.end).toEqual({ x: 3600, y: 0 });
    const overlapping = calculateOpeningPlacement(
      [wall],
      [
        {
          id: "existing",
          floorId: "floor",
          wallId: "wall",
          kind: "door" as const,
          width: 900,
          height: 2100,
          offset: 1000,
          sillHeight: 0,
        },
      ],
      "floor",
      { x: 1500, y: 0 },
      900,
    );
    expect(overlapping?.valid).toBe(false);
  });
});
