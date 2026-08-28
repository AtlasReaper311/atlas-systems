"use strict";

import { drawOrganism } from "./field-proto-organism-core.js";

let webglModulePromise = null;

function loadWebglModule() {
  if (!webglModulePromise) {
    webglModulePromise = import("./field-proto-flagship-organism-anatomy-f-pbr.js");
  }
  return webglModulePromise;
}

export function draw(timestamp = performance.now()) {
  if (this._flagshipAnatomyFWebglModule) {
    try {
      this._flagshipAnatomyFWebglModule.drawFlagshipAnatomyF(this, timestamp);
      return;
    } catch (error) {
      this._flagshipAnatomyFWebglModule.disposeFlagshipAnatomyF?.(this);
      this._flagshipAnatomyFWebglFailed = true;
      console.warn("Flagship anatomy F WebGL preview fell back to Canvas2D.", error);
    }
  }

  drawOrganism("flagship", this, timestamp);
  if (this._flagshipAnatomyFWebglFailed || this._flagshipAnatomyFWebglLoading) return;

  this._flagshipAnatomyFWebglLoading = true;
  loadWebglModule()
    .then((module) => {
      this._flagshipAnatomyFWebglModule = module;
      this._flagshipAnatomyFWebglLoading = false;
      this.draw(performance.now());
    })
    .catch((error) => {
      this._flagshipAnatomyFWebglLoading = false;
      this._flagshipAnatomyFWebglFailed = true;
      console.warn("Flagship anatomy F WebGL preview is unavailable; keeping Canvas2D fallback.", error);
    });
}
