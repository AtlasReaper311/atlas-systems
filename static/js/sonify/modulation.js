import {
  MAX_COMPONENTS,
  canonicalStatus,
  clamp,
  normalizeLatency,
} from "./mapping.js?v=20260720-vector-three";

/**
 * Continuous live-telemetry modulation for System SYMPHONY.
 *
 * The H1-H8 score remains the musical authority. A perfectly healthy live frame
 * passes through unchanged. As real estate pressure rises this module adds only
 * small, bounded amounts of energy to fields the existing engine already owns.
 * It never changes harmony, mode, sample palette, global low-pass cutoff,
 * detuning or note confidence.
 */

export const DEPLOYMENT_AFTERGLOW_MS = 60_000;
export const STALE_HOLD_MS = 10_000;
export const STALE_UNKNOWN_MS = 30_000;
export const MODULATION_ATTACK_MS = 2_500;
export const MODULATION_RELEASE_MS = 12_000;

const SUCCESS_STATUSES = new Set(["success", "passed", "healthy", "ok"]);
const ACTIVE_STATUSES = new Set([
  "queued",
  "pending",
  "in_progress",
  "in-progress",
  "running",
  "building",
]);
const FAILURE_STATUSES = new Set(["failure", "failed", "error", "cancelled"]);

const SMOOTHED_KEYS = Object.freeze([
  "pressure",
  "healthPressure",
  "coveragePressure",
  "latencyPressure",
  "uptimePressure",
  "errorPressure",
  "incidentPressure",
  "componentLoad",
]);

function finiteValues(values) {
  return values.filter((value) => Number.isFinite(value));
}

function average(values) {
  if (!values.length) return null;
  return values.reduce((total, value) => total + value, 0) / values.length;
}

function deploymentStatus(deployment) {
  return String(deployment?.status ?? "unknown").toLowerCase();
}

export function successfulDeploymentIdentity(deployment) {
  if (!deployment || !SUCCESS_STATUSES.has(deploymentStatus(deployment))) return null;
  const identity = deployment.deployId ?? deployment.commitSha ?? deployment.identity;
  return identity == null || identity === "" ? null : String(identity);
}

export function deploymentPressureFor(deployment) {
  const status = deploymentStatus(deployment);
  if (FAILURE_STATUSES.has(status)) return 1;
  if (ACTIVE_STATUSES.has(status)) return 0.35;
  return 0;
}

function deriveCoverage(payload, services) {
  if (Number.isFinite(payload?.estate?.known_service_ratio)) {
    return clamp(payload.estate.known_service_ratio, 0, 1);
  }
  if (!services.length) return 0;
  const known = services.filter(
    (service) => service?.measured !== false
      && canonicalStatus(service?.status) !== "unknown",
  );
  return clamp(known.length / services.length, 0, 1);
}

export function deploymentAfterglowEnergy(startedAt, now) {
  if (!Number.isFinite(startedAt) || !Number.isFinite(now) || now < startedAt) return 0;
  const age = now - startedAt;
  if (age >= DEPLOYMENT_AFTERGLOW_MS) return 0;
  const normalized = 1 - age / DEPLOYMENT_AFTERGLOW_MS;
  return clamp(normalized * normalized, 0, 1);
}

