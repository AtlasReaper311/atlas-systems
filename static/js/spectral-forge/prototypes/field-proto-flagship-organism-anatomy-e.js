"use strict";

import { drawOrganism } from "./field-proto-organism-core.js";

let webglModulePromise = null;

function loadWebglModule() {
  if (!webglModulePromise) {
    webglModulePromise = import("./field-proto-flagship-organism-anatomy-e-pbr.js");
  }
  return webglModulePromise;
}

export function draw(timestamp = performance.now()) {
  if (this._flagshipAnatomyEWebglModule) {
    try {
      this._flagshipAnatomyEWebglModule.drawFlagshipAnatomyE(this, timestamp);
      return;
    } catch (error) {
      this._flagshipAnatomyEWebglModule.disposeFlagshipAnatomyE?.(this);
      this._flagshipAnatomyEWebglFailed = true;
      console.warn("Flagship anatomy E WebGL preview fell back to Canvas2D.", error);
    }
  }

  drawOrganism("flagship", this, timestamp);
  if (this._flagshipAnatomyEWebglFailed || this._flagshipAnatomyEWebglLoading) return;

  this._flagshipAnatomyEWebglLoading = true;
  loadWebglModule()
    .then((module) => {
      this._flagshipAnatomyEWebglModule = module;
      this._flagshipAnatomyEWebglLoading = false;
      this.draw(performance.now());
    })
    .catch((error) => {
      this._flagshipAnatomyEWebglLoading = false;
      this._flagshipAnatomyEWebglFailed = true;
      console.warn("Flagship anatomy E WebGL preview is unavailable; keeping Canvas2D fallback.", error);
    });
}
