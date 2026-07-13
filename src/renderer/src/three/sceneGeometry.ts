import * as THREE from "three";
import type {
  AssetDefinition,
  BuildingDefinition,
  Opening,
  ProjectDocument,
  TerrainLayer,
  Wall,
} from "../../../shared/model";
import type { WallSolidRequest } from "../workers/geometryTypes";

const MM_TO_M = 0.001;
const JOIN_TOLERANCE_MM = 1;

function material(color: number, opacity = 1): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: 0.78,
    metalness: 0.03,
    transparent: opacity < 1,
    opacity,
  });
}

const materials = {
  slab: material(0x73808c),
  externalWall: material(0xd9d5cc),
  internalWall: material(0xc7c3ba),
  roof: material(0x59636f),
  stair: material(0xb9b0a2),
  terrain: material(0x6d7b64),
};

function shapeFromFootprint(building: BuildingDefinition, floorIndex = 0): THREE.Shape {
  const shape = new THREE.Shape();
  const first = building.footprint[0];
  if (!first) return shape;
  shape.moveTo(first.x * MM_TO_M, first.y * MM_TO_M);
  for (const point of building.footprint.slice(1)) {
    shape.lineTo(point.x * MM_TO_M, point.y * MM_TO_M);
  }
  shape.closePath();
  if (floorIndex > 0) {
    const floorBelow = building.floors.filter((floor) => floor.type === "story")[floorIndex - 1];
    for (const stair of building.stairs.filter((item) => item.floorId === floorBelow?.id)) {
      const clearance = 50;
      const halfWidth = stair.width / 2 + clearance;
      const run = stair.riserCount * stair.treadDepth + clearance * 2;
      const localCorners = [
        { x: -halfWidth, y: -stair.treadDepth / 2 - clearance },
        { x: halfWidth, y: -stair.treadDepth / 2 - clearance },
        { x: halfWidth, y: run - stair.treadDepth / 2 - clearance },
        { x: -halfWidth, y: run - stair.treadDepth / 2 - clearance },
      ];
      const cos = Math.cos(stair.rotationZ);
      const sin = Math.sin(stair.rotationZ);
      const corners = localCorners.map((corner) => ({
        x: stair.position.x + corner.x * cos - corner.y * sin,
        y: stair.position.y + corner.x * sin + corner.y * cos,
      }));
      const hole = new THREE.Path();
      const holeStart = corners[0];
      if (!holeStart) continue;
      hole.moveTo(holeStart.x * MM_TO_M, holeStart.y * MM_TO_M);
      for (const corner of corners.slice(1)) {
        hole.lineTo(corner.x * MM_TO_M, corner.y * MM_TO_M);
      }
      hole.closePath();
      shape.holes.push(hole);
    }
  }
  return shape;
}

function footprintInsideSign(wall: Wall, footprint: BuildingDefinition["footprint"]): 1 | -1 {
  const midpoint = { x: (wall.start.x + wall.end.x) / 2, y: (wall.start.y + wall.end.y) / 2 };
  const dx = wall.end.x - wall.start.x;
  const dy = wall.end.y - wall.start.y;
  const length = Math.hypot(dx, dy) || 1;
  const probe = Math.max(10, wall.thickness / 4);
  const left = { x: midpoint.x + (-dy / length) * probe, y: midpoint.y + (dx / length) * probe };
  let inside = false;
  for (
    let index = 0, previous = footprint.length - 1;
    index < footprint.length;
    previous = index++
  ) {
    const current = footprint[index];
    const prior = footprint[previous];
    if (!current || !prior) continue;
    if (
      current.y > left.y !== prior.y > left.y &&
      left.x < ((prior.x - current.x) * (left.y - current.y)) / (prior.y - current.y) + current.x
    ) {
      inside = !inside;
    }
  }
  return inside ? 1 : -1;
}

interface WallMiterProfile {
  low: number;
  high: number;
  start: { low: number; high: number };
  end: { low: number; high: number };
  hasMiter: boolean;
}

function wallOffsets(wall: Wall, insideSign: 1 | -1): { low: number; high: number } {
  if (wall.alignment === "center") {
    return { low: -wall.thickness / 2, high: wall.thickness / 2 };
  }
  const interiorOnLeft = insideSign > 0;
  if (wall.alignment === "inside") {
    return interiorOnLeft ? { low: 0, high: wall.thickness } : { low: -wall.thickness, high: 0 };
  }
  return interiorOnLeft ? { low: -wall.thickness, high: 0 } : { low: 0, high: wall.thickness };
}

function normalizedDirection(wall: Wall): { x: number; y: number; length: number } | null {
  const x = wall.end.x - wall.start.x;
  const y = wall.end.y - wall.start.y;
  const length = Math.hypot(x, y);
  return length > 0 ? { x: x / length, y: y / length, length } : null;
}

function lineIntersection(
  origin: { x: number; y: number },
  direction: { x: number; y: number },
  otherOrigin: { x: number; y: number },
  otherDirection: { x: number; y: number },
): { x: number; y: number } | null {
  const cross = direction.x * otherDirection.y - direction.y * otherDirection.x;
  if (Math.abs(cross) < 1e-6) return null;
  const deltaX = otherOrigin.x - origin.x;
  const deltaY = otherOrigin.y - origin.y;
  const scale = (deltaX * otherDirection.y - deltaY * otherDirection.x) / cross;
  return { x: origin.x + direction.x * scale, y: origin.y + direction.y * scale };
}

