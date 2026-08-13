"use strict";

import { TARGET_BY_ID, clamp } from "./domain.js";

export const VISUAL_TARGET_GRAMMAR = Object.freeze({
  filter_cutoff: Object.freeze({ visual: "spectral_aperture", label: "SPECTRAL APERTURE" }),
  harmonic_brightness: Object.freeze({ visual: "upper_filament_brilliance", label: "FILAMENT BRILLIANCE" }),
  pulse_rate: Object.freeze({ visual: "emission_rate", label: "EMISSION RATE" }),
  pulse_intensity: Object.freeze({ visual: "displacement_magnitude", label: "DISPLACEMENT" }),
  instability: Object.freeze({ visual: "phase_disagreement", label: "PHASE DISAGREEMENT" }),
  texture_density: Object.freeze({ visual: "microstructure_density", label: "MICROSTRUCTURE" }),
  stereo_width: Object.freeze({ visual: "lateral_spread", label: "LATERAL SPREAD" }),
  delay: Object.freeze({ visual: "afterimage_persistence", label: "AFTERIMAGE" }),
  tonal_level: Object.freeze({ visual: "coherent_body_strength", label: "BODY COHERENCE" }),
  error_texture: Object.freeze({ visual: "granular_fracture", label: "GRANULAR FRACTURE" }),
});

export const SCENARIO_ART_PROFILES = Object.freeze({
  normal: Object.freeze({ origin: 0.5, direction: 0, compression: 0, fractureBias: 0, bloomBias: 0.08 }),
  traffic: Object.freeze({ origin: 0.08, direction: 1, compression: 0.75, fractureBias: 0.08, bloomBias: 0.02 }),
  cache: Object.freeze({ origin: 0.22, direction: 1, compression: 0.24, fractureBias: 0.28, bloomBias: 0 }),
  flapping: Object.freeze({ origin: 0.5, direction: 0, compression: 0.18, fractureBias: 0.22, bloomBias: 0 }),
  creep: Object.freeze({ origin: 0.5, direction: 0.18, compression: 0.08, fractureBias: 0.12, bloomBias: 0 }),
  cascade: Object.freeze({ origin: 0.12, direction: 1, compression: 0.48, fractureBias: 0.42, bloomBias: 0 }),
  deploy: Object.freeze({ origin: 0.5, direction: 0, compression: 0.2, fractureBias: 0.18, bloomBias: 0.36 }),
});

export const SCENARIO_TRANSITION_MS = 460;

function smoothStep(edge0, edge1, value) {
  if (edge0 === edge1) return value >= edge1 ? 1 : 0;
  const x = clamp((value - edge0) / (edge1 - edge0));
  return x * x * (3 - 2 * x);
}

function windowShape(riseStart, riseEnd, fallStart, fallEnd, value) {
  return smoothStep(riseStart, riseEnd, value) * (1 - smoothStep(fallStart, fallEnd, value));
}

export function scenarioArtState(scenarioId, time) {
  const profile = SCENARIO_ART_PROFILES[scenarioId] ?? SCENARIO_ART_PROFILES.normal;
  const t = clamp(Number(time), 0, 60);
  let propagation = 0;
  let coherencePulse = 0;
  let stretch = 0;
  let disturbance = 0;
  let recovery = 0;

  if (scenarioId === "traffic") {
    propagation = smoothStep(10, 34, t) * (1 - smoothStep(46, 58, t));
    disturbance = windowShape(10, 20, 38, 52, t);
  } else if (scenarioId === "cache") {
    propagation = smoothStep(12, 38, t) * (1 - smoothStep(48, 60, t));
    disturbance = windowShape(12, 18, 42, 54, t);
    recovery = smoothStep(48, 60, t);
  } else if (scenarioId === "flapping") {
    const active = t >= 8 && t < 52;
    coherencePulse = active ? (Math.sin((t - 8) * Math.PI / 2.6) + 1) * 0.5 : 0;
    propagation = active ? 0.45 + coherencePulse * 0.22 : 0;
    disturbance = active ? coherencePulse : 0;
    recovery = smoothStep(52, 60, t);
  } else if (scenarioId === "creep") {
    stretch = smoothStep(8, 52, t);
    propagation = smoothStep(22, 56, t) * 0.72;
    disturbance = smoothStep(26, 58, t) * 0.7;
  } else if (scenarioId === "cascade") {
    propagation = smoothStep(10, 52, t);
    disturbance = smoothStep(16, 48, t);
    stretch = smoothStep(21, 40, t) * 0.55;
  } else if (scenarioId === "deploy") {
    disturbance = windowShape(12, 20, 34, 50, t);
    propagation = windowShape(12, 22, 38, 52, t) * 0.72;
    recovery = smoothStep(34, 60, t);
  } else {
    coherencePulse = 0.08 + Math.sin(t * 0.18) * 0.04;
  }

  return Object.freeze({ ...profile, propagation, coherencePulse, stretch, disturbance, recovery });
}

function targetNormalised(id, value) {
  const definition = TARGET_BY_ID[id];
  return clamp((value - definition.min) / (definition.max - definition.min));
}

export function visualTargetState(outputs) {
  return Object.freeze({
    aperture: targetNormalised("filter_cutoff", outputs.filter_cutoff),
    brilliance: targetNormalised("harmonic_brightness", outputs.harmonic_brightness),
    emissionRate: targetNormalised("pulse_rate", outputs.pulse_rate),
    displacement: targetNormalised("pulse_intensity", outputs.pulse_intensity),
    phaseDisagreement: targetNormalised("instability", outputs.instability),
    microstructure: targetNormalised("texture_density", outputs.texture_density),
    lateralSpread: targetNormalised("stereo_width", outputs.stereo_width),
    afterimage: targetNormalised("delay", outputs.delay),
    bodyStrength: targetNormalised("tonal_level", outputs.tonal_level),
    granularFracture: targetNormalised("error_texture", outputs.error_texture),
  });
}

export function deterministicUnit(seed, index) {
  const value = Math.sin((seed + index * 91.173) * 12.9898) * 43758.5453;
  return value - Math.floor(value);
}
