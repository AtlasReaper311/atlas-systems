"use strict";

import { SCENARIO_BY_ID, clamp } from "./domain.js";
import { healthVisualProfile } from "./visuals.js";
import { scenarioArtState, visualTargetState } from "./spectral-field-model.js";

export function deriveFieldGeometry(state, visualTime, width, height) {
  const { frame, outputs, scenarioId } = state;
  const values = frame.normalised;
  const scenario = SCENARIO_BY_ID[scenarioId];
  const health = healthVisualProfile(frame.health);
  const mapped = visualTargetState(outputs);
  const art = scenarioArtState(scenarioId, frame.time);
  const pressureBase = values.anomaly_score * 0.48 + values.error_rate * 0.24 + values.queue_depth * 0.2 + values.cpu_load * 0.08;
  const pressure = clamp(pressureBase * health.pressureScale + art.disturbance * 0.08);
  const cacheDisruption = clamp(1 - values.cache_hit_rate);
  const asymmetry = clamp(cacheDisruption * 0.38 + mapped.phaseDisagreement * 0.34 + mapped.granularFracture * 0.2 + health.asymmetryBias + art.propagation * 0.05);
  const coherence = clamp((1 - pressure * 0.56 - mapped.phaseDisagreement * 0.22 - art.coherencePulse * 0.18) * health.coherenceScale, 0.1, 1);
  const seedPhase = scenario.visualSeed * 0.0071;
  const centerX = width * (0.5 + asymmetry * 0.025 * Math.sin(visualTime * 0.17 + seedPhase));
  const centerY = height * (0.5 + pressure * 0.02 - art.recovery * 0.012);
  const baseRadius = Math.min(width, height) * 0.3;
  const radiusX = baseRadius * (0.88 + mapped.lateralSpread * 0.46) * (1 - art.compression * art.disturbance * 0.16) * health.widthScale;
  const radiusY = baseRadius * (0.78 + mapped.aperture * 0.28 + art.stretch * 0.36) * health.heightScale;
  const phase = visualTime * (0.22 + mapped.emissionRate * 0.82) + seedPhase;
  return Object.freeze({
    health, mapped, art, pressure, cacheDisruption, asymmetry, coherence, seedPhase,
    centerX, centerY, baseRadius, radiusX, radiusY, phase,
  });
}
