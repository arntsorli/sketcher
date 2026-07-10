import type * as THREE from "three";
import { GLTFExporter } from "three/addons/exporters/GLTFExporter.js";

let contentRoot: THREE.Object3D | null = null;

export function setExportRoot(root: THREE.Object3D | null): void {
  contentRoot = root;
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

export async function exportSceneToGlb(name: string): Promise<string | null> {
  if (!contentRoot) return null;
  const exporter = new GLTFExporter();
  const data = await exporter.parseAsync(contentRoot, {
    binary: true,
    onlyVisible: true,
    trs: false,
  });
  if (!(data instanceof ArrayBuffer)) throw new Error("GLB exporter returned text output.");
  return window.sketcher.dialogs.exportModel(name, arrayBufferToBase64(data));
}
