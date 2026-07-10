export interface WallSolidOpening {
  offset: number;
  width: number;
  height: number;
  sillHeight: number;
}

export interface WallSolidRequest {
  length: number;
  thickness: number;
  height: number;
  alignment: "inside" | "center" | "outside";
  openings: WallSolidOpening[];
}

export interface WallSolidResult {
  positions: Float32Array;
  indices: Uint32Array;
  volume: number;
}

export type GeometryWorkerRequest =
  | { type: "wall"; id: string; payload: WallSolidRequest }
  | { type: "cancel"; id: string };

export type GeometryWorkerResponse =
  | { type: "progress"; id: string; completed: number; total: number }
  | ({ type: "result"; id: string } & WallSolidResult)
  | { type: "cancelled"; id: string }
  | { type: "error"; id: string; message: string };
