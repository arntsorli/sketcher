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
  roof: material(0x444b55),
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

function boxPiece(
  group: THREE.Group,
  wall: Wall,
  startAlong: number,
  width: number,
  baseHeight: number,
  height: number,
): void {
  if (width <= 0 || height <= 0) return;
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
      ? wall.thickness / 2
      : wall.alignment === "outside"
        ? -wall.thickness / 2
        : 0;
  mesh.position.set(centerAlong * MM_TO_M, yOffset * MM_TO_M, (baseHeight + height / 2) * MM_TO_M);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);
}

function wallWithOpenings(
  group: THREE.Group,
  wall: Wall,
  openings: Opening[],
  floorElevation: number,
  floorHeight: number,
): void {
  const length = Math.hypot(wall.end.x - wall.start.x, wall.end.y - wall.start.y);
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
    manifoldRequest,
  };
  group.add(wallGroup);
  let cursor = 0;
  for (const opening of sorted) {
    boxPiece(wallGroup, wall, cursor, opening.offset - cursor, 0, floorHeight);
    boxPiece(wallGroup, wall, opening.offset, opening.width, 0, opening.sillHeight);
    const top = opening.sillHeight + opening.height;
    boxPiece(wallGroup, wall, opening.offset, opening.width, top, floorHeight - top);
    cursor = Math.max(cursor, opening.offset + opening.width);
  }
  boxPiece(wallGroup, wall, cursor, length - cursor, 0, floorHeight);
}

function addRoof(group: THREE.Group, building: BuildingDefinition): void {
  const roof = building.roof;
  const roofFloor = building.floors.find((floor) => floor.id === roof?.floorId);
  if (!roof || !roofFloor) return;
  const xs = building.footprint.map((point) => point.x);
  const ys = building.footprint.map((point) => point.y);
  const minX = Math.min(...xs) - roof.overhang;
  const maxX = Math.max(...xs) + roof.overhang;
  const minY = Math.min(...ys) - roof.overhang;
  const maxY = Math.max(...ys) + roof.overhang;
  const ridgeAlongX = Math.abs(roof.ridgeRotationDegrees % 180) < 45;
  const run = (ridgeAlongX ? maxY - minY : maxX - minX) / 2;
  const rise = Math.tan((roof.pitchDegrees * Math.PI) / 180) * run;
  const baseZ = roofFloor.elevation;
  const slopeLength = Math.hypot(run, rise);
  const pitch = (roof.pitchDegrees * Math.PI) / 180;
  for (const side of [-1, 1]) {
    const geometry = ridgeAlongX
      ? new THREE.BoxGeometry(
          (maxX - minX) * MM_TO_M,
          slopeLength * MM_TO_M,
          roof.thickness * MM_TO_M,
        )
      : new THREE.BoxGeometry(
          slopeLength * MM_TO_M,
          (maxY - minY) * MM_TO_M,
          roof.thickness * MM_TO_M,
        );
    const mesh = new THREE.Mesh(geometry, materials.roof);
    if (ridgeAlongX) {
      mesh.position.set(
        ((minX + maxX) / 2) * MM_TO_M,
        ((minY + maxY) / 2 + (side * run) / 2) * MM_TO_M,
        (baseZ + rise / 2) * MM_TO_M,
      );
      mesh.rotation.x = side * pitch;
    } else {
      mesh.position.set(
        ((minX + maxX) / 2 + (side * run) / 2) * MM_TO_M,
        ((minY + maxY) / 2) * MM_TO_M,
        (baseZ + rise / 2) * MM_TO_M,
      );
      mesh.rotation.y = -side * pitch;
    }
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData = { entityType: "roof", entityId: roof.floorId };
    group.add(mesh);
  }
}

export function createBuildingGroup(building: BuildingDefinition): THREE.Group {
  const group = new THREE.Group();
  group.name = building.name;
  const storyFloors = building.floors.filter((item) => item.type === "story");
  for (const [floorIndex, floor] of storyFloors.entries()) {
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
        wall,
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
  addRoof(group, building);
  return group;
}

export function createBuiltinAsset(definition: AssetDefinition): THREE.Group {
  const group = new THREE.Group();
  const trunk = material(0x76543a);
  const green = material(0x47734e);
  const darkGreen = material(0x315f42);
  const blue = material(0x42627f);
  const skin = material(0xd0a47c);
  if (definition.kind === "car") {
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
  } else if (definition.kind === "person") {
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.25, 1.1, 6, 12), material(0x626d8c));
    body.rotation.x = Math.PI / 2;
    body.position.z = 0.9;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 16, 12), skin);
    head.position.z = 1.75;
    group.add(body, head);
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
  const geometry = new THREE.PlaneGeometry(
    layer.widthMm * MM_TO_M,
    layer.heightMm * MM_TO_M,
    Math.max(1, columns - 1),
    Math.max(1, rows - 1),
  );
  const positions = geometry.getAttribute("position");
  const elevations = layer.elevationsMm;
  if (elevations) {
    for (let index = 0; index < Math.min(positions.count, elevations.length); index += 1) {
      positions.setZ(index, ((elevations[index] ?? 0) + layer.verticalOffset) * MM_TO_M);
    }
    positions.needsUpdate = true;
    geometry.computeVertexNormals();
  }
  const terrainMaterial = imageryBase64
    ? new THREE.MeshStandardMaterial({
        map: new THREE.TextureLoader().load(`data:image/png;base64,${imageryBase64}`),
        roughness: 0.92,
        metalness: 0,
      })
    : materials.terrain;
  const mesh = new THREE.Mesh(geometry, terrainMaterial);
  mesh.receiveShadow = true;
  mesh.userData = { entityType: "terrain", entityId: layer.id };
  return mesh;
}

export function createProjectContent(
  project: ProjectDocument,
  builderId?: string,
  terrainAssets: Record<string, string> = {},
): THREE.Group {
  const content = new THREE.Group();
  content.name = "Sketcher content";
  if (builderId) {
    const building = project.buildingDefinitions.find((item) => item.id === builderId);
    if (building) {
      const group = createBuildingGroup(building);
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
    if (definition?.source !== "builtin") continue;
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