function samePoint(left: { x: number; y: number }, right: { x: number; y: number }): boolean {
  return Math.hypot(left.x - right.x, left.y - right.y) <= JOIN_TOLERANCE_MM;
}

function endpointJoinCandidates(wall: Wall, endpoint: "start" | "end", walls: Wall[]): Wall[] {
  const vertex = wall[endpoint];
  return walls.filter((candidate) => {
    if (candidate.id === wall.id || candidate.floorId !== wall.floorId) return false;
    return samePoint(vertex, candidate.start) || samePoint(vertex, candidate.end);
  });
}

export function calculateWallMiterProfile(
  wall: Wall,
  walls: Wall[],
  footprint: BuildingDefinition["footprint"],
): WallMiterProfile {
  const direction = normalizedDirection(wall);
  const insideSign = wall.type === "external" ? footprintInsideSign(wall, footprint) : 1;
  const offsets = wallOffsets(wall, insideSign);
  const base = {
    low: offsets.low,
    high: offsets.high,
    start: { low: 0, high: 0 },
    end: { low: direction?.length ?? 0, high: direction?.length ?? 0 },
    hasMiter: false,
  };
  if (!direction || wall.type !== "external") return base;
  const normal = { x: -direction.y, y: direction.x };
  const insideOffset = insideSign > 0 ? offsets.high : offsets.low;

  const cutEndpoint = (endpoint: "start" | "end") => {
    const candidates = endpointJoinCandidates(wall, endpoint, walls).filter(
      (candidate) => candidate.type === "external",
    );
    if (candidates.length !== 1) return base[endpoint];
    const mate = candidates[0];
    if (!mate) return base[endpoint];
    const mateDirection = normalizedDirection(mate);
    if (!mateDirection) return base[endpoint];
    const mateInsideSign = footprintInsideSign(mate, footprint);
    const mateOffsets = wallOffsets(mate, mateInsideSign);
    const mateInsideOffset = mateInsideSign > 0 ? mateOffsets.high : mateOffsets.low;
    const mateNormal = { x: -mateDirection.y, y: mateDirection.x };
    const vertex = wall[endpoint];
    const baseX = endpoint === "start" ? 0 : direction.length;
    const intersectFor = (offset: number) => {
      const sameFace = Math.abs(offset - insideOffset) < JOIN_TOLERANCE_MM;
      const mateOffset = sameFace
        ? mateInsideOffset
        : mateInsideSign > 0
          ? mateOffsets.low
          : mateOffsets.high;
      const intersection = lineIntersection(
        { x: vertex.x + normal.x * offset, y: vertex.y + normal.y * offset },
        direction,
        { x: vertex.x + mateNormal.x * mateOffset, y: vertex.y + mateNormal.y * mateOffset },
        mateDirection,
      );
      if (!intersection) return baseX;
      const localX =
        (intersection.x - wall.start.x) * direction.x +
        (intersection.y - wall.start.y) * direction.y;
      const maximumMiter = Math.max(1000, wall.thickness * 4, mate.thickness * 4);
      return Math.abs(localX - baseX) <= maximumMiter ? localX : baseX;
    };
    return { low: intersectFor(offsets.low), high: intersectFor(offsets.high) };
  };

  const start = cutEndpoint("start");
  const end = cutEndpoint("end");
  return {
    ...base,
    start,
    end,
    hasMiter:
      Math.abs(start.low) > JOIN_TOLERANCE_MM ||
      Math.abs(start.high) > JOIN_TOLERANCE_MM ||
      Math.abs(end.low - direction.length) > JOIN_TOLERANCE_MM ||
      Math.abs(end.high - direction.length) > JOIN_TOLERANCE_MM,
  };
}

function boxPiece(
  group: THREE.Group,
  wall: Wall,
  insideSign: 1 | -1,
  miter: WallMiterProfile | undefined,
  startAlong: number,
  width: number,
  baseHeight: number,
  height: number,
): void {
  if (width <= 0 || height <= 0) return;
  if (miter) {
    const fullLength = normalizedDirection(wall)?.length ?? 0;
    const endAlong = startAlong + width;
    const startLow = Math.abs(startAlong) < JOIN_TOLERANCE_MM ? miter.start.low : startAlong;
    const startHigh = Math.abs(startAlong) < JOIN_TOLERANCE_MM ? miter.start.high : startAlong;
    const endLow = Math.abs(endAlong - fullLength) < JOIN_TOLERANCE_MM ? miter.end.low : endAlong;
    const endHigh = Math.abs(endAlong - fullLength) < JOIN_TOLERANCE_MM ? miter.end.high : endAlong;
    const shape = new THREE.Shape();
    shape.moveTo(startLow * MM_TO_M, miter.low * MM_TO_M);
    shape.lineTo(endLow * MM_TO_M, miter.low * MM_TO_M);
    shape.lineTo(endHigh * MM_TO_M, miter.high * MM_TO_M);
    shape.lineTo(startHigh * MM_TO_M, miter.high * MM_TO_M);
    shape.closePath();
    const mesh = new THREE.Mesh(
      new THREE.ExtrudeGeometry(shape, { depth: height * MM_TO_M, bevelEnabled: false }),
      wall.type === "external" ? materials.externalWall : materials.internalWall,
    );
    mesh.position.z = baseHeight * MM_TO_M;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    return;
  }
  const centerAlong = startAlong + width / 2;
  const geometry = new THREE.BoxGeometry(
    width * MM_TO_M,
    wall.thickness * MM_TO_M,
    height * MM_TO_M,
  );
  const mesh = new THREE.Mesh(
    geometry,
    wall.type === "external" ? materials.externalWall : materials.internalWall,
  );
  const yOffset =
    wall.alignment === "inside"
      ? (insideSign * wall.thickness) / 2
      : wall.alignment === "outside"
        ? (-insideSign * wall.thickness) / 2
        : 0;
  mesh.position.set(centerAlong * MM_TO_M, yOffset * MM_TO_M, (baseHeight + height / 2) * MM_TO_M);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);
}

