"use strict";

import { drawOrganism } from "./field-proto-organism-core.js";

let webglModulePromise = null;

function loadWebglModule() {
  if (!webglModulePromise) {
    webglModulePromise = import("./field-proto-flagship-organism-anatomy-b-pbr.js");
  }
  return webglModulePromise;
}

export function draw(timestamp = performance.now()) {
  if (this._flagshipAnatomyBWebglModule) {
    try {
      this._flagshipAnatomyBWebglModule.drawFlagshipAnatomyB(this, timestamp);
      return;
    } catch (error) {
      this._flagshipAnatomyBWebglModule.disposeFlagshipAnatomyB?.(this);
      this._flagshipAnatomyBWebglFailed = true;
      console.warn("Flagship anatomy B WebGL preview fell back to Canvas2D.", error);
    }
  }

  drawOrganism("flagship", this, timestamp);
  if (this._flagshipAnatomyBWebglFailed || this._flagshipAnatomyBWebglLoading) return;

  this._flagshipAnatomyBWebglLoading = true;
  loadWebglModule()
    .then((module) => {
      this._flagshipAnatomyBWebglModule = module;
      this._flagshipAnatomyBWebglLoading = false;
      this.draw(performance.now());
    })
    .catch((error) => {
      this._flagshipAnatomyBWebglLoading = false;
      this._flagshipAnatomyBWebglFailed = true;
      console.warn("Flagship anatomy B WebGL preview is unavailable; keeping Canvas2D fallback.", error);
    });
}
