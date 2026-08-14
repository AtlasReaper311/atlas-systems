"use strict";

import { drawOrganism } from "./field-proto-organism-core.js";

let webglModulePromise = null;

function loadWebglModule() {
  if (!webglModulePromise) {
    webglModulePromise = import("./field-proto-flagship-final-form-pbr.js");
  }
  return webglModulePromise;
}

export function draw(timestamp = performance.now()) {
  if (this._flagshipFinalFormModule) {
    try {
      this._flagshipFinalFormModule.drawFlagshipFinalForm(this, timestamp);
      return;
    } catch (error) {
      this._flagshipFinalFormModule.disposeFlagshipFinalForm?.(this);
      this._flagshipFinalFormFailed = true;
      console.warn("Flagship final-form WebGL preview fell back to Canvas2D.", error);
    }
  }

  drawOrganism("flagship", this, timestamp);
  if (this._flagshipFinalFormFailed || this._flagshipFinalFormLoading) return;

  this._flagshipFinalFormLoading = true;
  loadWebglModule()
    .then((module) => {
      this._flagshipFinalFormModule = module;
      this._flagshipFinalFormLoading = false;
      this.draw(performance.now());
    })
    .catch((error) => {
      this._flagshipFinalFormLoading = false;
      this._flagshipFinalFormFailed = true;
      console.warn("Flagship final-form WebGL preview is unavailable; keeping Canvas2D fallback.", error);
    });
}