function wallWithOpenings(
  group: THREE.Group,
  footprint: BuildingDefinition["footprint"],
  wall: Wall,
  walls: Wall[],
  openings: Opening[],
  floorElevation: number,
  floorHeight: number,
): void {
  const length = Math.hypot(wall.end.x - wall.start.x, wall.end.y - wall.start.y);
  const insideSign = wall.type === "external" ? footprintInsideSign(wall, footprint) : 1;
  const miter = calculateWallMiterProfile(wall, walls, footprint);
  const sorted = openings
    .filter((opening) => opening.wallId === wall.id)
    .sort((left, right) => left.offset - right.offset);
  const wallGroup = new THREE.Group();
  wallGroup.position.set(wall.start.x * MM_TO_M, wall.start.y * MM_TO_M, floorElevation * MM_TO_M);
  wallGroup.rotation.z = Math.atan2(wall.end.y - wall.start.y, wall.end.x - wall.start.x);
  const manifoldRequest: WallSolidRequest = {
    length,
    thickness: wall.thickness,
    height: floorHeight,
    alignment: wall.alignment,
    insideSign,
    openings: sorted.map((opening) => ({
      offset: opening.offset,
      width: opening.width,
      height: opening.height,
      sillHeight: opening.sillHeight,
    })),
  };
  wallGroup.userData = {
    entityType: "wall",
    entityId: wall.id,
    wallType: wall.type,
    ...(miter.hasMiter ? {} : { manifoldRequest }),
    joinery: miter.hasMiter ? "miter-fallback" : undefined,
  };
  group.add(wallGroup);
  let cursor = 0;
  for (const opening of sorted) {
    boxPiece(
      wallGroup,
      wall,
      insideSign,
      miter.hasMiter ? miter : undefined,
      cursor,
      opening.offset - cursor,
      0,
      floorHeight,
    );
    boxPiece(
      wallGroup,
      wall,
      insideSign,
      miter.hasMiter ? miter : undefined,
      opening.offset,
      opening.width,
      0,
      opening.sillHeight,
    );
    const top = opening.sillHeight + opening.height;
    boxPiece(
      wallGroup,
      wall,
      insideSign,
      miter.hasMiter ? miter : undefined,
      opening.offset,
      opening.width,
      top,
      floorHeight - top,
    );
    cursor = Math.max(cursor, opening.offset + opening.width);
  }
  boxPiece(
    wallGroup,
    wall,
    insideSign,
    miter.hasMiter ? miter : undefined,
    cursor,
    length - cursor,
    0,
    floorHeight,
  );
}

interface RoofPoint {
  x: number;
  y: number;
}

export interface AutomaticRoofModule {
  minU: number;
  maxU: number;
  minV: number;
  maxV: number;
  ridgeAxis: "u" | "v";
  primary: boolean;
}

export interface AutomaticRoofLayout {
  axisU: RoofPoint;
  axisV: RoofPoint;
  modules: AutomaticRoofModule[];
}

interface RoofCandidate extends Omit<AutomaticRoofModule, "ridgeAxis" | "primary"> {
  cells: Set<string>;
}

function signedPolygonArea(points: RoofPoint[]): number {
  return (
    points.reduce((sum, point, index) => {
      const next = points[(index + 1) % points.length];
      return next ? sum + point.x * next.y - next.x * point.y : sum;
    }, 0) / 2
  );
}

function pointInsidePolygon(point: RoofPoint, polygon: RoofPoint[]): boolean {
  let inside = false;
  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index++) {
    const current = polygon[index];
    const prior = polygon[previous];
    if (!current || !prior) continue;
    if (
      current.y > point.y !== prior.y > point.y &&
      point.x < ((prior.x - current.x) * (point.y - current.y)) / (prior.y - current.y) + current.x
    ) {
      inside = !inside;
    }
  }
  return inside;
}

function localPoint(point: RoofPoint, layout: Pick<AutomaticRoofLayout, "axisU" | "axisV">) {
  return {
    x: point.x * layout.axisU.x + point.y * layout.axisU.y,
    y: point.x * layout.axisV.x + point.y * layout.axisV.y,
  };
}

function uniqueCoordinates(values: number[]): number[] {
  return [...new Set(values.map((value) => Math.round(value * 1000) / 1000))].sort(
    (left, right) => left - right,
  );
}

