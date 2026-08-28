"use strict";

import { drawOrganism } from "./field-proto-organism-core.js";

let webglModulePromise = null;

function loadWebglModule() {
  if (!webglModulePromise) {
    webglModulePromise = import("./field-proto-flagship-organism-anatomy-f3-pbr.js");
  }
  return webglModulePromise;
}

export function draw(timestamp = performance.now()) {
  if (this._flagshipAnatomyF3WebglModule) {
    try {
      this._flagshipAnatomyF3WebglModule.drawFlagshipAnatomyF3(this, timestamp);
      return;
    } catch (error) {
      this._flagshipAnatomyF3WebglModule.disposeFlagshipAnatomyF3?.(this);
      this._flagshipAnatomyF3WebglFailed = true;
      console.warn("Flagship anatomy F3 GPU preview fell back to Canvas2D.", error);
    }
  }

  drawOrganism("flagship", this, timestamp);
  if (this._flagshipAnatomyF3WebglFailed || this._flagshipAnatomyF3WebglLoading) return;

  this._flagshipAnatomyF3WebglLoading = true;
  loadWebglModule()
    .then((module) => {
      this._flagshipAnatomyF3WebglModule = module;
      this._flagshipAnatomyF3WebglLoading = false;
      this.draw(performance.now());
    })
    .catch((error) => {
      this._flagshipAnatomyF3WebglLoading = false;
      this._flagshipAnatomyF3WebglFailed = true;
      console.warn("Flagship anatomy F3 GPU preview is unavailable; keeping Canvas2D fallback.", error);
    });
}
