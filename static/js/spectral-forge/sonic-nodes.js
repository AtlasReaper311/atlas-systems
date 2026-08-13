"use strict";

import { SMOOTHING_SECONDS, clamp } from "./domain.js";
import { HARMONIC_PROFILES, SONIC_BASE_FREQUENCY, SONIC_SUB_FREQUENCY, effectiveStereoWidth, targetNormalised } from "./sonic-profile.js";

function ramp(parameter, value, now, seconds) {
  parameter.cancelScheduledValues(now);
  parameter.setValueAtTime(parameter.value, now);
  parameter.linearRampToValueAtTime(value, now + Math.max(0.025, seconds));
}

export function ensureSonicNodes(engine) {
  if (engine.sonicIdentityReady) return;
  const context = engine.context;
  engine.sonicIdentityReady = true;
  engine.subOscillator = context.createOscillator();
  engine.subOscillator.type = "sine";
  engine.subOscillator.frequency.value = SONIC_SUB_FREQUENCY;
  engine.subFilter = context.createBiquadFilter();
  engine.subFilter.type = "lowpass";
  engine.subFilter.frequency.value = 118;
  engine.subFilter.Q.value = 0.68;
  engine.subGain = context.createGain();
  engine.subGain.gain.value = 0.018;
  engine.subOscillator.connect(engine.subFilter).connect(engine.subGain).connect(engine.dryBus);
  engine.subOscillator.start();

  engine.crystalDelay = context.createDelay(0.04);
  engine.crystalDelay.delayTime.value = 0.011;
  engine.crystalFeedback = context.createGain();
  engine.crystalFeedback.gain.value = 0.12;
  try { engine.noisePanner.disconnect(engine.dryBus); } catch { /* direct noise route may already be detached */ }
  engine.noisePanner.connect(engine.crystalDelay);
  engine.crystalDelay.connect(engine.crystalFeedback).connect(engine.crystalDelay);
  engine.crystalDelay.connect(engine.dryBus);
  engine.noiseFilter.Q.value = 3.2;

  const now = context.currentTime;
  engine.primary.oscillator.frequency.setValueAtTime(SONIC_BASE_FREQUENCY, now);
  setHarmonicProfile(engine, engine.lastHealth ?? "STABLE");
}

export function updateSonicNodes(engine, parameters, smoothing) {
  ensureSonicNodes(engine);
  const now = engine.context.currentTime;
  const seconds = (target) => SMOOTHING_SECONDS[smoothing[target] ?? "MEDIUM"];
  const tonal = targetNormalised("tonal_level", parameters.tonal_level);
  const brightness = targetNormalised("harmonic_brightness", parameters.harmonic_brightness);
  const density = targetNormalised("texture_density", parameters.texture_density);
  const errorTexture = targetNormalised("error_texture", parameters.error_texture);
  const width = effectiveStereoWidth(parameters);
  ramp(engine.subGain.gain, 0.012 + tonal * 0.038 - brightness * 0.006, now, seconds("tonal_level"));
  ramp(engine.crystalFeedback.gain, clamp(0.08 + density * 0.12 + errorTexture * 0.055, 0.08, 0.24), now, Math.min(seconds("texture_density"), seconds("error_texture")));
  ramp(engine.noiseFilter.Q, 2.6 + density * 4.8, now, seconds("texture_density"));
  ramp(engine.widthLeft.gain, width, now, seconds("stereo_width"));
  ramp(engine.widthRight.gain, -width, now, seconds("stereo_width"));
}

export function setHarmonicProfile(engine, health) {
  ensureSonicNodes(engine);
  const profile = HARMONIC_PROFILES[health] ?? HARMONIC_PROFILES.STABLE;
  const now = engine.context.currentTime;
  ramp(engine.primary.oscillator.frequency, SONIC_BASE_FREQUENCY, now, 0.55);
  ramp(engine.subOscillator.frequency, SONIC_SUB_FREQUENCY, now, 0.7);
  ramp(engine.harmonic.oscillator.frequency, SONIC_BASE_FREQUENCY * profile.harmonic, now, 0.72);
  ramp(engine.shimmer.oscillator.frequency, SONIC_BASE_FREQUENCY * profile.shimmer, now, 0.92);
}

function pulseVoice(engine, start, frequency, peak, duration, pan, type = "sine") {
  const context = engine.context;
  const oscillator = context.createOscillator();
  const filter = context.createBiquadFilter();
  const gain = context.createGain();
  const panner = context.createStereoPanner();
  oscillator.type = type;
  oscillator.frequency.value = frequency;
  filter.type = "bandpass";
  filter.frequency.value = frequency * 1.55;
  filter.Q.value = 1.35;
  panner.pan.value = pan;
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(peak, start + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  oscillator.connect(filter).connect(gain).connect(panner).connect(engine.dryBus);
  oscillator.start(start);
  oscillator.stop(start + duration + 0.025);
}

export function scheduleHeartbeat(engine) {
  if (engine.disposed || engine.context.state !== "running") return;
  const now = engine.context.currentTime;
  if (now + 0.04 < engine.nextPulseAt) return;
  const pan = engine.pulseCounter % 2 === 0 ? -0.08 : 0.08;
  const strength = engine.pulseIntensity;
  pulseVoice(engine, engine.nextPulseAt, SONIC_BASE_FREQUENCY, 0.022 + strength * 0.078, 0.13, pan, "triangle");
  pulseVoice(engine, engine.nextPulseAt + 0.055, SONIC_BASE_FREQUENCY * 2.6, 0.01 + strength * 0.035, 0.075, -pan * 0.5, "sine");
  engine.pulseCounter += 1;
  engine.nextPulseAt += 1 / engine.pulseRate;
  if (engine.nextPulseAt < now) engine.nextPulseAt = now + 1 / engine.pulseRate;
}

export function triggerSonicEvent(engine, kind, health) {
  if (engine.context.state !== "running") return;
  const profile = HARMONIC_PROFILES[health] ?? HARMONIC_PROFILES.STABLE;
  const ratios = kind === "deploy" ? [1, 1.25, 1.5] : profile.event;
  const base = SONIC_BASE_FREQUENCY * 4;
  ratios.forEach((ratio, index) => {
    const start = engine.context.currentTime + index * (kind === "deploy" ? 0.095 : 0.065);
    const duration = health === "RECOVERING" ? 0.42 + index * 0.08 : kind === "deploy" ? 0.3 : 0.18;
    pulseVoice(engine, start, base * ratio, kind === "deploy" ? 0.046 : 0.026, duration, (index - (ratios.length - 1) / 2) * 0.1, index === 0 ? "triangle" : "sine");
  });
}

export function disposeSonicNodes(engine) {
  if (!engine.sonicIdentityReady) return;
  try { engine.subOscillator.stop(engine.context.currentTime + 0.04); } catch { /* already stopped */ }
}
