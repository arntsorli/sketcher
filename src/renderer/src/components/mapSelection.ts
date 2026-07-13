export type MapImageMode = "map" | "satellite";
export type PolygonPoint = [longitude: number, latitude: number];

export interface MapBounds {
  west: number;
  south: number;
  east: number;
  north: number;
}

export interface SelectionDimensions {
  width: number;
  height: number;
  area: number;
}

export const MAX_SELECTION_METERS = 2_000;
export const MAX_CAPTURE_PIXELS = 4_096;
export const TARGET_CAPTURE_PIXELS_PER_METER = 8;

const ESRI_ROOT = "https://services.arcgisonline.com/ArcGIS/rest/services";

export const MAP_SOURCES = {
  map: {
    tileUrl: `${ESRI_ROOT}/World_Topo_Map/MapServer/tile/{z}/{y}/{x}`,
    attribution:
      "Esri, HERE, Garmin, FAO, NOAA, USGS, OpenStreetMap contributors, and the GIS User Community",
  },
  satellite: {
    tileUrl: `${ESRI_ROOT}/World_Imagery/MapServer/tile/{z}/{y}/{x}`,
    attribution: "Esri, Maxar, Earthstar Geographics and the GIS User Community",
  },
} satisfies Record<MapImageMode, { tileUrl: string; attribution: string }>;

export function polygonBounds(points: PolygonPoint[]): MapBounds {
  if (points.length === 0) throw new Error("A map selection needs at least one point.");
  const longitudes = points.map(([longitude]) => longitude);
  const latitudes = points.map(([, latitude]) => latitude);
  return {
    west: Math.min(...longitudes),
    south: Math.min(...latitudes),
    east: Math.max(...longitudes),
    north: Math.max(...latitudes),
  };
}

export function boundsPolygon(bounds: MapBounds): PolygonPoint[] {
  return [
    [bounds.west, bounds.south],
    [bounds.east, bounds.south],
    [bounds.east, bounds.north],
    [bounds.west, bounds.north],
  ];
}

export function polygonCenter(points: PolygonPoint[]): PolygonPoint {
  const bounds = polygonBounds(points);
  return [(bounds.west + bounds.east) / 2, (bounds.south + bounds.north) / 2];
}

export function polygonDimensionsMeters(points: PolygonPoint[]): SelectionDimensions {
  const bounds = polygonBounds(points);
  const latitude = (bounds.south + bounds.north) / 2;
  const metersPerLongitudeDegree = 111_320 * Math.cos((latitude * Math.PI) / 180);
  const width = Math.max(0, (bounds.east - bounds.west) * metersPerLongitudeDegree);
  const height = Math.max(0, (bounds.north - bounds.south) * 111_320);
  const local = points.map(([longitude, pointLatitude]) => ({
    x: (longitude - bounds.west) * metersPerLongitudeDegree,
    y: (pointLatitude - bounds.south) * 111_320,
  }));
  const doubleArea = local.reduce((total, point, index) => {
    const next = local[(index + 1) % local.length];
    return next ? total + point.x * next.y - next.x * point.y : total;
  }, 0);
  return { width, height, area: Math.abs(doubleArea) / 2 };
}

export function imageSizeForSelection(dimensions: Pick<SelectionDimensions, "width" | "height">): {
  width: number;
  height: number;
} {
  const longest = Math.max(dimensions.width, dimensions.height, 1);
  const scale = Math.min(MAX_CAPTURE_PIXELS / longest, TARGET_CAPTURE_PIXELS_PER_METER);
  return {
    width: Math.max(64, Math.round(dimensions.width * scale)),
    height: Math.max(64, Math.round(dimensions.height * scale)),
  };
}

export function staticMapImageUrl(
  bounds: MapBounds,
  mode: MapImageMode,
  size: { width: number; height: number },
): string {
  const service = mode === "satellite" ? "World_Imagery" : "World_Topo_Map";
  const url = new URL(`${ESRI_ROOT}/${service}/MapServer/export`);
  url.searchParams.set(
    "bbox",
    [bounds.west, bounds.south, bounds.east, bounds.north]
      .map((value) => value.toFixed(7))
      .join(","),
  );
  url.searchParams.set("bboxSR", "4326");
  url.searchParams.set("imageSR", "4326");
  url.searchParams.set("size", `${size.width},${size.height}`);
  url.searchParams.set("format", mode === "satellite" ? "jpg" : "png32");
  if (mode === "satellite") url.searchParams.set("compressionQuality", "92");
  url.searchParams.set("transparent", "false");
  url.searchParams.set("f", "image");
  return url.toString();
}
