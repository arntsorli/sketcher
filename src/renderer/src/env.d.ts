/// <reference types="vite/client" />

import type { SketcherApi } from "../../shared/ipc";

declare global {
  interface Window {
    sketcher: SketcherApi;
  }
}
