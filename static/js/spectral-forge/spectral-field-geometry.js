"use strict";

import { clamp } from "./domain.js";
import { FIELD_VISUAL_SEED, fieldArtState, visualTargetState } from "./spectral-field-model.js";
import { resolveScenarioFrame } from "./spectral-field-scenario-clock.js";

function numericHealthProfile(pressure, disturbance, mapped) {
  const severity = clamp(pressure * 0.58 + disturbance * 0.27 + mapped.phaseDisagreement * 0.09 + mapped.granularFracture * 0.06);
  return Object.freeze({
    severity,
    asymmetryBias: severity * 0.12,
    coherenceScale: 1 - severity * 0.34,
    widthScale: 1 - severity * 0.055,
    heightScale: 1 + severity * 0.045,
    fractureScale: 0.76 + severity * 0.76,
  });
}

function signatureState(art, mapped, health, coherence) {
  return Object.freeze({
    apertureOpen: mapped.aperture > 0.58 && coherence > 0.48,
    propagationWave: art.propagation > 0.32,
    latticeSnap: art.disturbance > 0.52 && mapped.phaseDisagreement > 0.22,
    fracturePlane: art.fractureBias > 0.38 || health.severity > 0.58,
    phaseSlip: mapped.phaseDisagreement > 0.42,
    reformation: art.recovery > 0.5 && art.disturbance < 0.42,
  });
}

export function deriveFieldGeometry(state, visualTime, width, height, timestamp = performance.now()) {
  const { outputs } = state;
  const frame = resolveScenarioFrame(state.frame, state.scenarioHandoff, timestamp);
  const values = frame.normalised;
  const mapped = visualTargetState(outputs);
  const art = fieldArtState(frame, mapped);
  const pressureBase = values.anomaly_score * 0.38 + values.error_rate * 0.22 + values.queue_depth * 0.19 + values.cpu_load * 0.08 + values.latency_ms * 0.13;
  const pressure = clamp(pressureBase + art.disturbance * 0.12);
  const health = numericHealthProfile(pressure, art.disturbance, mapped);
  const cacheDisruption = clamp(1 - values.cache_hit_rate);
  const asymmetry = clamp(cacheDisruption * 0.3 + mapped.phaseDisagreement * 0.31 + mapped.granularFracture * 0.19 + art.propagation * 0.12 + health.asymmetryBias);
  const coherence = clamp((1 - pressure * 0.47 - mapped.phaseDisagreement * 0.24 - art.coherencePulse * 0.14) * health.coherenceScale, 0.1, 1);
  const seedPhase = FIELD_VISUAL_SEED * Math.PI * 2;
  const phase = visualTime * (0.18 + mapped.emissionRate * 0.76) + seedPhase;
  const breathing = 0.5 + Math.sin(phase * 0.43) * 0.5;

  const centerX = width * (0.5 + asymmetry * 0.035 * Math.sin(visualTime * 0.15 + seedPhase));
  const centerY = height * (0.5 + pressure * 0.014 - art.recovery * 0.008);
  const radiusX = width * (0.395 + mapped.lateralSpread * 0.035) * health.widthScale * (1 - art.compression * art.disturbance * 0.045);
  const radiusY = height * (0.35 + mapped.aperture * 0.045 + art.stretch * 0.045) * health.heightScale;
  const baseRadius = Math.min(radiusX, radiusY);
  const depthSpan = Math.min(width, height) * (0.16 + coherence * 0.055 + mapped.afterimage * 0.025);
  const tilt = (asymmetry * 0.12 + mapped.phaseDisagreement * 0.065) * Math.sin(phase * 0.27);
  const torsion = (mapped.phaseDisagreement * 0.18 + art.disturbance * 0.12) * Math.sin(phase * 0.31);
  const deformation = clamp(health.severity * 0.52 + art.disturbance * 0.38 + mapped.granularFracture * 0.24);
  const signature = signatureState(art, mapped, health, coherence);

  return Object.freeze({
    health,
    mapped,
    art,
    pressure,
    cacheDisruption,
    asymmetry,
    coherence,
    seedPhase,
    centerX,
    centerY,
    baseRadius,
    radiusX,
    radiusY,
    depthSpan,
    tilt,
    torsion,
    deformation,
    breathing,
    signature,
    phase,
  });
}