export function deriveContinuousModulation(
  payload = {},
  deployment = null,
  { deploymentEnergy = 0 } = {},
) {
  const services = Array.isArray(payload?.services) ? payload.services : [];
  const measured = services.filter((service) => service?.measured !== false);

  const overallHealth = Number.isFinite(payload?.estate?.overall_health)
    ? clamp(payload.estate.overall_health, 0, 1)
    : null;
  const coverage = deriveCoverage(payload, services);

  const latencyOpenness = finiteValues(
    measured.map((service) => normalizeLatency(service?.latency_ms)),
  );
  const uptimeSamples = finiteValues(measured.map((service) => service?.uptime_pct));
  const errorSamples = finiteValues(measured.map((service) => service?.error_rate));

  const meanLatencyOpenness = average(latencyOpenness);
  const meanUptime = average(uptimeSamples);
  const meanErrorRate = average(errorSamples);

  const healthPressure = overallHealth === null ? 0 : 1 - overallHealth;
  const coveragePressure = 1 - coverage;
  const latencyPressure = meanLatencyOpenness === null
    ? 0
    : clamp(1 - meanLatencyOpenness, 0, 1);
  const uptimePressure = meanUptime === null
    ? 0
    : clamp(1 - meanUptime / 100, 0, 1);
  const errorPressure = meanErrorRate === null
    ? 0
    : clamp(Math.sqrt(Math.max(0, meanErrorRate)), 0, 1);
  const incidentPressure = Number.isFinite(payload?.estate?.active_incidents)
    ? clamp(Math.max(0, payload.estate.active_incidents) / 4, 0, 1)
    : 0;
  const deploymentPressure = deploymentPressureFor(deployment);
  const componentLoad = clamp(services.length / MAX_COMPONENTS, 0, 1);

  const pressure = clamp(
    healthPressure * 0.34
      + latencyPressure * 0.2
      + errorPressure * 0.18
      + uptimePressure * 0.1
      + incidentPressure * 0.12
      + deploymentPressure * 0.06,
    0,
    1,
  );

  const spectralOpenness = clamp(
    1
      - latencyPressure * 0.5
      - errorPressure * 0.2
      - healthPressure * 0.15
      - incidentPressure * 0.1
      - coveragePressure * 0.05,
    0,
    1,
  );

  return Object.freeze({
    pressure,
    healthPressure,
    coverage,
    coveragePressure,
    latencyPressure,
    uptimePressure,
    errorPressure,
    incidentPressure,
    deploymentPressure,
    deploymentEnergy: clamp(deploymentEnergy, 0, 1),
    componentLoad,
    spectralOpenness,
    deploymentStatus: deploymentStatus(deployment),
  });
}

function smoothingAlpha(elapsedMs, timeConstantMs) {
  if (!Number.isFinite(elapsedMs) || elapsedMs <= 0) return 1;
  if (!Number.isFinite(timeConstantMs) || timeConstantMs <= 0) return 1;
  return clamp(1 - Math.exp(-elapsedMs / timeConstantMs), 0, 1);
}

export function smoothModulation(
  previous,
  target,
  elapsedMs,
  {
    attackMs = MODULATION_ATTACK_MS,
    releaseMs = MODULATION_RELEASE_MS,
  } = {},
) {
  if (!previous) return target;
  const next = { ...target };
  for (const key of SMOOTHED_KEYS) {
    const priorValue = Number.isFinite(previous[key]) ? previous[key] : target[key];
    const targetValue = Number.isFinite(target[key]) ? target[key] : priorValue;
    const timeConstant = targetValue > priorValue ? attackMs : releaseMs;
    const alpha = smoothingAlpha(elapsedMs, timeConstant);
    next[key] = priorValue + (targetValue - priorValue) * alpha;
  }
  next.coverage = 1 - next.coveragePressure;
  next.spectralOpenness = target.spectralOpenness;
  next.deploymentEnergy = target.deploymentEnergy;
  next.deploymentPressure = target.deploymentPressure;
  return Object.freeze(next);
}

export function staleDecayFor(staleAgeMs) {
  if (!Number.isFinite(staleAgeMs) || staleAgeMs <= STALE_HOLD_MS) return 0;
  return clamp(
    (staleAgeMs - STALE_HOLD_MS) / (STALE_UNKNOWN_MS - STALE_HOLD_MS),
    0,
    1,
  );
}

/**
 * Apply a continuous control vector without changing the established H1-H8
 * musical grammar. Zero pressure and zero deployment afterglow are bit-for-bit
 * neutral for every audio field this function touches.
 */
export function applyContinuousTelemetryModulation(
  frame,
  modulation,
  { staleDecay = 0 } = {},
) {
  if (!frame || typeof frame !== "object") {
    throw new TypeError("system-symphony: continuous modulation requires a score frame");
  }
  const safeModulation = modulation ?? deriveContinuousModulation();
  const pressure = clamp(safeModulation.pressure ?? 0, 0, 1);
  const deploymentEnergy = clamp(safeModulation.deploymentEnergy ?? 0, 0, 1);
  const componentLoad = clamp(safeModulation.componentLoad ?? 0, 0, 1);
  const decay = clamp(staleDecay, 0, 1);

  const liveIntensity = pressure * (0.9 + componentLoad * 0.1);
  const tempoLift = liveIntensity * 3 + deploymentEnergy * 2;
  const densityLift = liveIntensity * 0.06 + deploymentEnergy * 0.03;
  const gainLiftDb = liveIntensity * 0.3 + deploymentEnergy * 0.3;
  const voiceLift = liveIntensity * 0.04 + deploymentEnergy * 0.02;
  const velocityLift = liveIntensity * 0.05 + deploymentEnergy * 0.03;

  const voices = Array.isArray(frame.voices)
    ? frame.voices.map((voice) => ({
        ...voice,
        density: clamp(
          voice.density * (1 + densityLift) * (1 - decay * 0.08),
          0,
          Math.max(voice.density, 1.45),
        ),
        voiceGain: clamp(
          voice.voiceGain * (1 + voiceLift) * (1 - decay * 0.12),
          0,
          Math.max(voice.voiceGain, 0.86),
        ),
        velocity: clamp(
          voice.velocity * (1 + velocityLift) * (1 - decay * 0.06),
          0,
          Math.max(voice.velocity, 0.64),
        ),
      }))
    : [];

  return {
    ...frame,
    bpm: clamp(frame.bpm + tempoLift, frame.bpm, frame.bpm + 5),
    density: clamp(
      frame.density * (1 + densityLift) * (1 - decay * 0.06),
      0,
      Math.max(frame.density, 1.12),
    ),
    masterGainDb: clamp(
      frame.masterGainDb + gainLiftDb - decay * 0.45,
      -14,
      -3,
    ),
    modulation: Object.freeze({
      ...safeModulation,
      staleDecay: decay,
      tempoLiftBpm: tempoLift,
      densityLift,
      gainLiftDb,
    }),
    voices,
  };
}

