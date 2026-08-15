"use strict";

import { TARGET_BY_ID, clamp } from "./domain.js";

/*
 * Shared physical-state layer for the Spectral Forge organism.
 *
 * Scenario code owns synthetic telemetry. This module knows only numeric signal
 * state, mapped outputs, their motion through time, a stable spatial seed, and
 * the existing organism lifetime. The result is therefore a physical response
 * to evidence rather than a scenario-name animation table.
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

const MAX_EVENTS = 4;
const MAX_SCARS = 4;
const EVENT_COOLDOWN = Object.freeze({
  "support-loss": 5.2,
  "pressure-front": 4.4,
  "instability-pulse": 3.2,
  "fracture-front": 7.5,
  "recovery-wave": 5.5,
});

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

function finite(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

function targetNormalised(id, outputs) {
  const definition = TARGET_BY_ID[id];
  const value = outputs?.[id];
  if (!definition || !Number.isFinite(value)) return 0;
  return clamp((value - definition.min) / Math.max(0.001, definition.max - definition.min));
}

function copySignals(frame) {
  return Object.fromEntries(SIGNAL_KEYS.map((id) => [id, clamp(frame?.normalised?.[id] ?? 0)]));
}

function seededUnit(seed, lane) {
  const value = Math.sin((finite(seed) * 0.017 + lane * 91.173) * 12.9898) * 43758.5453;
  return value - Math.floor(value);
}

function normalise3(x, y, z) {
  const length = Math.hypot(x, y, z) || 1;
  return Object.freeze({ x: x / length, y: y / length, z: z / length });
}

function eventAxis(seed, sequence) {
  const a = seededUnit(seed, 5100 + sequence * 7) * Math.PI * 2;
  const y = seededUnit(seed, 5101 + sequence * 7) * 1.36 - 0.68;
  const radius = Math.sqrt(Math.max(0.08, 1 - y * y));
  return normalise3(
    Math.cos(a) * radius,
    y,
    0.2 + Math.sin(a) * radius * 0.62,
  );
}

function eventDuration(kind, strength) {
  if (kind === "fracture-front") return 10.5 + strength * 4.5;
  if (kind === "recovery-wave") return 6.5 + strength * 3.5;
  if (kind === "support-loss") return 6 + strength * 3;
  if (kind === "instability-pulse") return 3 + strength * 2.4;
  return 4.8 + strength * 2.8;
}

function eventEnvelope(progress) {
  const t = clamp(progress);
  const rise = clamp(t / 0.24);
  const fall = clamp((1 - t) / 0.32);
  const edge = Math.min(rise, fall);
  return edge * edge * (3 - 2 * edge);
}

function responseStep(current, target, dt, attack, release) {
  const tau = target > current ? attack : release;
  const alpha = 1 - Math.exp(-Math.max(0, dt) / Math.max(0.04, tau));
  return clamp(current + (target - current) * alpha);
}

function createEvent(kind, strength, lifeTime, model, scenarioSeed) {
  const sequence = model.sequence;
  model.sequence += 1;
  const axis = eventAxis(scenarioSeed, sequence);
  return {
    kind,
    strength: clamp(strength),
    start: lifeTime,
    duration: eventDuration(kind, strength),
    progress: 0,
    envelope: 0,
    axis,
    sequence,
  };
}

function addScar(model, event, lifeTime) {
  if (!event || event.kind === "pressure-front" || event.kind === "instability-pulse") return;
  const severity = clamp(event.strength * (event.kind === "fracture-front" ? 1 : 0.72));
  if (severity < 0.34) return;
  model.scars.push({
    axis: event.axis,
    strength: severity,
    createdAt: lifeTime,
    halfLife: event.kind === "fracture-front" ? 18 + severity * 12 : 9 + severity * 8,
  });
  if (model.scars.length > MAX_SCARS) model.scars.splice(0, model.scars.length - MAX_SCARS);
}

function advanceEvents(model, lifeTime) {
  const active = [];
  for (const event of model.events) {
    const progress = (lifeTime - event.start) / Math.max(0.001, event.duration);
    if (progress >= 1) {
      addScar(model, event, lifeTime);
      continue;
    }
    if (progress < 0) continue;
    event.progress = clamp(progress);
    event.envelope = eventEnvelope(event.progress);
    active.push(event);
  }
  model.events = active.slice(-MAX_EVENTS);

  model.scars = model.scars
    .map((scar) => {
      const age = Math.max(0, lifeTime - scar.createdAt);
      return { ...scar, current: scar.strength * (2 ** (-age / Math.max(1, scar.halfLife))) };
    })
    .filter((scar) => scar.current > 0.035)
    .slice(-MAX_SCARS);
}

function eventInfluence(event) {
  return event ? clamp(event.strength * event.envelope) : 0;
}

function dominantEvent(model) {
  let best = null;
  let score = 0;
  for (const event of model.events) {
    const influence = eventInfluence(event);
    if (influence > score) {
      score = influence;
      best = event;
    }
  }
  if (!best) return null;
  return Object.freeze({
    kind: best.kind,
    strength: best.strength,
    progress: best.progress,
    envelope: best.envelope,
    influence: score,
    axis: best.axis,
    sequence: best.sequence,
  });
}

function maybeEvent(model, kind, strength, threshold, lifeTime, scenarioSeed) {
  if (strength < threshold) return;
  const last = model.lastTrigger[kind] ?? -Infinity;
  const cooldown = EVENT_COOLDOWN[kind] ?? 4;
  if (lifeTime - last < cooldown) return;
  model.lastTrigger[kind] = lifeTime;
  model.events.push(createEvent(kind, strength, lifeTime, model, scenarioSeed));
  if (model.events.length > MAX_EVENTS) model.events.splice(0, model.events.length - MAX_EVENTS);
}

export function createPhysicalStateModel() {
  return {
    values: { ...DEFAULT_VALUES },
    target: { ...DEFAULT_VALUES },
    trends: Object.fromEntries(SIGNAL_KEYS.map((id) => [id, 0])),
    previousSignals: null,
    lastLifeTime: null,
    lastStress: 0,
    fractureDrive: 0,
    events: [],
    scars: [],
    lastTrigger: Object.create(null),
    sequence: 0,
    dominantEvent: null,
    scarInfluence: 0,
  };
}

export function resetPhysicalStateModel(model) {
  if (!model) return model;
  Object.assign(model.values, DEFAULT_VALUES);
  Object.assign(model.target, DEFAULT_VALUES);
  for (const id of SIGNAL_KEYS) model.trends[id] = 0;
  model.previousSignals = null;
  model.lastLifeTime = null;
  model.lastStress = 0;
  model.fractureDrive = 0;
  model.events = [];
  model.scars = [];
  model.lastTrigger = Object.create(null);
  model.sequence = 0;
  model.dominantEvent = null;
  model.scarInfluence = 0;
  return model;
}

export function stepPhysicalState(model, {
  frame,
  outputs,
  lifeTime,
  scenarioSeed = 0,
  audioExpression = 0,
} = {}) {
  if (!model) model = createPhysicalStateModel();
  const now = Math.max(0, finite(lifeTime));
  const signals = copySignals(frame);
  const first = model.lastLifeTime == null || !model.previousSignals;
  const rawDt = first ? 0.016 : now - model.lastLifeTime;
  const dt = clamp(rawDt, 0.001, 0.05);

  if (!first && rawDt < -0.001) resetPhysicalStateModel(model);

  const previous = model.previousSignals ?? signals;
  for (const id of SIGNAL_KEYS) {
    const rawVelocity = clamp((signals[id] - previous[id]) / Math.max(dt, 0.016), -3, 3);
    const alpha = 1 - Math.exp(-dt / 0.38);
    model.trends[id] += (rawVelocity - model.trends[id]) * alpha;
  }
  model.previousSignals = signals;
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
  } else {
    for (const key of PHYSICAL_STATE_KEYS) {
      const response = RESPONSE[key];
      let release = response.release;
      if (key === "memory") release = 10 + model.values.memory * 20;
      model.values[key] = responseStep(model.values[key], model.target[key], dt, response.attack, release);
    }
  }

  model.fractureDrive = clamp(
    (1 - model.values.cohesion) * 0.34
    + model.values.instability * 0.2
    + model.values.propagation * 0.18
    + model.values.pressure * 0.13
    + model.values.memory * 0.15,
  );
  model.lastStress = stressNow;

  advanceEvents(model, now);
  maybeEvent(model, "support-loss", clamp(cacheLossRise * 0.62 + cacheLoss * 0.38), 0.46, now, scenarioSeed);
  maybeEvent(model, "pressure-front", clamp(requestRise * 0.34 + queueRise * 0.24 + pressureTarget * 0.42), 0.58, now, scenarioSeed);
  maybeEvent(model, "instability-pulse", clamp(motionEnergy * 0.58 + instabilityTarget * 0.42), 0.6, now, scenarioSeed);
  maybeEvent(model, "fracture-front", model.fractureDrive, 0.68, now, scenarioSeed);
  maybeEvent(model, "recovery-wave", clamp(recoveryTarget * 0.78 + stressFall * 0.22), 0.52, now, scenarioSeed);
  advanceEvents(model, now);

  model.dominantEvent = dominantEvent(model);
  model.scarInfluence = clamp(model.scars.reduce((sum, scar) => sum + (scar.current ?? scar.strength ?? 0) * 0.45, 0));

  return physicalStateSnapshot(model);
}

export function physicalStateSnapshot(model) {
  const values = Object.freeze(Object.fromEntries(PHYSICAL_STATE_KEYS.map((key) => [key, clamp(model?.values?.[key] ?? DEFAULT_VALUES[key])])));
  return Object.freeze({
    ...values,
    fractureDrive: clamp(model?.fractureDrive ?? 0),
    dominantEvent: model?.dominantEvent ?? null,
    activeEventCount: model?.events?.length ?? 0,
    scarInfluence: clamp(model?.scarInfluence ?? 0),
  });
}
