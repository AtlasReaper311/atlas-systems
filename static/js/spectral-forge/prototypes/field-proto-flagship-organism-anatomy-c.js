"use strict";

import { drawOrganism } from "./field-proto-organism-core.js";

let webglModulePromise = null;

function loadWebglModule() {
  if (!webglModulePromise) {
    webglModulePromise = import("./field-proto-flagship-organism-anatomy-c-pbr.js");
  }
  return webglModulePromise;
}

export function draw(timestamp = performance.now()) {
  if (this._flagshipAnatomyCWebglModule) {
    try {
      this._flagshipAnatomyCWebglModule.drawFlagshipAnatomyC(this, timestamp);
      return;
    } catch (error) {
      this._flagshipAnatomyCWebglModule.disposeFlagshipAnatomyC?.(this);
      this._flagshipAnatomyCWebglFailed = true;
      console.warn("Flagship anatomy C WebGL preview fell back to Canvas2D.", error);
    }
  }

  drawOrganism("flagship", this, timestamp);
  if (this._flagshipAnatomyCWebglFailed || this._flagshipAnatomyCWebglLoading) return;

  this._flagshipAnatomyCWebglLoading = true;
  loadWebglModule()
    .then((module) => {
      this._flagshipAnatomyCWebglModule = module;
      this._flagshipAnatomyCWebglLoading = false;
      this.draw(performance.now());
    })
    .catch((error) => {
      this._flagshipAnatomyCWebglLoading = false;
      this._flagshipAnatomyCWebglFailed = true;
      console.warn("Flagship anatomy C WebGL preview is unavailable; keeping Canvas2D fallback.", error);
    });
}
