import type { BuildingDefinition, Opening, Vec2, Wall } from "./model";

const EPSILON = 1e-6;
export const OPENING_SNAP_RADIUS_MM = 1200;
export const MIN_OPENING_CLEARANCE_MM = 50;

interface OpeningClearances {
  leftBoundaryOffset: number;
  rightBoundaryOffset: number;
  left: number;
  right: number;
}

interface OpeningPlacement {
  wall: Wall;
  offset: number;
  width: number;
  proximity: number;
  projection: Vec2;
  start: Vec2;
  end: Vec2;
  center: Vec2;
  clearances: OpeningClearances;
  valid: boolean;
  reason?: string;
}

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

export function validateNextPolygonPoint(points: Vec2[], next: Vec2): string | null {
  const previous = points.at(-1);
  if (!previous) return null;
  if (distance(previous, next) < 1) return "Foundation edges must be at least 1 mm long.";
  for (let index = 0; index < points.length - 2; index += 1) {
    const start = points[index];
    const end = points[index + 1];
    if (start && end && segmentsIntersect(previous, next, start, end)) {
      return "That segment crosses an existing foundation edge.";
    }
  }
  return null;
}

export function snapToGrid(point: Vec2, spacing: number): Vec2 {
  return {
    x: Math.round(point.x / spacing) * spacing,
    y: Math.round(point.y / spacing) * spacing,
  };
}

export function pointAlongWall(wall: Wall, offset: number): Vec2 {
  const length = distance(wall.start, wall.end);
  if (length < EPSILON) return wall.start;
  const clamped = Math.max(0, Math.min(length, offset));
  return {
    x: wall.start.x + ((wall.end.x - wall.start.x) / length) * clamped,
    y: wall.start.y + ((wall.end.y - wall.start.y) / length) * clamped,
  };
}

export function openingClearances(
  wall: Wall,
  openings: Opening[],
  offset: number,
  width: number,
  ignoreOpeningId?: string,
): OpeningClearances {
  const length = distance(wall.start, wall.end);
  const end = offset + width;
  const neighbours = openings
    .filter((opening) => opening.wallId === wall.id && opening.id !== ignoreOpeningId)
    .sort((left, right) => left.offset - right.offset);
  const previous = [...neighbours]
    .reverse()
    .find((opening) => opening.offset + opening.width <= offset + EPSILON);
  const next = neighbours.find((opening) => opening.offset >= end - EPSILON);
  const leftBoundaryOffset = previous ? previous.offset + previous.width : 0;
  const rightBoundaryOffset = next ? next.offset : length;
  return {
    leftBoundaryOffset,
    rightBoundaryOffset,
    left: offset - leftBoundaryOffset,
    right: rightBoundaryOffset - end,
  };
}

export function calculateOpeningPlacement(
  walls: Wall[],
  openings: Opening[],
  floorId: string,
  point: Vec2,
  width: number,
  snapRadius = OPENING_SNAP_RADIUS_MM,
  minimumClearance = MIN_OPENING_CLEARANCE_MM,
): OpeningPlacement | null {
  const candidates = walls
    .filter((wall) => wall.floorId === floorId)
    .map((wall) => {
      const length = distance(wall.start, wall.end);
      const dx = wall.end.x - wall.start.x;
      const dy = wall.end.y - wall.start.y;
      const rawOffset =
        length < EPSILON
          ? 0
          : ((point.x - wall.start.x) * dx + (point.y - wall.start.y) * dy) / length;
      const projection = pointAlongWall(wall, rawOffset);
      return { wall, length, rawOffset, projection, proximity: distance(projection, point) };
    })
    .filter((candidate) => candidate.length >= width + minimumClearance * 2)
    .sort((left, right) => left.proximity - right.proximity);
  const candidate = candidates[0];
  if (!candidate) return null;
  const offset = Math.max(
    minimumClearance,
    Math.min(candidate.length - width - minimumClearance, candidate.rawOffset - width / 2),
  );
  const clearances = openingClearances(candidate.wall, openings, offset, width);
  const validClearances =
    clearances.left >= minimumClearance - EPSILON && clearances.right >= minimumClearance - EPSILON;
  const overlaps = openings.some(
    (opening) =>
      opening.wallId === candidate.wall.id &&
      offset < opening.offset + opening.width + minimumClearance &&
      offset + width + minimumClearance > opening.offset,
  );
  const validProximity = candidate.proximity <= snapRadius;
  const reason = !validProximity
    ? `Move within ${snapRadius} mm of a wall.`
    : overlaps
      ? `Keep ${minimumClearance} mm clear of adjacent openings and wall ends.`
      : !validClearances
        ? `Keep ${minimumClearance} mm clear of adjacent openings and wall ends.`
        : undefined;
  return {
    wall: candidate.wall,
    offset,
    width,
    proximity: candidate.proximity,
    projection: candidate.projection,
    start: pointAlongWall(candidate.wall, offset),
    end: pointAlongWall(candidate.wall, offset + width),
    center: pointAlongWall(candidate.wall, offset + width / 2),
    clearances,
    valid: validProximity && validClearances && !overlaps,
    reason,
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

export function createWall(
  building: BuildingDefinition,
  floorId: string,
  start: Vec2,
  end: Vec2,
  type: Wall["type"],
): Wall {
  return {
    id: crypto.randomUUID(),
    floorId,
    start,
    end,
    type,
    thickness:
      type === "external"
        ? building.defaults.externalWallThickness
        : building.defaults.internalWallThickness,
    alignment: type === "external" ? "inside" : "center",
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

export function formatArea(areaMm2: number, format: "m2" | "mm2"): string {
  return format === "m2"
    ? `${(areaMm2 / 1_000_000).toFixed(2)} m²`
    : `${Math.round(areaMm2).toLocaleString()} mm²`;
}
