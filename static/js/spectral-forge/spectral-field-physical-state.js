"use strict";

import { TARGET_BY_ID, clamp } from "./domain.js";
import {
  createMaterialState,
  materialEvidence,
  resetMaterialState,
  stepMaterialState,
} from "./spectral-field-material.js";

/*
 * Shared physical-state layer for the Spectral Forge organism.
 *
 * Scenario code owns synthetic telemetry. This module knows only numeric signal
 * state, mapped outputs, their motion through time, a stable spatial seed, and
 * the existing organism lifetime. The result is therefore a physical response
 * to evidence rather than a scenario-name animation table.
 *
 * The eleven canonical values answer "how much". The material layer this module
 * owns answers "where, which way, and by which permitted mechanism". Both are
 * updated from the same evidence in the same step, so there is one source of
 * physical truth.
 *
 * Hot-path discipline: the model is preallocated and mutated in place, and the
 * published snapshot is a stable object rather than a fresh frozen copy per
 * frame. This runs inside the render loop on every visible Field view.
 */

export const PHYSICAL_STATE_KEYS = Object.freeze([
  "pressure",
  "compression",
  "stretch",
  "viscosity",
  "cohesion",
  "instability",
  "propagation",
  "peakRecruitment",
  "surfaceTension",
  "recovery",
  "memory",
]);

const SIGNAL_KEYS = Object.freeze([
  "request_rate",
  "latency_ms",
  "error_rate",
  "queue_depth",
  "cache_hit_rate",
  "cpu_load",
  "anomaly_score",
]);

const RESPONSE = Object.freeze({
  pressure: Object.freeze({ attack: 0.62, release: 2.6 }),
  compression: Object.freeze({ attack: 0.48, release: 2.1 }),
  stretch: Object.freeze({ attack: 2.2, release: 5.8 }),
  viscosity: Object.freeze({ attack: 2.8, release: 7.5 }),
  cohesion: Object.freeze({ attack: 1.4, release: 5.5 }),
  instability: Object.freeze({ attack: 0.34, release: 1.65 }),
  propagation: Object.freeze({ attack: 0.72, release: 2.8 }),
  peakRecruitment: Object.freeze({ attack: 0.24, release: 0.95 }),
  surfaceTension: Object.freeze({ attack: 1.25, release: 4.2 }),
  recovery: Object.freeze({ attack: 1.1, release: 4.8 }),
  memory: Object.freeze({ attack: 1.8, release: 18 }),
});

const DEFAULT_VALUES = Object.freeze({
  pressure: 0.12,
  compression: 0.16,
  stretch: 0.06,
  viscosity: 0.1,
  cohesion: 0.9,
  instability: 0.08,
  propagation: 0.08,
  peakRecruitment: 0.2,
  surfaceTension: 0.82,
  recovery: 0.12,
  memory: 0,
});

/* Integration is sub-stepped rather than clamped. A single hard clamp made the
 * organism's physics frame-rate dependent: below 20fps the real interval
 * exceeded the clamp, so accumulation - damage, fracture charge, memory - ran at
 * up to half speed and a severe condition never reached the states its
 * telemetry had earned. Sub-stepping keeps each step small enough to stay
 * stable while advancing by the time that actually elapsed. */
const MAX_SUB_STEP_SECONDS = 0.05;
const MAX_SUB_STEPS = 6;
const MAX_ELAPSED_SECONDS = MAX_SUB_STEP_SECONDS * MAX_SUB_STEPS;

