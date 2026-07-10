import type {
  GeometryWorkerRequest,
  GeometryWorkerResponse,
  WallSolidRequest,
  WallSolidResult,
} from "./geometryTypes";

interface PendingRequest {
  resolve(result: WallSolidResult): void;
  reject(error: Error): void;
}

let worker: Worker | undefined;
const pending = new Map<string, PendingRequest>();

function getWorker(): Worker {
  if (worker) return worker;
  worker = new Worker(new URL("./geometry.worker.ts", import.meta.url), { type: "module" });
  worker.onmessage = (event: MessageEvent<GeometryWorkerResponse>) => {
    const response = event.data;
    const request = pending.get(response.id);
    if (!request || response.type === "progress") return;
    pending.delete(response.id);
    if (response.type === "result") request.resolve(response);
    else if (response.type === "cancelled")
      request.reject(new DOMException("Cancelled", "AbortError"));
    else request.reject(new Error(response.message));
  };
  worker.onerror = (event) => {
    for (const request of pending.values()) request.reject(new Error(event.message));
    pending.clear();
    worker?.terminate();
    worker = undefined;
  };
  return worker;
}

export function buildWallSolid(
  payload: WallSolidRequest,
  signal?: AbortSignal,
): Promise<WallSolidResult> {
  const id = crypto.randomUUID();
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("Cancelled", "AbortError"));
      return;
    }
    const activeWorker = getWorker();
    pending.set(id, { resolve, reject });
    signal?.addEventListener(
      "abort",
      () => {
        const request = pending.get(id);
        if (!request) return;
        pending.delete(id);
        request.reject(new DOMException("Cancelled", "AbortError"));
        activeWorker.postMessage({ type: "cancel", id } satisfies GeometryWorkerRequest);
      },
      { once: true },
    );
    activeWorker.postMessage({ type: "wall", id, payload } satisfies GeometryWorkerRequest);
  });
}
