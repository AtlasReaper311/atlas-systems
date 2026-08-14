"use strict";

import { clamp } from "./domain.js";
import { FIELD_VISUAL_SEED, fieldArtState, visualTargetState } from "./spectral-field-model.js";

function numericHealthProfile(pressure, disturbance, mapped) {
  const severity = clamp(pressure * 0.62 + disturbance * 0.24 + mapped.phaseDisagreement * 0.08 + mapped.granularFracture * 0.06);
  return Object.freeze({
    severity,
    asymmetryBias: severity * 0.08,
    coherenceScale: 1 - severity * 0.3,
    widthScale: 1 - severity * 0.15,
    heightScale: 1 + severity * 0.08,
    fractureScale: 0.76 + severity * 0.62,
  });
}

export function deriveFieldGeometry(state, visualTime, width, height) {
  const { frame, outputs } = state;
  const values = frame.normalised;
  const mapped = visualTargetState(outputs);
  const art = fieldArtState(frame, mapped);
  const pressureBase = values.anomaly_score * 0.42 + values.error_rate * 0.23 + values.queue_depth * 0.2 + values.cpu_load * 0.08 + values.latency_ms * 0.07;
  const pressure = clamp(pressureBase + art.disturbance * 0.1);
  const health = numericHealthProfile(pressure, art.disturbance, mapped);
  const cacheDisruption = clamp(1 - values.cache_hit_rate);
  const asymmetry = clamp(cacheDisruption * 0.32 + mapped.phaseDisagreement * 0.3 + mapped.granularFracture * 0.2 + art.propagation * 0.1 + health.asymmetryBias);
  const coherence = clamp((1 - pressure * 0.5 - mapped.phaseDisagreement * 0.22 - art.coherencePulse * 0.14) * health.coherenceScale, 0.12, 1);
  const seedPhase = FIELD_VISUAL_SEED * Math.PI * 2;
  const centerX = width * (0.5 + asymmetry * 0.022 * Math.sin(visualTime * 0.17 + seedPhase));
  const centerY = height * (0.5 + pressure * 0.018 - art.recovery * 0.01);
  const baseRadius = Math.min(width, height) * 0.335;
  const radiusX = baseRadius * (0.9 + mapped.lateralSpread * 0.48) * (1 - art.compression * art.disturbance * 0.12) * health.widthScale;
  const radiusY = baseRadius * (0.8 + mapped.aperture * 0.3 + art.stretch * 0.28) * health.heightScale;
  const phase = visualTime * (0.2 + mapped.emissionRate * 0.78) + seedPhase;
  return Object.freeze({
    health, mapped, art, pressure, cacheDisruption, asymmetry, coherence, seedPhase,
    centerX, centerY, baseRadius, radiusX, radiusY, phase,
  });
}