"use strict";

import { SpectralForgeAudioEngine } from "./audio-engine.js";
import { COMPARE_INTERPOLATION_SECONDS, mappedParameterDelta } from "./sonic-profile.js";
import { disposeSonicNodes, ensureSonicNodes, scheduleHeartbeat, setHarmonicProfile, triggerSonicEvent, updateSonicNodes } from "./sonic-nodes.js";

const prototype = SpectralForgeAudioEngine.prototype;
const originalActivate = prototype.activate;
const originalUpdate = prototype.update;
const originalDispose = prototype.dispose;

prototype.activate = async function sonicActivate(level) {
  ensureSonicNodes(this);
  await originalActivate.call(this, level);
  setHarmonicProfile(this, this.lastHealth ?? "STABLE");
};

prototype.update = function sonicUpdate(parameters, smoothing, health, deployEvent) {
  ensureSonicNodes(this);
  const delta = mappedParameterDelta(this.sonicLastParameters, parameters);
  const adjusted = { ...smoothing };
  if (delta >= 0.18) {
    for (const [target, policy] of Object.entries(adjusted)) {
      if (policy === "IMMEDIATE") adjusted[target] = "FAST";
    }
    this.sonicCompareInterpolationSeconds = COMPARE_INTERPOLATION_SECONDS;
  }
  originalUpdate.call(this, parameters, adjusted, health, deployEvent);
  updateSonicNodes(this, parameters, adjusted);
  this.sonicLastParameters = { ...parameters };
};

prototype.setHarmonicState = function sonicHarmonicState(health) {
  setHarmonicProfile(this, health);
};

prototype.schedulePulse = function sonicHeartbeat() {
  scheduleHeartbeat(this);
};

prototype.triggerEvent = function sonicEvent(kind, health) {
  void kind;
  triggerSonicEvent(this, health);
};

prototype.dispose = async function sonicDispose() {
  disposeSonicNodes(this);
  await originalDispose.call(this);
};

Object.defineProperty(prototype, "sonicIdentityVersion", {
  configurable: false,
  enumerable: false,
  value: "2.2",
  writable: false,
});
