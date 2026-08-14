"use strict";

import { drawOrganism } from "./field-proto-organism-core.js";

let webglModulePromise = null;

function loadWebglModule() {
  if (!webglModulePromise) {
    webglModulePromise = import("./field-proto-flagship-organism-anatomy-f31-pbr.js");
  }
  return webglModulePromise;
}

export function draw(timestamp = performance.now()) {
  if (this._flagshipAnatomyF31WebglModule) {
    try {
      this._flagshipAnatomyF31WebglModule.drawFlagshipAnatomyF31(this, timestamp);
      return;
    } catch (error) {
      this._flagshipAnatomyF31WebglModule.disposeFlagshipAnatomyF31?.(this);
      this._flagshipAnatomyF31WebglFailed = true;
      console.warn("Flagship anatomy F3.1 WebGL preview fell back to Canvas2D.", error);
    }
  }

  drawOrganism("flagship", this, timestamp);
  if (this._flagshipAnatomyF31WebglFailed || this._flagshipAnatomyF31WebglLoading) return;

  this._flagshipAnatomyF31WebglLoading = true;
  loadWebglModule()
    .then((module) => {
      this._flagshipAnatomyF31WebglModule = module;
      this._flagshipAnatomyF31WebglLoading = false;
      this.draw(performance.now());
    })
    .catch((error) => {
      this._flagshipAnatomyF31WebglLoading = false;
      this._flagshipAnatomyF31WebglFailed = true;
      console.warn("Flagship anatomy F3.1 WebGL preview is unavailable; keeping Canvas2D fallback.", error);
    });
}
