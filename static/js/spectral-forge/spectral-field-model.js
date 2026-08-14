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

export const SCENARIO_TRANSITION_MS = 460;
export const FIELD_VISUAL_SEED = 0.731;

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

export function fieldArtState(frame, mapped) {
  const values = frame.normalised;
  const demand = clamp(values.request_rate);
  const latency = clamp(values.latency_ms);
  const errors = clamp(values.error_rate);
  const queue = clamp(values.queue_depth);
  const cacheLoss = clamp(1 - values.cache_hit_rate);
  const cpu = clamp(values.cpu_load);
  const anomaly = clamp(values.anomaly_score);

  const upstreamPressure = clamp(cacheLoss * 0.62 + demand * 0.28 + cpu * 0.1);
  const downstreamPressure = clamp(latency * 0.31 + queue * 0.28 + errors * 0.29 + cpu * 0.12);
  const disturbance = clamp(anomaly * 0.37 + errors * 0.22 + queue * 0.14 + latency * 0.11 + mapped.phaseDisagreement * 0.09 + mapped.granularFracture * 0.07);
  const lag = Math.max(0, downstreamPressure - upstreamPressure);
  const propagation = clamp(upstreamPressure * 0.34 + downstreamPressure * 0.5 + lag * 0.36);
  const compression = clamp(demand * 0.5 + queue * 0.28 + cpu * 0.22);
  const stretch = clamp(latency * 0.78 + queue * 0.18 + mapped.afterimage * 0.04);
  const fractureBias = clamp(cacheLoss * 0.34 + errors * 0.39 + anomaly * 0.2 + mapped.granularFracture * 0.18);
  const coherencePulse = clamp(mapped.phaseDisagreement * 0.56 + errors * 0.2 + anomaly * 0.18 + queue * 0.06);
  const origin = clamp(0.08 + (1 - cacheLoss) * 0.16 + demand * 0.08, 0.06, 0.34);
  const direction = Math.max(-1, Math.min(1, (downstreamPressure - upstreamPressure) * 1.8 + 0.22));
  const reopening = clamp(mapped.lateralSpread * 0.35 + mapped.aperture * 0.25 + mapped.afterimage * 0.25 + mapped.bodyStrength * 0.15);
  const recovery = clamp((1 - disturbance) * reopening * (1 - errors * 0.5));
  const bloomBias = clamp(mapped.brilliance * 0.22 + mapped.afterimage * 0.28 + recovery * 0.42);

  return Object.freeze({ origin, direction, compression, fractureBias, bloomBias, propagation, coherencePulse, stretch, disturbance, recovery, upstreamPressure, downstreamPressure });
}

export function deterministicUnit(seed, index) {
  const value = Math.sin((seed + index * 91.173) * 12.9898) * 43758.5453;
  return value - Math.floor(value);
}