function finite(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

function targetNormalised(id, outputs) {
  const definition = TARGET_BY_ID[id];
  const value = outputs?.[id];
  if (!definition || !Number.isFinite(value)) return 0;
  return clamp((value - definition.min) / Math.max(0.001, definition.max - definition.min));
}

function responseStep(current, target, dt, attack, release) {
  const tau = target > current ? attack : release;
  const alpha = 1 - Math.exp(-Math.max(0, dt) / Math.max(0.04, tau));
  return clamp(current + (target - current) * alpha);
}

function createSnapshot() {
  const snapshot = {};
  for (const key of PHYSICAL_STATE_KEYS) snapshot[key] = DEFAULT_VALUES[key];
  snapshot.fractureDrive = 0;
  snapshot.regime = "coherent";
  snapshot.material = null;
  snapshot.scarInfluence = 0;
  return snapshot;
}

export function createPhysicalStateModel(seed = 0.731) {
  return {
    values: { ...DEFAULT_VALUES },
    target: { ...DEFAULT_VALUES },
    trends: Object.fromEntries(SIGNAL_KEYS.map((id) => [id, 0])),
    signals: Object.fromEntries(SIGNAL_KEYS.map((id) => [id, 0])),
    previousSignals: Object.fromEntries(SIGNAL_KEYS.map((id) => [id, 0])),
    hasPrevious: false,
    lastLifeTime: null,
    lastStress: 0,
    fractureDrive: 0,
    material: createMaterialState(seed),
    snapshot: createSnapshot(),
  };
}

export function resetPhysicalStateModel(model) {
  if (!model) return model;
  Object.assign(model.values, DEFAULT_VALUES);
  Object.assign(model.target, DEFAULT_VALUES);
  for (const id of SIGNAL_KEYS) {
    model.trends[id] = 0;
    model.signals[id] = 0;
    model.previousSignals[id] = 0;
  }
  model.hasPrevious = false;
  model.lastLifeTime = null;
  model.lastStress = 0;
  model.fractureDrive = 0;
  resetMaterialState(model.material);
  return model;
}

export function stepPhysicalState(model, {
  frame,
  outputs,
  lifeTime,
  scenarioSeed = 0,
  audioExpression = 0,
} = {}) {
  if (!model) model = createPhysicalStateModel(scenarioSeed || 0.731);
  const now = Math.max(0, finite(lifeTime));
  const first = model.lastLifeTime == null || !model.hasPrevious;
  const rawDt = first ? 0.016 : now - model.lastLifeTime;
  const elapsed = clamp(rawDt, 0.001, MAX_ELAPSED_SECONDS);
  const subSteps = Math.min(MAX_SUB_STEPS, Math.max(1, Math.ceil(elapsed / MAX_SUB_STEP_SECONDS)));
  const dt = elapsed / subSteps;

  if (!first && rawDt < -0.001) resetPhysicalStateModel(model);

  const signals = model.signals;
  const previous = model.previousSignals;
  for (const id of SIGNAL_KEYS) {
    previous[id] = model.hasPrevious ? signals[id] : clamp(frame?.normalised?.[id] ?? 0);
    signals[id] = clamp(frame?.normalised?.[id] ?? 0);
    const rawVelocity = clamp((signals[id] - previous[id]) / Math.max(elapsed, 0.016), -3, 3);
    const alpha = 1 - Math.exp(-elapsed / 0.38);
    model.trends[id] += (rawVelocity - model.trends[id]) * alpha;
  }
  model.hasPrevious = true;
  model.lastLifeTime = now;

  const demand = signals.request_rate;
  const latency = signals.latency_ms;
  const errors = signals.error_rate;
  const queue = signals.queue_depth;
  const cacheLoss = 1 - signals.cache_hit_rate;
  const cpu = signals.cpu_load;
  const anomaly = signals.anomaly_score;

  const positive = (value) => clamp(Math.max(0, value) / 1.7);
  const negative = (value) => clamp(Math.max(0, -value) / 1.7);
  const requestRise = positive(model.trends.request_rate);
  const latencyRise = positive(model.trends.latency_ms);
  const errorMotion = clamp(Math.abs(model.trends.error_rate) / 1.8);
  const queueRise = positive(model.trends.queue_depth);
  const cacheLossRise = negative(model.trends.cache_hit_rate);
  const cacheRecovery = positive(model.trends.cache_hit_rate);
  const anomalyMotion = clamp(Math.abs(model.trends.anomaly_score) / 1.8);

  const mappedInstability = targetNormalised("instability", outputs);
  const mappedDisplacement = targetNormalised("pulse_intensity", outputs);
  const mappedMicro = targetNormalised("texture_density", outputs);
  const mappedBrilliance = targetNormalised("harmonic_brightness", outputs);
  const mappedFracture = targetNormalised("error_texture", outputs);

  const upstreamPressure = clamp(cacheLoss * 0.46 + demand * 0.29 + cpu * 0.25);
  const downstreamPressure = clamp(latency * 0.31 + queue * 0.31 + errors * 0.24 + cpu * 0.14);
  const lag = clamp(Math.max(0, downstreamPressure - upstreamPressure) * 1.8);
  const motionEnergy = clamp(
    requestRise * 0.18
    + latencyRise * 0.18
    + errorMotion * 0.2
    + queueRise * 0.14
    + cacheLossRise * 0.16
    + anomalyMotion * 0.14,
  );

  const pressureTarget = clamp(
    queue * 0.29
    + cpu * 0.2
    + latency * 0.19
    + demand * 0.15
    + anomaly * 0.12
    + requestRise * 0.05,
  );
  const compressionTarget = clamp(
    demand * 0.4
    + cpu * 0.23
    + queue * 0.22
    + requestRise * 0.15,
  );
  const instabilityTarget = clamp(
    mappedInstability * 0.25
    + motionEnergy * 0.34
    + anomaly * 0.16
    + errors * 0.12
    + lag * 0.08
    + mappedFracture * 0.05,
  );
  const stressNow = clamp(
    pressureTarget * 0.33
    + instabilityTarget * 0.24
    + errors * 0.17
    + anomaly * 0.13
    + cacheLoss * 0.08
    + mappedFracture * 0.05,
  );
  const stressFall = clamp(Math.max(0, model.lastStress - stressNow) * 6.5);
  const recoveryTarget = clamp(
    stressFall * 0.42
    + cacheRecovery * 0.24
    + negative(model.trends.error_rate) * 0.12
    + negative(model.trends.queue_depth) * 0.1
    + negative(model.trends.latency_ms) * 0.08
    + (1 - stressNow) * 0.04,
  );

  const memoryNow = model.values.memory;
  const cohesionTarget = clamp(
    1
    - errors * 0.27
    - anomaly * 0.17
    - instabilityTarget * 0.27
    - cacheLoss * 0.11
    - memoryNow * 0.18,
    0.08,
    1,
  );
  const stretchTarget = clamp(
    latency * 0.56
    + queue * 0.18
    + latencyRise * 0.08
    + memoryNow * 0.11
    + pressureTarget * 0.07,
  );
  const viscosityTarget = clamp(
    latency * 0.43
    + queue * 0.18
    + stretchTarget * 0.2
    + memoryNow * 0.15
    + (1 - recoveryTarget) * 0.04,
  );
  const propagationTarget = clamp(
    cacheLossRise * 0.22
    + lag * 0.24
    + downstreamPressure * 0.2
    + queueRise * 0.1
    + latencyRise * 0.1
    + anomaly * 0.08
    + instabilityTarget * 0.06,
  );
  const peakTarget = clamp(
    mappedDisplacement * 0.27
    + mappedBrilliance * 0.15
    + mappedMicro * 0.11
    + pressureTarget * 0.18
    + instabilityTarget * 0.14
    + clamp(audioExpression) * 0.1
    + 0.05,
  );
  const surfaceTarget = clamp(
    cohesionTarget * 0.55
    + recoveryTarget * 0.23
    + (1 - instabilityTarget) * 0.17
    + (1 - memoryNow) * 0.05,
  );

  const damageEvidence = clamp(
    (1 - cohesionTarget) * 0.34
    + pressureTarget * 0.22
    + instabilityTarget * 0.19
    + errors * 0.1
    + anomaly * 0.09
    + cacheLoss * 0.06,
  );
  const memoryTarget = damageEvidence > 0.42
    ? Math.max(memoryNow, damageEvidence)
    : clamp(damageEvidence * 0.34 * (1 - recoveryTarget * 0.65));

  Object.assign(model.target, {
    pressure: pressureTarget,
    compression: compressionTarget,
    stretch: stretchTarget,
    viscosity: viscosityTarget,
    cohesion: cohesionTarget,
    instability: instabilityTarget,
    propagation: propagationTarget,
    peakRecruitment: peakTarget,
    surfaceTension: surfaceTarget,
    recovery: recoveryTarget,
    memory: memoryTarget,
  });

  if (first) {
    for (const key of PHYSICAL_STATE_KEYS) {
      if (key === "memory") continue;
      model.values[key] = model.target[key];
    }
  }

  /* Targets are constant across the frame; only the integration is sub-stepped,
   * so a slow frame costs a few extra arithmetic passes rather than a stalled
   * organism. The spatial regime advances with it, because its permissions and
   * accumulated charge are what decide which mechanisms may express at all. */
  for (let step = 0; step < subSteps; step += 1) {
    if (!first) {
      for (const key of PHYSICAL_STATE_KEYS) {
        const response = RESPONSE[key];
        let release = response.release;
        if (key === "memory") release = 10 + model.values.memory * 20;
        model.values[key] = responseStep(model.values[key], model.target[key], dt, response.attack, release);
      }
    }
    stepMaterialState(model.material, {
      signals,
      trends: model.trends,
      physical: model.values,
      lifeTime: now - dt * (subSteps - 1 - step),
      dt,
    });
  }

  model.lastStress = stressNow;

  /* Fracture drive is gated by the regime rather than merely scaled by it, so a
   * condition whose regime forbids fracture cannot reach the threshold however
   * long it runs. */
  model.fractureDrive = model.material.permits.fracture
    ? clamp(
      (1 - model.values.cohesion) * 0.3
      + model.values.instability * 0.16
      + model.values.propagation * 0.14
      + model.values.memory * 0.12
      + clamp(model.material.fractureCharge / 2) * 0.28,
    )
    : 0;

  return publishSnapshot(model);
}

function publishSnapshot(model) {
  const snapshot = model.snapshot;
  for (const key of PHYSICAL_STATE_KEYS) snapshot[key] = clamp(model.values[key]);
  snapshot.fractureDrive = clamp(model.fractureDrive);
  snapshot.regime = model.material.regime;
  snapshot.material = model.material;
  snapshot.scarInfluence = clamp(model.material.scarInfluence);
  return snapshot;
}

export function physicalStateSnapshot(model) {
  if (!model) {
    const empty = createSnapshot();
    return empty;
  }
  return model.snapshot ?? publishSnapshot(model);
}

export function physicalStateEvidence(model) {
  if (!model) return null;
  const values = {};
  for (const key of PHYSICAL_STATE_KEYS) values[key] = clamp(model.values[key]);
  return {
    ...values,
    fractureDrive: clamp(model.fractureDrive),
    material: materialEvidence(model.material),
  };
}