function candidateRuns(cells: boolean[][], us: number[], vs: number[]): RoofCandidate[] {
  const candidates: RoofCandidate[] = [];
  const scan = (transpose: boolean) => {
    const outerCount = transpose ? us.length - 1 : vs.length - 1;
    const innerCount = transpose ? vs.length - 1 : us.length - 1;
    let active = new Map<string, RoofCandidate>();
    for (let outer = 0; outer < outerCount; outer += 1) {
      const runs: Array<{ start: number; end: number }> = [];
      let start = -1;
      for (let inner = 0; inner <= innerCount; inner += 1) {
        const occupied =
          inner < innerCount &&
          (transpose ? Boolean(cells[inner]?.[outer]) : Boolean(cells[outer]?.[inner]));
        if (occupied && start < 0) start = inner;
        if (!occupied && start >= 0) {
          runs.push({ start, end: inner });
          start = -1;
        }
      }
      const nextActive = new Map<string, RoofCandidate>();
      for (const run of runs) {
        const key = `${run.start}:${run.end}`;
        const existing = active.get(key);
        const candidate: RoofCandidate =
          existing ??
          (transpose
            ? {
                minU: us[outer] ?? 0,
                maxU: us[outer + 1] ?? 0,
                minV: vs[run.start] ?? 0,
                maxV: vs[run.end] ?? 0,
                cells: new Set<string>(),
              }
            : {
                minU: us[run.start] ?? 0,
                maxU: us[run.end] ?? 0,
                minV: vs[outer] ?? 0,
                maxV: vs[outer + 1] ?? 0,
                cells: new Set<string>(),
              });
        if (transpose) candidate.maxU = us[outer + 1] ?? candidate.maxU;
        else candidate.maxV = vs[outer + 1] ?? candidate.maxV;
        for (let inner = run.start; inner < run.end; inner += 1) {
          const uIndex = transpose ? outer : inner;
          const vIndex = transpose ? inner : outer;
          candidate.cells.add(`${uIndex}:${vIndex}`);
        }
        nextActive.set(key, candidate);
      }
      for (const [key, candidate] of active) {
        if (!nextActive.has(key)) candidates.push(candidate);
      }
      active = nextActive;
    }
    candidates.push(...active.values());
  };
  scan(false);
  scan(true);
  const unique = new Map<string, RoofCandidate>();
  for (const candidate of candidates) {
    const key = [candidate.minU, candidate.maxU, candidate.minV, candidate.maxV].join(":");
    const existing = unique.get(key);
    if (existing)
      candidate.cells.forEach((cell) => {
        existing.cells.add(cell);
      });
    else unique.set(key, candidate);
  }
  return [...unique.values()];
}

export function deriveAutomaticRoofLayout(footprint: RoofPoint[]): AutomaticRoofLayout {
  let longest = { x: 1, y: 0, length: 0 };
  for (let index = 0; index < footprint.length; index += 1) {
    const start = footprint[index];
    const end = footprint[(index + 1) % footprint.length];
    if (!start || !end) continue;
    const x = end.x - start.x;
    const y = end.y - start.y;
    const length = Math.hypot(x, y);
    if (length > longest.length) longest = { x: x / length, y: y / length, length };
  }
  if (longest.x < -1e-6 || (Math.abs(longest.x) < 1e-6 && longest.y < 0)) {
    longest.x *= -1;
    longest.y *= -1;
  }
  const layout = {
    axisU: { x: longest.x, y: longest.y },
    axisV: { x: -longest.y, y: longest.x },
  };
  const local = footprint.map((point) => localPoint(point, layout));
  const us = uniqueCoordinates(local.map((point) => point.x));
  const vs = uniqueCoordinates(local.map((point) => point.y));
  const fallback: AutomaticRoofModule = {
    minU: Math.min(...local.map((point) => point.x)),
    maxU: Math.max(...local.map((point) => point.x)),
    minV: Math.min(...local.map((point) => point.y)),
    maxV: Math.max(...local.map((point) => point.y)),
    ridgeAxis: "u",
    primary: true,
  };
  const orthogonal = local.every((point, index) => {
    const next = local[(index + 1) % local.length];
    return next ? Math.abs(next.x - point.x) < 1 || Math.abs(next.y - point.y) < 1 : true;
  });
  if (!orthogonal || us.length < 2 || vs.length < 2) return { ...layout, modules: [fallback] };
  const cells = Array.from({ length: vs.length - 1 }, (_, vIndex) =>
    Array.from({ length: us.length - 1 }, (_, uIndex) =>
      pointInsidePolygon(
        {
          x: ((us[uIndex] ?? 0) + (us[uIndex + 1] ?? 0)) / 2,
          y: ((vs[vIndex] ?? 0) + (vs[vIndex + 1] ?? 0)) / 2,
        },
        local,
      ),
    ),
  );
  const uncovered = new Set<string>();
  cells.forEach((row, vIndex) => {
    row.forEach((occupied, uIndex) => {
      if (occupied) uncovered.add(`${uIndex}:${vIndex}`);
    });
  });
  const candidates = candidateRuns(cells, us, vs);
  const score = (candidate: RoofCandidate) =>
    [...candidate.cells].reduce((sum, cell) => {
      if (!uncovered.has(cell)) return sum;
      const [uIndex, vIndex] = cell.split(":").map(Number);
      return (
        sum +
        ((us[(uIndex ?? 0) + 1] ?? 0) - (us[uIndex ?? 0] ?? 0)) *
          ((vs[(vIndex ?? 0) + 1] ?? 0) - (vs[vIndex ?? 0] ?? 0))
      );
    }, 0);
  const totalArea = (candidate: RoofCandidate) =>
    (candidate.maxU - candidate.minU) * (candidate.maxV - candidate.minV);
  const primaryPool = candidates.filter(
    (candidate) => candidate.maxU - candidate.minU >= candidate.maxV - candidate.minV,
  );
  const primary = (primaryPool.length ? primaryPool : candidates).sort(
    (left, right) => totalArea(right) - totalArea(left),
  )[0];
  if (!primary) return { ...layout, modules: [fallback] };
  const chosen: RoofCandidate[] = [primary];
  primary.cells.forEach((cell) => {
    uncovered.delete(cell);
  });
  while (uncovered.size > 0 && chosen.length < 8) {
    const next = candidates
      .filter((candidate) => !chosen.includes(candidate))
      .sort((left, right) => score(right) - score(left) || totalArea(right) - totalArea(left))[0];
    if (!next || score(next) <= 0) break;
    chosen.push(next);
    next.cells.forEach((cell) => {
      uncovered.delete(cell);
    });
  }
  return {
    ...layout,
    modules: chosen.map((candidate, index) => ({
      minU: candidate.minU,
      maxU: candidate.maxU,
      minV: candidate.minV,
      maxV: candidate.maxV,
      ridgeAxis:
        index === 0 || candidate.maxU - candidate.minU >= candidate.maxV - candidate.minV
          ? "u"
          : "v",
      primary: index === 0,
    })),
  };
}

