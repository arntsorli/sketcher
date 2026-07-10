import type { BuildingDefinition, Vec2, Wall } from "./model";

const EPSILON = 1e-6;

export function distance(a: Vec2, b: Vec2): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

export function polygonAreaMm2(points: Vec2[]): number {
  if (points.length < 3) return 0;
  let sum = 0;
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index];
    const next = points[(index + 1) % points.length];
    if (!current || !next) continue;
    sum += current.x * next.y - next.x * current.y;
  }
  return Math.abs(sum) / 2;
}

export function polygonPerimeterMm(points: Vec2[], close = true): number {
  if (points.length < 2) return 0;
  let total = 0;
  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1];
    const current = points[index];
    if (previous && current) total += distance(previous, current);
  }
  if (close && points.length > 2) {
    const first = points[0];
    const last = points.at(-1);
    if (first && last) total += distance(last, first);
  }
  return total;
}

function orientation(a: Vec2, b: Vec2, c: Vec2): number {
  return (b.y - a.y) * (c.x - b.x) - (b.x - a.x) * (c.y - b.y);
}

function pointOnSegment(point: Vec2, start: Vec2, end: Vec2, tolerance = EPSILON): boolean {
  const cross = (point.y - start.y) * (end.x - start.x) - (point.x - start.x) * (end.y - start.y);
  if (Math.abs(cross) > tolerance * Math.max(1, distance(start, end))) return false;
  return (
    point.x <= Math.max(start.x, end.x) + tolerance &&
    point.x >= Math.min(start.x, end.x) - tolerance &&
    point.y <= Math.max(start.y, end.y) + tolerance &&
    point.y >= Math.min(start.y, end.y) - tolerance
  );
}

export function segmentsIntersect(a: Vec2, b: Vec2, c: Vec2, d: Vec2): boolean {
  const o1 = orientation(a, b, c);
  const o2 = orientation(a, b, d);
  const o3 = orientation(c, d, a);
  const o4 = orientation(c, d, b);
  if (o1 * o2 < 0 && o3 * o4 < 0) return true;
  if (Math.abs(o1) < EPSILON && pointOnSegment(c, a, b)) return true;
  if (Math.abs(o2) < EPSILON && pointOnSegment(d, a, b)) return true;
  if (Math.abs(o3) < EPSILON && pointOnSegment(a, c, d)) return true;
  if (Math.abs(o4) < EPSILON && pointOnSegment(b, c, d)) return true;
  return false;
}

export function validatePolygon(points: Vec2[]): string | null {
  if (points.length < 3) return "A foundation needs at least three points.";
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index];
    const next = points[(index + 1) % points.length];
    if (current && next && distance(current, next) < 1) {
      return "Foundation edges must be at least 1 mm long.";
    }
  }
  for (let first = 0; first < points.length; first += 1) {
    const a = points[first];
    const b = points[(first + 1) % points.length];
    if (!a || !b) continue;
    for (let second = first + 1; second < points.length; second += 1) {
      if (Math.abs(first - second) <= 1) continue;
      if (first === 0 && second === points.length - 1) continue;
      const c = points[second];
      const d = points[(second + 1) % points.length];
      if (c && d && segmentsIntersect(a, b, c, d)) {
        return "Foundation edges cannot cross.";
      }
    }
  }
  if (polygonAreaMm2(points) < 1) return "Foundation area must be greater than zero.";
  return null;
}

export function snapToGrid(point: Vec2, spacing: number): Vec2 {
  return {
    x: Math.round(point.x / spacing) * spacing,
    y: Math.round(point.y / spacing) * spacing,
  };
}

export function lockToConstructionAxis(origin: Vec2, point: Vec2, angleDegrees: number): Vec2 {
  const angle = (angleDegrees * Math.PI) / 180;
  const direction = { x: Math.cos(angle), y: Math.sin(angle) };
  const perpendicular = { x: -direction.y, y: direction.x };
  const delta = { x: point.x - origin.x, y: point.y - origin.y };
  const along = delta.x * direction.x + delta.y * direction.y;
  const across = delta.x * perpendicular.x + delta.y * perpendicular.y;
  const axis = Math.abs(along) >= Math.abs(across) ? direction : perpendicular;
  const projection = delta.x * axis.x + delta.y * axis.y;
  return { x: origin.x + axis.x * projection, y: origin.y + axis.y * projection };
}

export function pointAtLength(origin: Vec2, toward: Vec2, lengthMm: number): Vec2 {
  const currentLength = distance(origin, toward);
  if (currentLength < EPSILON) return { x: origin.x + lengthMm, y: origin.y };
  return {
    x: origin.x + ((toward.x - origin.x) / currentLength) * lengthMm,
    y: origin.y + ((toward.y - origin.y) / currentLength) * lengthMm,
  };
}

export function isWallOnFootprint(
  start: Vec2,
  end: Vec2,
  footprint: Vec2[],
  tolerance = 5,
): boolean {
  for (let index = 0; index < footprint.length; index += 1) {
    const edgeStart = footprint[index];
    const edgeEnd = footprint[(index + 1) % footprint.length];
    if (
      edgeStart &&
      edgeEnd &&
      pointOnSegment(start, edgeStart, edgeEnd, tolerance) &&
      pointOnSegment(end, edgeStart, edgeEnd, tolerance)
    ) {
      return true;
    }
  }
  return false;
}

export function createWall(
  building: BuildingDefinition,
  floorId: string,
  start: Vec2,
  end: Vec2,
): Wall {
  const external = isWallOnFootprint(start, end, building.footprint);
  return {
    id: crypto.randomUUID(),
    floorId,
    start,
    end,
    type: external ? "external" : "internal",
    typeSource: "auto",
    thickness: external
      ? building.defaults.externalWallThickness
      : building.defaults.internalWallThickness,
    alignment: external ? "inside" : "center",
  };
}

export function calculateStair(
  floorHeight: number,
  targetMaxRiser = 180,
): {
  riserCount: number;
  riserHeight: number;
} {
  const riserCount = Math.max(1, Math.ceil(floorHeight / targetMaxRiser));
  return { riserCount, riserHeight: floorHeight / riserCount };
}

export function gablePanelRotation(
  side: -1 | 1,
  ridgeAlongX: boolean,
  pitchRadians: number,
): { x: number; y: number } {
  return ridgeAlongX ? { x: -side * pitchRadians, y: 0 } : { x: 0, y: side * pitchRadians };
}

export function formatArea(areaMm2: number, format: "m2" | "mm2"): string {
  return format === "m2"
    ? `${(areaMm2 / 1_000_000).toFixed(2)} m²`
    : `${Math.round(areaMm2).toLocaleString()} mm²`;
}
