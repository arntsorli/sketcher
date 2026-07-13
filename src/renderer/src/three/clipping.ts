import * as THREE from "three";
import type { ClippingState } from "../store";

export function createClippingPlane(clipping: ClippingState): THREE.Plane {
  const normal = new THREE.Vector3(
    clipping.axis === "x" ? 1 : 0,
    clipping.axis === "y" ? 1 : 0,
    clipping.axis === "z" ? 1 : 0,
  );
  if (clipping.inverted) normal.negate();
  const offsetMeters = clipping.offsetMm / 1000;
  return new THREE.Plane(normal, clipping.inverted ? offsetMeters : -offsetMeters);
}

export function clippingHandlePosition(clipping: ClippingState): THREE.Vector3 {
  const position = new THREE.Vector3();
  position[clipping.axis] = clipping.offsetMm / 1000;
  return position;
}

export function clippingOffsetFromHandle(
  axis: ClippingState["axis"],
  position: THREE.Vector3,
): number {
  return Math.round(position[axis] * 1000);
}
