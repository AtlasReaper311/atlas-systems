"use strict";

import { drawOrganism } from "./field-proto-organism-core.js";
import {
  installPhysicalBehaviourHook,
  publishPhysicalBehaviourEvidence,
} from "./field-proto-flagship-final-form-physics.js";

let webglModulePromise = null;
let webgl2Support = null;

function supportsWebgl2() {
  if (webgl2Support !== null) return webgl2Support;
  try {
    const probe = document.createElement("canvas");
    webgl2Support = Boolean(probe.getContext("webgl2"));
  } catch {
    webgl2Support = false;
  }
  return webgl2Support;
}

function loadWebglModule() {
  if (!webglModulePromise) {
    webglModulePromise = import("./field-proto-flagship-final-form-pbr.js");
  }
  return webglModulePromise;
}

export function draw(timestamp = performance.now()) {
  if (this._flagshipFinalFormModule) {
    try {
      installPhysicalBehaviourHook(this);
      this._flagshipFinalFormModule.drawFlagshipFinalForm(this, timestamp);
      installPhysicalBehaviourHook(this);
      publishPhysicalBehaviourEvidence(this, timestamp);
      return;
    } catch (error) {
      this._flagshipFinalFormModule.disposeFlagshipFinalForm?.(this);
      this._flagshipFinalFormFailed = true;
      console.warn("Flagship final-form WebGL preview fell back to Canvas2D.", error);
    }
  }

  drawOrganism("flagship", this, timestamp);
  if (this._flagshipFinalFormFailed || this._flagshipFinalFormLoading) return;

  if (!supportsWebgl2()) {
    this._flagshipFinalFormFailed = true;
    this.canvas.dataset.finalFormWebgl = "webgl2-unavailable";
    return;
  }
  this.canvas.dataset.finalFormWebgl = "webgl2-available";

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
