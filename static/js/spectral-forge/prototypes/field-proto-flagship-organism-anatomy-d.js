"use strict";

import { drawOrganism } from "./field-proto-organism-core.js";

let webglModulePromise = null;

function loadWebglModule() {
  if (!webglModulePromise) {
    webglModulePromise = import("./field-proto-flagship-organism-anatomy-d-pbr.js");
  }
  return webglModulePromise;
}

export function draw(timestamp = performance.now()) {
  if (this._flagshipAnatomyDWebglModule) {
    try {
      this._flagshipAnatomyDWebglModule.drawFlagshipAnatomyD(this, timestamp);
      return;
    } catch (error) {
      this._flagshipAnatomyDWebglModule.disposeFlagshipAnatomyD?.(this);
      this._flagshipAnatomyDWebglFailed = true;
      console.warn("Flagship anatomy D WebGL preview fell back to Canvas2D.", error);
    }
  }

  drawOrganism("flagship", this, timestamp);
  if (this._flagshipAnatomyDWebglFailed || this._flagshipAnatomyDWebglLoading) return;

  this._flagshipAnatomyDWebglLoading = true;
  loadWebglModule()
    .then((module) => {
      this._flagshipAnatomyDWebglModule = module;
      this._flagshipAnatomyDWebglLoading = false;
      this.draw(performance.now());
    })
    .catch((error) => {
      this._flagshipAnatomyDWebglLoading = false;
      this._flagshipAnatomyDWebglFailed = true;
      console.warn("Flagship anatomy D WebGL preview is unavailable; keeping Canvas2D fallback.", error);
    });
}
