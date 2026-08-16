"use strict";

import { SpectralForgeAudioEngine, PULSE_LOOKAHEAD_SECONDS, PULSE_MAX_CATCHUP_SECONDS } from "./audio-engine.js";
import { COMPARE_INTERPOLATION_SECONDS, mappedParameterDelta } from "./sonic-profile.js";
import { disposeSonicNodes, ensureSonicNodes, scheduleHeartbeat, setHarmonicProfile, triggerSonicEvent, updateSonicNodes } from "./sonic-nodes.js";
import { materialVoice, materialPulseInterval } from "./sonic-material.js";

const prototype = SpectralForgeAudioEngine.prototype;
const originalActivate = prototype.activate;
const originalUpdate = prototype.update;
const originalDispose = prototype.dispose;

prototype.activate = async function sonicActivate(level) {
  ensureSonicNodes(this);
  await originalActivate.call(this, level);
  setHarmonicProfile(this, this.lastHealth ?? "STABLE");
};

prototype.update = function sonicUpdate(parameters, smoothing, health, deployEvent, materialState) {
  ensureSonicNodes(this);
  const delta = mappedParameterDelta(this.sonicLastParameters, parameters);
  const adjusted = { ...smoothing };
  if (delta >= 0.18) {
    for (const [target, policy] of Object.entries(adjusted)) {
      if (policy === "IMMEDIATE") adjusted[target] = "FAST";
    }
    this.sonicCompareInterpolationSeconds = COMPARE_INTERPOLATION_SECONDS;
  }
  /* The material voice is derived once per update and held on the engine, so the
   * base layer, the crystal bank and the pulse scheduler all read the same
   * physical state for a given frame rather than three slightly different ones. */
  this.sonicVoice = materialVoice(materialState?.physical, materialState?.fission);
  originalUpdate.call(this, parameters, adjusted, health, deployEvent);
  updateSonicNodes(this, parameters, adjusted);
  this.sonicLastParameters = { ...parameters };
};

prototype.setHarmonicState = function sonicHarmonicState(health) {
  setHarmonicProfile(this, health);
};

/* Lookahead scheduling against the audio clock.
 *
 * The timer no longer emits pulses; it fills a short window ahead of the audio
 * clock with everything that falls due inside it. A late callback therefore
 * still places every pulse on the grid, at the time it belonged to, so
 * main-thread load can no longer shift the beat. Only a genuine suspension - a
 * gap past the catch-up bound - restarts the grid, which is the one case where
 * replaying the backlog would be wrong. */
prototype.schedulePulse = function sonicSchedule() {
  if (this.disposed || this.context.state !== "running") return;
  const now = this.context.currentTime;
  const horizon = now + PULSE_LOOKAHEAD_SECONDS;

  if (!Number.isFinite(this.nextPulseAt) || this.nextPulseAt < now - PULSE_MAX_CATCHUP_SECONDS) {
    this.nextPulseAt = now + 0.05;
  }

  let placed = 0;
  while (this.nextPulseAt < horizon && placed < 16) {
    scheduleHeartbeat(this, this.nextPulseAt);
    this.nextPulseAt += materialPulseInterval(this.pulseRate, this.sonicVoice);
    placed += 1;
  }
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
  value: "3.0",
  writable: false,
});
