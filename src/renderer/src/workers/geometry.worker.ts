/// <reference lib="webworker" />

import Module from "manifold-3d";
import wasmUrl from "manifold-3d/manifold.wasm?url";
import type {
  GeometryWorkerRequest,
  GeometryWorkerResponse,
  WallSolidRequest,
} from "./geometryTypes";

const cancelled = new Set<string>();
const manifoldModule = Module({ locateFile: () => wasmUrl }).then((module) => {
  module.setup();
  return module;
});

function send(message: GeometryWorkerResponse, transfer: Transferable[] = []): void {
  self.postMessage(message, { transfer });
}

async function createWall(id: string, payload: WallSolidRequest): Promise<void> {
  const module = await manifoldModule;
  if (cancelled.delete(id)) {
    send({ type: "cancelled", id });
    return;
  }
  const yOffset =
    payload.alignment === "inside"
      ? 0
      : payload.alignment === "center"
        ? -payload.thickness / 2
        : -payload.thickness;
  let solid = module.Manifold.cube([payload.length, payload.thickness, payload.height]).translate([
    0,
    yOffset,
    0,
  ]);
  for (let index = 0; index < payload.openings.length; index += 1) {
    if (cancelled.delete(id)) {
      solid.delete();
      send({ type: "cancelled", id });
      return;
    }
    const opening = payload.openings[index];
    if (!opening) continue;
    const cut = module.Manifold.cube([
      opening.width,
      payload.thickness * 3,
      opening.height,
    ]).translate([opening.offset, -payload.thickness, opening.sillHeight]);
    const next = solid.subtract(cut);
    solid.delete();
    cut.delete();
    solid = next;
    send({ type: "progress", id, completed: index + 1, total: payload.openings.length });
  }
  const mesh = solid.getMesh();
  const positions = new Float32Array(mesh.numVert * 3);
  for (let vertex = 0; vertex < mesh.numVert; vertex += 1) {
    const source = vertex * mesh.numProp;
    const target = vertex * 3;
    positions[target] = mesh.vertProperties[source] ?? 0;
    positions[target + 1] = mesh.vertProperties[source + 1] ?? 0;
    positions[target + 2] = mesh.vertProperties[source + 2] ?? 0;
  }
  const indices = new Uint32Array(mesh.triVerts);
  const volume = solid.volume();
  solid.delete();
  send({ type: "result", id, positions, indices, volume }, [positions.buffer, indices.buffer]);
}

self.onmessage = (event: MessageEvent<GeometryWorkerRequest>) => {
  const request = event.data;
  if (request.type === "cancel") {
    cancelled.add(request.id);
    return;
  }
  void createWall(request.id, request.payload).catch((error) => {
    send({
      type: "error",
      id: request.id,
      message: error instanceof Error ? error.message : String(error),
    });
  });
};