function timestampMs(value) {
  if (typeof value !== "string") return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Stateful control-rate coordinator for live mode only. It preserves the last
 * honest score during brief telemetry gaps, smooths continuous pressure with a
 * fast attack and slower release, and adds a decaying successful-deployment
 * afterglow. Demo/Ghost Circuit frames do not pass through this controller.
 */
export function createPersistentTelemetryModulator({ now = () => Date.now() } = {}) {
  let lastGoodFrame = null;
  let lastGoodPayload = null;
  let lastGoodAt = null;
  let lastUpdateAt = null;
  let smoothed = null;
  let deploymentStartedAt = null;
  let deploymentIdentity = null;

  function observeDeployment(deploymentEvent, currentNow) {
    const identity = successfulDeploymentIdentity(deploymentEvent);
    if (!identity || identity === deploymentIdentity) return;
    deploymentIdentity = identity;
    deploymentStartedAt = currentNow;
  }

  function update({
    frame,
    payload = {},
    deployment = null,
    deploymentEvent = null,
    at = now(),
  }) {
    if (!frame || typeof frame !== "object") {
      throw new TypeError("system-symphony: persistent modulation requires a score frame");
    }

    observeDeployment(deploymentEvent, at);
    const deploymentEnergy = deploymentAfterglowEnergy(deploymentStartedAt, at);
    const elapsedMs = lastUpdateAt === null ? null : Math.max(0, at - lastUpdateAt);
    lastUpdateAt = at;

    if (!frame.stale) {
      lastGoodFrame = frame;
      lastGoodPayload = payload;
      lastGoodAt = timestampMs(frame.lastSuccessfulAt) ?? at;
    }

    const staleAgeMs = frame.stale && lastGoodFrame
      ? Math.max(0, at - (lastGoodAt ?? at))
      : 0;
    const retainLastGood = Boolean(
      frame.stale
        && lastGoodFrame
        && staleAgeMs < STALE_UNKNOWN_MS,
    );
    const basisFrame = retainLastGood
      ? {
          ...lastGoodFrame,
          stale: true,
          timestamp: frame.timestamp,
          lastSuccessfulAt: frame.lastSuccessfulAt ?? lastGoodFrame.lastSuccessfulAt,
        }
      : frame;
    const basisPayload = retainLastGood ? lastGoodPayload ?? payload : payload;

    const target = deriveContinuousModulation(
      basisPayload,
      deployment,
      { deploymentEnergy },
    );
    smoothed = smoothModulation(smoothed, target, elapsedMs);
    const staleDecay = retainLastGood ? staleDecayFor(staleAgeMs) : 0;
    const output = applyContinuousTelemetryModulation(
      basisFrame,
      smoothed,
      { staleDecay },
    );

    return {
      frame: output,
      modulation: output.modulation,
      retainedLastGood: retainLastGood,
      staleAgeMs,
      deploymentEnergy,
    };
  }

  return {
    update,
    getSnapshot: () => ({
      lastGoodFrame,
      lastGoodPayload,
      lastGoodAt,
      lastUpdateAt,
      modulation: smoothed,
      deploymentStartedAt,
      deploymentIdentity,
    }),
    reset() {
      lastGoodFrame = null;
      lastGoodPayload = null;
      lastGoodAt = null;
      lastUpdateAt = null;
      smoothed = null;
      deploymentStartedAt = null;
      deploymentIdentity = null;
    },
  };
}
