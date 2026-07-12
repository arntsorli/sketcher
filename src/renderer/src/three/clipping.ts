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