function offsetFootprint(footprint: RoofPoint[], distance: number): RoofPoint[] {
  if (distance <= 0 || footprint.length < 3) return footprint.map((point) => ({ ...point }));
  const ccw = signedPolygonArea(footprint) > 0;
  return footprint.map((point, index) => {
    const previous = footprint[(index - 1 + footprint.length) % footprint.length];
    const next = footprint[(index + 1) % footprint.length];
    if (!previous || !next) return { ...point };
    const previousDirection = { x: point.x - previous.x, y: point.y - previous.y };
    const nextDirection = { x: next.x - point.x, y: next.y - point.y };
    const previousLength = Math.hypot(previousDirection.x, previousDirection.y) || 1;
    const nextLength = Math.hypot(nextDirection.x, nextDirection.y) || 1;
    previousDirection.x /= previousLength;
    previousDirection.y /= previousLength;
    nextDirection.x /= nextLength;
    nextDirection.y /= nextLength;
    const outward = (direction: RoofPoint) =>
      ccw ? { x: direction.y, y: -direction.x } : { x: -direction.y, y: direction.x };
    const previousNormal = outward(previousDirection);
    const nextNormal = outward(nextDirection);
    const intersection = lineIntersection(
      {
        x: point.x + previousNormal.x * distance,
        y: point.y + previousNormal.y * distance,
      },
      previousDirection,
      { x: point.x + nextNormal.x * distance, y: point.y + nextNormal.y * distance },
      nextDirection,
    );
    if (
      intersection &&
      Math.hypot(intersection.x - point.x, intersection.y - point.y) < distance * 6
    ) {
      return intersection;
    }
    const average = {
      x: previousNormal.x + nextNormal.x,
      y: previousNormal.y + nextNormal.y,
    };
    const averageLength = Math.hypot(average.x, average.y) || 1;
    return {
      x: point.x + (average.x / averageLength) * distance,
      y: point.y + (average.y / averageLength) * distance,
    };
  });
}

function refineRoofTriangle(
  a: RoofPoint,
  b: RoofPoint,
  c: RoofPoint,
  output: Array<[RoofPoint, RoofPoint, RoofPoint]>,
  depth = 0,
): void {
  const edges = [
    { length: Math.hypot(b.x - a.x, b.y - a.y), start: a, end: b, other: c },
    { length: Math.hypot(c.x - b.x, c.y - b.y), start: b, end: c, other: a },
    { length: Math.hypot(a.x - c.x, a.y - c.y), start: c, end: a, other: b },
  ].sort((left, right) => right.length - left.length);
  const edge = edges[0];
  if (!edge || edge.length <= 400 || depth >= 7) {
    output.push([a, b, c]);
    return;
  }
  const midpoint = { x: (edge.start.x + edge.end.x) / 2, y: (edge.start.y + edge.end.y) / 2 };
  refineRoofTriangle(edge.start, midpoint, edge.other, output, depth + 1);
  refineRoofTriangle(midpoint, edge.end, edge.other, output, depth + 1);
}

