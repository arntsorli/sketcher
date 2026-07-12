import { Vector3 } from "three";
import { describe, expect, it } from "vitest";
import { createClippingPlane } from "./clipping";

describe("clipping plane", () => {
  it("places an axis plane at the configured millimetre offset", () => {
    const plane = createClippingPlane({
      enabled: true,
      axis: "z",
      offsetMm: 2700,
      inverted: false,
      showHelper: true,
    });
    expect(plane.distanceToPoint(new Vector3(0, 0, 2.7))).toBeCloseTo(0);
    expect(plane.normal.toArray()).toEqual([0, 0, 1]);
  });

  it("flips the clipped side without moving the plane", () => {
    const plane = createClippingPlane({
      enabled: true,
      axis: "x",
      offsetMm: 1000,
      inverted: true,
      showHelper: false,
    });
    expect(plane.distanceToPoint(new Vector3(1, 0, 0))).toBeCloseTo(0);
    expect(plane.normal.x).toBe(-1);
    expect(plane.normal.y).toBeCloseTo(0);
    expect(plane.normal.z).toBeCloseTo(0);
  });
});
