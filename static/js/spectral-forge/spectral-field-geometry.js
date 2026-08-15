"use strict";

import { clamp } from "./domain.js";
import { FIELD_VISUAL_SEED, fieldArtState, visualTargetState } from "./spectral-field-model.js";
import {
  createPhysicalStateModel,
  stepPhysicalState,
} from "./spectral-field-physical-state.js";
import { resolveScenarioFrame } from "./spectral-field-scenario-clock.js";

function numericHealthProfile(pressure, disturbance, mapped, physical) {
  const severity = clamp(
    pressure * 0.34
    + disturbance * 0.2
    + physical.instability * 0.15
    + (1 - physical.cohesion) * 0.16
    + physical.memory * 0.09
    + mapped.granularFracture * 0.06,
  );
  return Object.freeze({
    severity,
    asymmetryBias: severity * 0.12,
    coherenceScale: 1 - severity * 0.28,
    widthScale: 1 - physical.compression * 0.085 - severity * 0.018,
    heightScale: 1 + physical.stretch * 0.075 + severity * 0.015,
    fractureScale: 0.76 + severity * 0.62 + physical.fractureDrive * 0.18,
  });
}

function signatureState(art, mapped, health, coherence) {
  const physical = art.physical;
  return Object.freeze({
    apertureOpen: mapped.aperture > 0.58 && coherence > 0.48,
    propagationWave: physical.propagation > 0.32,
    latticeSnap: physical.instability > 0.5 && mapped.phaseDisagreement > 0.22,
    fracturePlane: physical.fractureDrive > 0.48 || health.severity > 0.58,
    phaseSlip: physical.instability > 0.42,
    reformation: physical.recovery > 0.48 && physical.surfaceTension > 0.5,
  });
}

function physicalStateFor(state, frame, outputs, visualTime) {
  const host = state.organismLife;
  const model = host?.physical ?? createPhysicalStateModel();
  if (host && !host.physical) host.physical = model;
  return stepPhysicalState(model, {
    frame,
    outputs,
    lifeTime: visualTime,
    scenarioSeed: FIELD_VISUAL_SEED,
    audioExpression: host?.audioExpression ?? 0,
  });
}

function mergeArtState(base, physical) {
  const event = physical.dominantEvent;
  const eventInfluence = event?.influence ?? 0;
  const eventAxis = event?.axis ?? Object.freeze({ x: 0, y: 0, z: 1 });
  const localFailure = event?.kind === "support-loss" || event?.kind === "fracture-front";
  const restorative = event?.kind === "recovery-wave";
  return Object.freeze({
    ...base,
    physical,
    origin: localFailure ? clamp(0.5 + eventAxis.x * 0.34, 0.08, 0.92) : base.origin,
    direction: clamp(base.direction * 0.42 + eventAxis.x * eventInfluence * 0.58, -1, 1),
    compression: clamp(base.compression * 0.25 + physical.compression * 0.75),
    stretch: clamp(base.stretch * 0.22 + physical.stretch * 0.78),
    propagation: clamp(base.propagation * 0.28 + physical.propagation * 0.62 + eventInfluence * 0.1),
    coherencePulse: clamp(base.coherencePulse * 0.22 + physical.instability * 0.68 + eventInfluence * 0.1),
    fractureBias: clamp(
      base.fractureBias * 0.18
      + physical.fractureDrive * 0.54
      + physical.memory * 0.16
      + physical.scarInfluence * 0.12,
    ),
    disturbance: clamp(
      base.disturbance * 0.2
      + physical.pressure * 0.31
      + physical.instability * 0.27
      + physical.memory * 0.14
      + eventInfluence * 0.08,
    ),
    recovery: clamp(base.recovery * 0.22 + physical.recovery * 0.64 + (restorative ? eventInfluence * 0.14 : 0)),
    bloomBias: clamp(base.bloomBias * 0.45 + physical.surfaceTension * physical.recovery * 0.42 + physical.peakRecruitment * 0.13),
    eventAxis,
    eventInfluence,
    eventKind: event?.kind ?? "none",
  });
}

export function deriveFieldGeometry(state, visualTime, width, height, timestamp = performance.now()) {
  const { outputs } = state;
  const frame = resolveScenarioFrame(state.frame, state.scenarioHandoff, timestamp);
  const mapped = visualTargetState(outputs);
  const physical = physicalStateFor(state, frame, outputs, visualTime);
  const baseArt = fieldArtState(frame, mapped);
  const art = mergeArtState(baseArt, physical);
  const values = frame.normalised;
  const pressure = physical.pressure;
  const health = numericHealthProfile(pressure, art.disturbance, mapped, physical);
  const cacheDisruption = clamp(1 - values.cache_hit_rate);
  const eventInfluence = physical.dominantEvent?.influence ?? 0;
  const eventAxis = physical.dominantEvent?.axis ?? { x: 0, y: 0, z: 0 };
  const asymmetry = clamp(
    cacheDisruption * 0.08
    + mapped.phaseDisagreement * 0.12
    + physical.instability * 0.28
    + physical.propagation * 0.18
    + (1 - physical.cohesion) * 0.18
    + Math.abs(eventAxis.x) * eventInfluence * 0.08
    + health.asymmetryBias,
  );
  const coherence = clamp(physical.cohesion * health.coherenceScale, 0.08, 1);
  const seedPhase = FIELD_VISUAL_SEED * Math.PI * 2;
  const phase = visualTime * (0.18 + mapped.emissionRate * 0.62 + physical.peakRecruitment * 0.16) + seedPhase;
  const breathing = 0.5 + Math.sin(phase * (0.38 + physical.viscosity * -0.11)) * 0.5;

  const centerX = width * (
    0.5
    + asymmetry * 0.026 * Math.sin(visualTime * 0.15 + seedPhase)
    + eventAxis.x * eventInfluence * 0.018
  );
  const centerY = height * (
    0.5
    + pressure * 0.012
    - physical.recovery * 0.008
    + eventAxis.y * eventInfluence * 0.012
  );
  const radiusX = width
    * (0.395 + mapped.lateralSpread * 0.028)
    * health.widthScale
    * (1 - physical.compression * 0.055);
  const radiusY = height
    * (0.35 + mapped.aperture * 0.035 + physical.stretch * 0.075)
    * health.heightScale;
  const baseRadius = Math.min(radiusX, radiusY);
  const depthSpan = Math.min(width, height) * (
    0.16 + coherence * 0.05 + mapped.afterimage * 0.018 + physical.memory * 0.012
  );
  const tilt = (
    asymmetry * 0.09
    + physical.propagation * eventAxis.y * eventInfluence * 0.08
    + mapped.phaseDisagreement * 0.035
  ) * Math.sin(phase * 0.27);
  const torsion = (
    physical.instability * 0.19
    + art.disturbance * 0.07
    + eventAxis.z * eventInfluence * 0.07
  ) * Math.sin(phase * 0.31);
  const deformation = clamp(
    health.severity * 0.24
    + art.disturbance * 0.17
    + (1 - physical.cohesion) * 0.23
    + physical.fractureDrive * 0.2
    + physical.memory * 0.1
    + physical.scarInfluence * 0.06,
  );
  const signature = signatureState(art, mapped, health, coherence);

  return Object.freeze({
    health,
    mapped,
    art,
    physical,
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
