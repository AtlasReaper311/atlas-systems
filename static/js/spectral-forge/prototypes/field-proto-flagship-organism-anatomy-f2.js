"use strict";

import { drawOrganism } from "./field-proto-organism-core.js";

let webglModulePromise = null;

function loadWebglModule() {
  if (!webglModulePromise) {
    webglModulePromise = import("./field-proto-flagship-organism-anatomy-f2-pbr.js");
  }
  return webglModulePromise;
}

export function draw(timestamp = performance.now()) {
  if (this._flagshipAnatomyF2WebglModule) {
    try {
      this._flagshipAnatomyF2WebglModule.drawFlagshipAnatomyF2(this, timestamp);
      return;
    } catch (error) {
      this._flagshipAnatomyF2WebglModule.disposeFlagshipAnatomyF2?.(this);
      this._flagshipAnatomyF2WebglFailed = true;
      console.warn("Flagship anatomy F2 WebGL preview fell back to Canvas2D.", error);
    }
  }

  drawOrganism("flagship", this, timestamp);
  if (this._flagshipAnatomyF2WebglFailed || this._flagshipAnatomyF2WebglLoading) return;

  this._flagshipAnatomyF2WebglLoading = true;
  loadWebglModule()
    .then((module) => {
      this._flagshipAnatomyF2WebglModule = module;
      this._flagshipAnatomyF2WebglLoading = false;
      this.draw(performance.now());
    })
    .catch((error) => {
      this._flagshipAnatomyF2WebglLoading = false;
      this._flagshipAnatomyF2WebglFailed = true;
      console.warn("Flagship anatomy F2 WebGL preview is unavailable; keeping Canvas2D fallback.", error);
    });
}