function addRoof(group: THREE.Group, building: BuildingDefinition): void {
  const roof = building.roof;
  const roofFloor = building.floors.find((floor) => floor.id === roof?.floorId);
  if (!roof || !roofFloor) return;
  const layout = deriveAutomaticRoofLayout(building.footprint);
  const footprint = offsetFootprint(building.footprint, Math.max(0, roof.overhang));
  const vectors = footprint.map((point) => new THREE.Vector2(point.x, point.y));
  const triangles = THREE.ShapeUtils.triangulateShape(vectors, []);
  const refined: Array<[RoofPoint, RoofPoint, RoofPoint]> = [];
  for (const triangle of triangles) {
    const a = footprint[triangle[0] ?? 0];
    const b = footprint[triangle[1] ?? 0];
    const c = footprint[triangle[2] ?? 0];
    if (a && b && c) refineRoofTriangle(a, b, c, refined);
  }
  const baseZ = roofFloor.elevation;
  const slope = Math.tan((roof.pitchDegrees * Math.PI) / 180);
  const topHeight = (point: RoofPoint) => {
    const local = localPoint(point, layout);
    let height = baseZ + roof.thickness;
    for (const module of layout.modules) {
      const minU = module.minU - roof.overhang;
      const maxU = module.maxU + roof.overhang;
      const minV = module.minV - roof.overhang;
      const maxV = module.maxV + roof.overhang;
      if (local.x < minU - 1 || local.x > maxU + 1 || local.y < minV - 1 || local.y > maxV + 1)
        continue;
      const run =
        module.ridgeAxis === "u"
          ? Math.min(local.y - minV, maxV - local.y)
          : Math.min(local.x - minU, maxU - local.x);
      height = Math.max(height, baseZ + roof.thickness + Math.max(0, run) * slope);
    }
    return height;
  };
  const positions: number[] = [];
  const pushTriangle = (
    a: RoofPoint,
    b: RoofPoint,
    c: RoofPoint,
    z: (point: RoofPoint) => number,
  ) => {
    const cross = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
    const ordered = cross >= 0 ? [a, b, c] : [a, c, b];
    for (const point of ordered)
      positions.push(point.x * MM_TO_M, point.y * MM_TO_M, z(point) * MM_TO_M);
  };
  refined.forEach(([a, b, c]) => {
    pushTriangle(a, b, c, topHeight);
  });
  triangles.forEach((triangle) => {
    const a = footprint[triangle[0] ?? 0];
    const b = footprint[triangle[1] ?? 0];
    const c = footprint[triangle[2] ?? 0];
    if (a && b && c) pushTriangle(a, c, b, () => baseZ);
  });
  const ccw = signedPolygonArea(footprint) > 0;
  for (let index = 0; index < footprint.length; index += 1) {
    const start = footprint[index];
    const end = footprint[(index + 1) % footprint.length];
    if (!start || !end) continue;
    const steps = Math.max(1, Math.ceil(Math.hypot(end.x - start.x, end.y - start.y) / 400));
    for (let step = 0; step < steps; step += 1) {
      const at = (amount: number) => ({
        x: start.x + (end.x - start.x) * amount,
        y: start.y + (end.y - start.y) * amount,
      });
      const a = at(step / steps);
      const b = at((step + 1) / steps);
      const vertices = ccw ? [a, b] : [b, a];
      const first = vertices[0];
      const second = vertices[1];
      if (!first || !second) continue;
      positions.push(
        first.x * MM_TO_M,
        first.y * MM_TO_M,
        baseZ * MM_TO_M,
        second.x * MM_TO_M,
        second.y * MM_TO_M,
        baseZ * MM_TO_M,
        second.x * MM_TO_M,
        second.y * MM_TO_M,
        topHeight(second) * MM_TO_M,
        first.x * MM_TO_M,
        first.y * MM_TO_M,
        baseZ * MM_TO_M,
        second.x * MM_TO_M,
        second.y * MM_TO_M,
        topHeight(second) * MM_TO_M,
        first.x * MM_TO_M,
        first.y * MM_TO_M,
        topHeight(first) * MM_TO_M,
      );
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(geometry, materials.roof);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.userData = {
    entityType: "roof",
    entityId: roof.floorId,
    roofModuleCount: layout.modules.length,
    ridgeDirection: layout.axisU,
  };
  group.add(mesh);
}

export function createBuildingGroup(
  building: BuildingDefinition,
  builderFloorId?: string,
): THREE.Group {
  const group = new THREE.Group();
  group.name = building.name;
  const storyFloors = building.floors.filter((item) => item.type === "story");
  const selectedFloor = building.floors.find((floor) => floor.id === builderFloorId);
  const highestVisibleStory =
    selectedFloor?.type === "story"
      ? storyFloors.findIndex((floor) => floor.id === selectedFloor.id)
      : Number.POSITIVE_INFINITY;
  for (const [floorIndex, floor] of storyFloors.entries()) {
    if (floorIndex > highestVisibleStory) continue;
    const shape = shapeFromFootprint(building, floorIndex);
    const slab = new THREE.Mesh(
      new THREE.ExtrudeGeometry(shape, {
        depth: floor.slabThickness * MM_TO_M,
        bevelEnabled: false,
      }),
      materials.slab,
    );
    slab.position.z = floor.elevation * MM_TO_M;
    slab.receiveShadow = true;
    slab.userData = { entityType: "floor", entityId: floor.id };
    group.add(slab);
    for (const wall of building.walls.filter((item) => item.floorId === floor.id)) {
      wallWithOpenings(
        group,
        building.footprint,
        wall,
        building.walls,
        building.openings,
        floor.elevation + floor.slabThickness,
        floor.height,
      );
    }
    for (const stair of building.stairs.filter((item) => item.floorId === floor.id)) {
      const riserHeight = floor.height / stair.riserCount;
      for (let index = 0; index < stair.riserCount; index += 1) {
        const stepHeight = riserHeight * (index + 1);
        const geometry = new THREE.BoxGeometry(
          stair.width * MM_TO_M,
          stair.treadDepth * MM_TO_M,
          stepHeight * MM_TO_M,
        );
        const step = new THREE.Mesh(geometry, materials.stair);
        step.position.set(
          stair.position.x * MM_TO_M,
          (stair.position.y + index * stair.treadDepth) * MM_TO_M,
          (floor.elevation + floor.slabThickness + stepHeight / 2) * MM_TO_M,
        );
        step.rotation.z = stair.rotationZ;
        step.castShadow = true;
        step.userData = { entityType: "stair", entityId: stair.id };
        group.add(step);
      }
    }
  }
  if (!builderFloorId || selectedFloor?.type === "roof") addRoof(group, building);
  return group;
}

export function createBuiltinAsset(definition: AssetDefinition): THREE.Group {
  const group = new THREE.Group();
  const trunk = material(0x76543a);
  const green = material(0x47734e);
  const darkGreen = material(0x315f42);
  const blue = material(0x42627f);
  const skin = material(0xd0a47c);
  if (definition.kind === "polygon-face" && definition.polygon) {
    const shape = new THREE.Shape();
    definition.polygon.points.forEach((point, index) => {
      if (index === 0) shape.moveTo(point.x * MM_TO_M, point.y * MM_TO_M);
      else shape.lineTo(point.x * MM_TO_M, point.y * MM_TO_M);
    });
    shape.closePath();
    const height = definition.polygon.extrusionHeight * MM_TO_M;
    const geometry =
      height > 0
        ? new THREE.ExtrudeGeometry(shape, { depth: height, bevelEnabled: false })
        : new THREE.ShapeGeometry(shape);
    group.add(new THREE.Mesh(geometry, material(0x9b7653)));
  } else if (definition.kind === "car") {
    const body = new THREE.Mesh(new THREE.BoxGeometry(4.2, 1.8, 1.1), blue);
    body.position.z = 0.75;
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.55, 0.75), material(0x9fb5c2));
    cabin.position.set(-0.2, 0, 1.55);
    group.add(body, cabin);
  } else if (definition.kind === "deciduous-tree") {
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.3, 3.8, 10), trunk);
    stem.rotation.x = Math.PI / 2;
    stem.position.z = 1.9;
    const crown = new THREE.Mesh(new THREE.IcosahedronGeometry(1.8, 2), green);
    crown.position.z = 4.4;
    group.add(stem, crown);
  } else if (definition.kind === "conifer") {
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.28, 3.6, 10), trunk);
    stem.rotation.x = Math.PI / 2;
    stem.position.z = 1.8;
    const crown = new THREE.Mesh(new THREE.ConeGeometry(1.7, 5.3, 14), darkGreen);
    crown.rotation.x = Math.PI / 2;
    crown.position.z = 3.4;
    group.add(stem, crown);
  } else if (definition.kind === "birch-tree") {
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.2, 5.5, 10), material(0xdfdfd5));
    stem.rotation.x = Math.PI / 2;
    stem.position.z = 2.75;
    const crown = new THREE.Mesh(new THREE.DodecahedronGeometry(1.7, 1), material(0x6d9251));
    crown.position.z = 5.7;
    group.add(stem, crown);
  } else if (definition.kind === "hedge-segment") {
    const hedge = new THREE.Mesh(new THREE.BoxGeometry(3, 0.55, 1.65), green);
    hedge.position.z = 0.825;
    const top = new THREE.Mesh(new THREE.CapsuleGeometry(0.275, 2.45, 4, 10), darkGreen);
    top.rotation.z = Math.PI / 2;
    top.position.z = 1.5;
    group.add(hedge, top);
  } else if (definition.kind === "fence-segment") {
    const railMaterial = material(0x826449);
    for (const x of [-1.5, -0.75, 0, 0.75, 1.5]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.09, 1.2), railMaterial);
      post.position.set(x, 0, 0.6);
      group.add(post);
    }
    for (const z of [0.35, 0.9]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(3.1, 0.08, 0.08), railMaterial);
      rail.position.z = z;
      group.add(rail);
    }
  } else if (definition.kind === "garbage-shed") {
    const shed = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.5, 1.8), material(0x65766e));
    shed.position.z = 0.9;
    const roof = new THREE.Mesh(new THREE.BoxGeometry(2.7, 1.8, 0.16), material(0x394149));
    roof.position.z = 1.86;
    group.add(shed, roof);
  } else if (definition.kind === "flag-pole") {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.075, 7, 12), material(0xc9d0d4));
    pole.rotation.x = Math.PI / 2;
    pole.position.z = 3.5;
    const flag = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.9), material(0xc9444a));
    flag.position.set(0.72, 0, 6.35);
    flag.rotation.x = Math.PI / 2;
    group.add(pole, flag);
  } else if (definition.kind === "person") {
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.25, 1.1, 6, 12), material(0x626d8c));
    body.rotation.x = Math.PI / 2;
    body.position.z = 0.9;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 16, 12), skin);
    head.position.z = 1.75;
    group.add(body, head);
  } else if (definition.kind === "plane") {
    const plane = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 0.04), material(0x8094a2));
    plane.position.z = 0.02;
    group.add(plane);
  } else if (definition.kind === "sphere") {
    const sphere = new THREE.Mesh(new THREE.SphereGeometry(0.6, 24, 16), material(0x7f91ac));
    sphere.position.z = 0.6;
    group.add(sphere);
  } else if (definition.kind === "cylinder") {
    const cylinder = new THREE.Mesh(
      new THREE.CylinderGeometry(0.5, 0.5, 1.2, 24),
      material(0x7f91ac),
    );
    cylinder.position.z = 0.6;
    group.add(cylinder);
  } else if (definition.kind === "cone") {
    const cone = new THREE.Mesh(new THREE.ConeGeometry(0.65, 1.4, 24), material(0x7f91ac));
    cone.position.z = 0.7;
    group.add(cone);
  } else {
    const box = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), material(0xa78b63));
    box.position.z = 0.5;
    group.add(box);
  }
  group.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      child.castShadow = true;
      child.receiveShadow = true;
    }
  });
  return group;
}

