import { describe, expect, it } from "vitest";
import {
  boundsPolygon,
  imageSizeForSelection,
  polygonDimensionsMeters,
  staticMapImageUrl,
} from "./mapSelection";

describe("map area selection", () => {
  it("turns visible map bounds into a selectable rectangle", () => {
    expect(boundsPolygon({ west: 10, south: 59, east: 11, north: 60 })).toEqual([
      [10, 59],
      [11, 59],
      [11, 60],
      [10, 60],
    ]);
  });

  it("measures a polygon in local metres", () => {
    const dimensions = polygonDimensionsMeters([
      [10, 60],
      [10.01, 60],
      [10.01, 60.005],
      [10, 60.005],
    ]);
    expect(dimensions.width).toBeCloseTo(556.5, 0);
    expect(dimensions.height).toBeCloseTo(556.6, 0);
    expect(dimensions.area).toBeCloseTo(dimensions.width * dimensions.height, -2);
  });

  it("keeps the extracted image aspect ratio close to the selected map area", () => {
    expect(imageSizeForSelection({ width: 1000, height: 500 })).toEqual({
      width: 4096,
      height: 2048,
    });
    expect(imageSizeForSelection({ width: 80, height: 60 })).toEqual({
      width: 640,
      height: 480,
    });
  });

  it("builds an Esri image request with matching dimensions", () => {
    const url = new URL(
      staticMapImageUrl({ west: 10, south: 59, east: 10.01, north: 59.005 }, "satellite", {
        width: 1600,
        height: 800,
      }),
    );
    expect(url.pathname).toContain("World_Imagery/MapServer/export");
    expect(url.searchParams.get("size")).toBe("1600,800");
    expect(url.searchParams.get("bboxSR")).toBe("4326");
    expect(url.searchParams.get("format")).toBe("jpg");
    expect(url.searchParams.get("compressionQuality")).toBe("92");
  });
});
