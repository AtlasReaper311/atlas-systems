"use strict";

import { drawOrganism } from "./field-proto-organism-core.js";

let webglModulePromise = null;

function loadWebglModule() {
  if (!webglModulePromise) {
    webglModulePromise = import("./field-proto-flagship-organism-webgl-pbr.js");
  }
  return webglModulePromise;
}

export function draw(timestamp = performance.now()) {
  if (this._flagshipWebglModule) {
    try {
      this._flagshipWebglModule.drawFlagshipOrganism(this, timestamp);
      return;
    } catch (error) {
      this._flagshipWebglModule.disposeFlagshipOrganism?.(this);
      this._flagshipWebglFailed = true;
      console.warn("Flagship organism WebGL prototype fell back to Canvas2D.", error);
    }
  }

  drawOrganism("flagship", this, timestamp);
  if (this._flagshipWebglFailed || this._flagshipWebglLoading) return;

  this._flagshipWebglLoading = true;
  loadWebglModule()
    .then((module) => {
      this._flagshipWebglModule = module;
      this._flagshipWebglLoading = false;
      this.draw(performance.now());
    })
    .catch((error) => {
      this._flagshipWebglLoading = false;
      this._flagshipWebglFailed = true;
      console.warn("Flagship organism WebGL prototype is unavailable; keeping Canvas2D fallback.", error);
    });
}