export function createTerrainMesh(layer: TerrainLayer, imageryBase64?: string): THREE.Mesh {
  const [columns, rows] = layer.gridSize;
  const [west, south, east, north] = layer.boundsWgs84;
  const geometry = layer.clipPolygonWgs84
    ? (() => {
        const shape = new THREE.Shape();
        layer.clipPolygonWgs84.forEach(([longitude, latitude], index) => {
          const x =
            ((longitude - west) / Math.max(Number.EPSILON, east - west) - 0.5) *
            layer.widthMm *
            MM_TO_M;
          const y =
            ((latitude - south) / Math.max(Number.EPSILON, north - south) - 0.5) *
            layer.heightMm *
            MM_TO_M;
          if (index === 0) shape.moveTo(x, y);
          else shape.lineTo(x, y);
        });
        shape.closePath();
        return new THREE.ShapeGeometry(shape);
      })()
    : new THREE.PlaneGeometry(
        layer.widthMm * MM_TO_M,
        layer.heightMm * MM_TO_M,
        Math.max(1, columns - 1),
        Math.max(1, rows - 1),
      );
  const positions = geometry.getAttribute("position");
  if (layer.clipPolygonWgs84) {
    const uvs = geometry.getAttribute("uv");
    for (let index = 0; index < positions.count; index += 1) {
      uvs.setXY(
        index,
        positions.getX(index) / (layer.widthMm * MM_TO_M) + 0.5,
        positions.getY(index) / (layer.heightMm * MM_TO_M) + 0.5,
      );
    }
    uvs.needsUpdate = true;
  }
  const elevations = layer.elevationsMm;
  if (elevations && !layer.clipPolygonWgs84) {
    for (let index = 0; index < Math.min(positions.count, elevations.length); index += 1) {
      positions.setZ(index, ((elevations[index] ?? 0) + layer.verticalOffset) * MM_TO_M);
    }
    positions.needsUpdate = true;
    geometry.computeVertexNormals();
  }
  const imageryMediaType = layer.imageryArchivePath?.toLowerCase().endsWith(".jpg")
    ? "image/jpeg"
    : "image/png";
  const terrainTexture = imageryBase64
    ? new THREE.TextureLoader().load(`data:${imageryMediaType};base64,${imageryBase64}`)
    : undefined;
  if (terrainTexture) terrainTexture.colorSpace = THREE.SRGBColorSpace;
  const terrainMaterial = terrainTexture
    ? new THREE.MeshBasicMaterial({
        map: terrainTexture,
        side: THREE.DoubleSide,
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -1,
      })
    : materials.terrain;
  const mesh = new THREE.Mesh(geometry, terrainMaterial);
  if (layer.clipPolygonWgs84 || !elevations) {
    mesh.position.z = layer.verticalOffset * MM_TO_M;
  }
  mesh.receiveShadow = true;
  mesh.userData = { entityType: "terrain", entityId: layer.id };
  return mesh;
}

