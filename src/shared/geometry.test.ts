import { describe, expect, it } from "vitest";
import {
  calculateStair,
  formatArea,
  gablePanelRotation,
  isWallOnFootprint,
  lockToConstructionAxis,
  polygonAreaMm2,
  polygonPerimeterMm,
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
        { x: 0, y: 1000 },
        { x: 1000, y: 0 },
      ]),
    ).toBe("Foundation edges cannot cross.");
  });

  it("locks to rotated construction axes", () => {
    const result = lockToConstructionAxis({ x: 0, y: 0 }, { x: 900, y: 700 }, 5);
    expect(Math.atan2(result.y, result.x) * (180 / Math.PI)).toBeCloseTo(5);
  });

  it("classifies footprint walls and stair risers", () => {
    expect(isWallOnFootprint({ x: 0, y: 0 }, { x: 5000, y: 0 }, rectangle)).toBe(true);
    expect(isWallOnFootprint({ x: 1000, y: 1000 }, { x: 4000, y: 1000 }, rectangle)).toBe(false);
    expect(calculateStair(2700)).toEqual({ riserCount: 15, riserHeight: 180 });
  });

  it("raises gable roof panels toward the ridge", () => {
    const pitch = Math.PI / 6;
    expect(gablePanelRotation(-1, true, pitch)).toEqual({ x: pitch, y: 0 });
    expect(gablePanelRotation(1, true, pitch)).toEqual({ x: -pitch, y: 0 });
    expect(gablePanelRotation(-1, false, pitch)).toEqual({ x: 0, y: -pitch });
    expect(gablePanelRotation(1, false, pitch)).toEqual({ x: 0, y: pitch });
  });
});
