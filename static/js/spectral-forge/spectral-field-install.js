"use strict";

import { SpectralFieldRenderer } from "./visuals.js";

export function installSpectralFieldRuntime(methods) {
  Object.assign(SpectralFieldRenderer.prototype, methods);
  Object.defineProperty(SpectralFieldRenderer.prototype, "spectralFieldVersion", {
    configurable: false,
    enumerable: false,
    value: "4.0",
    writable: false,
  });
}