export function createProjectContent(
  project: ProjectDocument,
  builderId?: string,
  terrainAssets: Record<string, string> = {},
  builderFloorId?: string,
): THREE.Group {
  const content = new THREE.Group();
  content.name = "Sketcher content";
  if (builderId) {
    const building = project.buildingDefinitions.find((item) => item.id === builderId);
    if (building) {
      const group = createBuildingGroup(building, builderFloorId);
      group.userData = { entityType: "building-definition", entityId: building.id };
      content.add(group);
    }
    return content;
  }
  for (const instance of project.scene.buildingInstances.filter((item) => item.visible)) {
    const building = project.buildingDefinitions.find((item) => item.id === instance.definitionId);
    if (!building) continue;
    const group = createBuildingGroup(building);
    group.position.set(
      instance.transform.position.x * MM_TO_M,
      instance.transform.position.y * MM_TO_M,
      instance.transform.position.z * MM_TO_M,
    );
    group.rotation.z = instance.transform.rotationZ;
    group.userData = { entityType: "building", entityId: instance.id };
    group.traverse((child) => {
      child.userData.rootEntityType = "building";
      child.userData.rootEntityId = instance.id;
    });
    content.add(group);
  }
  for (const instance of project.scene.assetInstances.filter((item) => item.visible)) {
    const definition = project.assetDefinitions.find((item) => item.id === instance.definitionId);
    if (definition?.source !== "builtin" && definition?.source !== "generated") continue;
    const group = createBuiltinAsset(definition);
    group.position.set(
      instance.transform.position.x * MM_TO_M,
      instance.transform.position.y * MM_TO_M,
      instance.transform.position.z * MM_TO_M,
    );
    group.rotation.z = instance.transform.rotationZ;
    group.scale.setScalar(instance.transform.scale);
    group.userData = { entityType: "asset", entityId: instance.id };
    group.traverse((child) => {
      child.userData.rootEntityType = "asset";
      child.userData.rootEntityId = instance.id;
    });
    content.add(group);
  }
  for (const layer of project.scene.terrainLayers.filter((item) => item.visible)) {
    const imagery = layer.imageryArchivePath ? terrainAssets[layer.imageryArchivePath] : undefined;
    content.add(createTerrainMesh(layer, imagery));
  }
  return content;
}
