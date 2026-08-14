"use strict";

import { drawOrganism } from "./field-proto-organism-core.js";

let webglModulePromise = null;

function loadWebglModule() {
  if (!webglModulePromise) {
    webglModulePromise = import("./field-proto-flagship-organism-anatomy-pbr.js");
  }
  return webglModulePromise;
}

export function draw(timestamp = performance.now()) {
  if (this._flagshipAnatomyWebglModule) {
    try {
      this._flagshipAnatomyWebglModule.drawFlagshipAnatomy(this, timestamp);
      return;
    } catch (error) {
      this._flagshipAnatomyWebglModule.disposeFlagshipAnatomy?.(this);
      this._flagshipAnatomyWebglFailed = true;
      console.warn("Flagship anatomy WebGL preview fell back to Canvas2D.", error);
    }
  }

  drawOrganism("flagship", this, timestamp);
  if (this._flagshipAnatomyWebglFailed || this._flagshipAnatomyWebglLoading) return;

  this._flagshipAnatomyWebglLoading = true;
  loadWebglModule()
    .then((module) => {
      this._flagshipAnatomyWebglModule = module;
      this._flagshipAnatomyWebglLoading = false;
      this.draw(performance.now());
    })
    .catch((error) => {
      this._flagshipAnatomyWebglLoading = false;
      this._flagshipAnatomyWebglFailed = true;
      console.warn("Flagship anatomy WebGL preview is unavailable; keeping Canvas2D fallback.", error);
    });
}
