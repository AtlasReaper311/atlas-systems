"use strict";

export const SIGNALS = Object.freeze([
  Object.freeze({ id: "request_rate", label: "REQUEST RATE", unit: "req/s", min: 0, max: 1000, decimals: 0 }),
  Object.freeze({ id: "latency_ms", label: "LATENCY", unit: "ms", min: 20, max: 2000, decimals: 0 }),
  Object.freeze({ id: "error_rate", label: "ERROR RATE", unit: "%", min: 0, max: 20, decimals: 2 }),
  Object.freeze({ id: "queue_depth", label: "QUEUE DEPTH", unit: "jobs", min: 0, max: 1000, decimals: 0 }),
  Object.freeze({ id: "cache_hit_rate", label: "CACHE HIT", unit: "%", min: 0, max: 100, decimals: 1 }),
  Object.freeze({ id: "cpu_load", label: "CPU LOAD", unit: "%", min: 0, max: 100, decimals: 1 }),
  Object.freeze({ id: "anomaly_score", label: "ANOMALY", unit: "", min: 0, max: 1, decimals: 3 }),
]);

export const TARGETS = Object.freeze([
  Object.freeze({ id: "harmonic_brightness", label: "HARMONIC BRIGHTNESS", unit: "%", min: 0, max: 100, defaultValue: 38, decimals: 0 }),
  Object.freeze({ id: "filter_cutoff", label: "FILTER CUTOFF", unit: "Hz", min: 180, max: 8000, defaultValue: 3200, decimals: 0 }),
  Object.freeze({ id: "pulse_rate", label: "PULSE RATE", unit: "Hz", min: 0.25, max: 8, defaultValue: 1.1, decimals: 2 }),
  Object.freeze({ id: "pulse_intensity", label: "PULSE INTENSITY", unit: "%", min: 0, max: 100, defaultValue: 24, decimals: 0 }),
  Object.freeze({ id: "instability", label: "INSTABILITY", unit: "ct", min: 0, max: 35, defaultValue: 2, decimals: 1 }),
  Object.freeze({ id: "texture_density", label: "TEXTURE DENSITY", unit: "%", min: 0, max: 100, defaultValue: 12, decimals: 0 }),
  Object.freeze({ id: "stereo_width", label: "STEREO WIDTH", unit: "%", min: 0, max: 100, defaultValue: 34, decimals: 0 }),
  Object.freeze({ id: "delay", label: "DELAY", unit: "%", min: 0, max: 45, defaultValue: 8, decimals: 0 }),
  Object.freeze({ id: "tonal_level", label: "TONAL LEVEL", unit: "%", min: 0, max: 100, defaultValue: 32, decimals: 0 }),
  Object.freeze({ id: "error_texture", label: "ERROR TEXTURE", unit: "%", min: 0, max: 100, defaultValue: 0, decimals: 0 }),
]);

export const SIGNAL_BY_ID = Object.freeze(Object.fromEntries(SIGNALS.map((signal) => [signal.id, signal])));
export const TARGET_BY_ID = Object.freeze(Object.fromEntries(TARGETS.map((target) => [target.id, target])));

export const SCENARIOS = Object.freeze([
  Object.freeze({ id: "normal", number: "01", label: "NORMAL LOAD", note: "Bounded demand and stable downstream response.", phaseBoundaries: Object.freeze([0, 20, 40, 60]), visualSeed: 101 }),
  Object.freeze({ id: "traffic", number: "02", label: "TRAFFIC SPIKE", note: "Demand rises first; saturation follows with a lag.", phaseBoundaries: Object.freeze([0, 10, 20, 35, 50, 60]), visualSeed: 211 }),
  Object.freeze({ id: "cache", number: "03", label: "CACHE COLLAPSE", note: "Cache efficiency falls before downstream pressure appears.", phaseBoundaries: Object.freeze([0, 12, 18, 38, 50, 60]), visualSeed: 307 }),
  Object.freeze({ id: "flapping", number: "04", label: "SERVICE FLAPPING", note: "Repeated state changes produce a recognisable pressure cycle.", phaseBoundaries: Object.freeze([0, 8, 52, 60]), visualSeed: 401 }),
  Object.freeze({ id: "creep", number: "05", label: "LATENCY CREEP", note: "Slow degradation becomes audible before it becomes obvious.", phaseBoundaries: Object.freeze([0, 8, 28, 48, 60]), visualSeed: 503 }),
  Object.freeze({ id: "cascade", number: "06", label: "CASCADING FAILURE", note: "A staged dependency chain ends in a bounded failed state.", phaseBoundaries: Object.freeze([0, 10, 18, 28, 38, 46, 52, 60]), visualSeed: 601 }),
  Object.freeze({ id: "deploy", number: "07", label: "DEPLOYMENT / RECOVERY", note: "A synthetic event creates pressure, then controlled recovery.", phaseBoundaries: Object.freeze([0, 12, 20, 34, 50, 60]), visualSeed: 709 }),
]);

export const SCENARIO_BY_ID = Object.freeze(Object.fromEntries(SCENARIOS.map((scenario) => [scenario.id, scenario])));
export const TRANSFORM_TYPES = Object.freeze(["LINEAR", "INVERSE", "EXPONENTIAL", "THRESHOLD"]);
export const SMOOTHING_TYPES = Object.freeze(["IMMEDIATE", "FAST", "MEDIUM", "SLOW"]);
export const POLARITIES = Object.freeze(["NORMAL", "REVERSED"]);
export const SMOOTHING_SECONDS = Object.freeze({ IMMEDIATE: 0.03, FAST: 0.1, MEDIUM: 0.35, SLOW: 1 });
export const RUN_DURATION_SECONDS = 60;

export function clamp(value, min = 0, max = 1) {
  const finite = Number.isFinite(value) ? value : min;
  return Math.min(max, Math.max(min, finite));
}

function smooth(edge0, edge1, value) {
  if (edge0 === edge1) return value >= edge1 ? 1 : 0;
  const x = clamp((value - edge0) / (edge1 - edge0));
  return x * x * (3 - 2 * x);
}

function rampDown(start, end, value) {
  return 1 - smooth(start, end, value);
}

function windowShape(riseStart, riseEnd, fallStart, fallEnd, value) {
  return smooth(riseStart, riseEnd, value) * rampDown(fallStart, fallEnd, value);
}

function deterministicJitter(scenarioId, signalIndex, time) {
  const scenario = SCENARIO_BY_ID[scenarioId];
  const seed = scenario?.visualSeed ?? 1;
  const quantised = Math.floor(time * 10) / 10;
  return (
    Math.sin(quantised * (0.73 + signalIndex * 0.11) + seed * 0.0417) * 0.62
    + Math.sin(quantised * (1.81 + signalIndex * 0.07) + seed * 0.0137) * 0.38
  );
}

function phase(time, boundaries, titles, descriptions) {
  let index = 0;
  for (let position = 1; position < boundaries.length - 1; position += 1) {
    if (time >= boundaries[position]) index = position;
  }
  return Object.freeze({
    phaseIndex: index + 1,
    phaseCount: titles.length,
    phaseTitle: titles[Math.min(index, titles.length - 1)],
    phaseDescription: descriptions[Math.min(index, descriptions.length - 1)],
  });
}

export function normaliseSignal(id, raw) {
  const definition = SIGNAL_BY_ID[id];
  if (!definition) throw new TypeError(`Unknown signal: ${id}`);
  return clamp((raw - definition.min) / (definition.max - definition.min));
}

export function createFrame(scenarioId, inputTime) {
  if (!SCENARIO_BY_ID[scenarioId]) throw new TypeError(`Unknown scenario: ${scenarioId}`);
  const time = clamp(Number(inputTime), 0, RUN_DURATION_SECONDS);
  const j = (index, scale) => deterministicJitter(scenarioId, index, time) * scale;

  let requestRate = 238 + Math.sin(time * 0.32) * 24 + j(0, 9);
  let latency = 102 + Math.sin(time * 0.21 + 1) * 11 + j(1, 4);
  let errorRate = Math.max(0, 0.18 + j(2, 0.08));
  let queueDepth = Math.max(0, 31 + Math.sin(time * 0.27) * 8 + j(3, 3));
  let cacheHit = 94 + Math.sin(time * 0.18) * 1.6 + j(4, 0.7);
  let cpuLoad = 34 + Math.sin(time * 0.25 + 0.5) * 4 + j(5, 1.8);
  let anomaly = Math.max(0, 0.055 + Math.sin(time * 0.16) * 0.018 + j(6, 0.008));
  let health = "STABLE";
  let deployEvent = false;
  let phaseState = phase(
    time,
    [0, 20, 40, 60],
    ["REFERENCE BASELINE", "BOUNDED VARIATION", "STABLE SETTLE"],
    [
      "Demand and downstream response remain inside the reference envelope.",
      "Small deterministic changes reveal the mapping without system pressure.",
      "The same bounded trajectory is reproduced on every reset.",
    ],
  );

  if (scenarioId === "traffic") {
    const demand = windowShape(10, 20, 35, 50, time);
    const pressure = windowShape(15, 26, 39, 53, time);
    requestRate += demand * 635;
    cpuLoad += windowShape(12, 23, 38, 52, time) * 57;
    latency += pressure * 520;
    queueDepth += pressure * 510;
    errorRate += windowShape(23, 31, 35, 48, time) * 3.4;
    cacheHit -= pressure * 7;
    anomaly += windowShape(11, 23, 43, 54, time) * 0.76;
    health = pressure > 0.25 ? "PRESSURED" : "STABLE";
    phaseState = phase(time, [0, 10, 20, 35, 50, 60], ["BASELINE", "DEMAND RISE", "SUSTAINED LOAD", "CAPACITY RETURN", "RECOVERY BASELINE"], ["Reference demand establishes the audible baseline.", "Request rate is rising. CPU response follows with a short lag.", "Demand remains high. Latency and queue pressure are now visible.", "Input falls while downstream work continues to drain.", "Signals return to their deterministic reference envelope."]);
  }

  if (scenarioId === "cache") {
    const collapse = windowShape(12, 18, 38, 50, time);
    const cpuResponse = windowShape(16, 25, 41, 53, time);
    const downstream = windowShape(21, 31, 44, 56, time);
    cacheHit -= collapse * 77;
    cpuLoad += cpuResponse * 51;
    latency += downstream * 740;
    queueDepth += downstream * 465;
    errorRate += windowShape(28, 38, 43, 54, time) * 5.2;
    anomaly += windowShape(12, 20, 44, 54, time) * 0.86;
    health = downstream > 0.7 ? "DEGRADED" : collapse > 0.3 ? "PRESSURED" : time >= 50 ? "RECOVERING" : "STABLE";
    phaseState = phase(time, [0, 12, 18, 38, 50, 60], ["BASELINE", "CACHE LOSS", "DOWNSTREAM PRESSURE", "CACHE RESTORATION", "SYSTEM SETTLE"], ["Cache efficiency and dependent signals are stable.", "Cache hit rate is falling before downstream metrics respond.", "CPU and latency now reflect the earlier cache loss.", "Cache efficiency is returning while queued work drains.", "The dependency chain has returned to its bounded baseline."]);
  }

  if (scenarioId === "flapping") {
    const active = time >= 8 && time < 52;
    const cycle = active ? (Math.sin((time - 8) * Math.PI / 2.6) + 1) / 2 : 0;
    const sharp = cycle ** 3;
    latency += active ? 90 + sharp * 620 : 0;
    errorRate += active ? sharp * 8.5 : 0;
    queueDepth += active ? cycle * 310 : 0;
    cpuLoad += active ? cycle * 18 : 0;
    anomaly += active ? 0.48 + sharp * 0.38 : 0;
    health = active ? (cycle > 0.52 ? "DEGRADED" : "STABLE") : time >= 52 ? "RECOVERING" : "STABLE";
    phaseState = phase(time, [0, 8, 52, 60], ["BASELINE", "REPEATED STATE CHANGE", "SETTLE"], ["Stable input establishes a clear reference.", "Errors, latency, and health alternate while demand remains steady.", "Oscillation has stopped and downstream state is settling."]);
  }

  if (scenarioId === "creep") {
    const creep = smooth(8, 48, time);
    const lateAnomaly = smooth(26, 52, time);
    latency += creep * 1120;
    queueDepth += smooth(15, 54, time) * 420;
    cpuLoad += creep * 13;
    anomaly += lateAnomaly * 0.78;
    errorRate += smooth(40, 58, time) * 0.8;
    health = time >= 45 ? "DEGRADED" : time >= 27 ? "PRESSURED" : "STABLE";
    phaseState = phase(time, [0, 8, 28, 48, 60], ["REFERENCE", "LATENCY DRIFT", "ACCUMULATING PRESSURE", "DEGRADED PLATEAU"], ["Demand is stable and latency remains inside baseline.", "Latency is rising slowly without a corresponding traffic increase.", "Queue depth is accumulating. Anomaly now confirms the earlier drift.", "The system remains degraded while errors stay comparatively low."]);
  }

  if (scenarioId === "cascade") {
    const cacheLoss = smooth(10, 18, time);
    const cpuPressure = smooth(18, 28, time);
    const latencyPressure = smooth(21, 33, time);
    const queuePressure = smooth(28, 39, time);
    const errors = smooth(38, 47, time);
    cacheHit -= cacheLoss * 82;
    cpuLoad += cpuPressure * 62;
    latency += latencyPressure * 1350;
    queueDepth += queuePressure * 830;
    errorRate += errors * 16;
    anomaly += smooth(12, 31, time) * 0.91;
    requestRate -= smooth(44, 53, time) * 118;
    health = time >= 46 ? "FAILED" : time >= 38 ? "DEGRADED" : time >= 20 ? "PRESSURED" : "STABLE";
    phaseState = phase(time, [0, 10, 18, 28, 38, 46, 52, 60], ["BASELINE", "CACHE DEGRADATION", "COMPUTE PRESSURE", "QUEUE ACCUMULATION", "ERROR ACCELERATION", "FAILED STATE", "LIMITED RECOVERY"], ["All signals begin inside the stable envelope.", "Cache efficiency is the first dependency to depart.", "CPU and latency respond to the earlier cache degradation.", "Processing capacity is exceeded and queued work accumulates.", "Persistent downstream pressure now produces errors.", "The causal chain has reached a bounded failed state.", "The failed state remains controlled; demand begins to recede."]);
  }

  if (scenarioId === "deploy") {
    const disturbance = windowShape(12, 19, 34, 50, time);
    requestRate += windowShape(12, 17, 24, 35, time) * 135;
    latency += disturbance * 610;
    errorRate += windowShape(16, 23, 31, 43, time) * 4.2;
    queueDepth += windowShape(15, 25, 38, 51, time) * 360;
    cpuLoad += disturbance * 31;
    cacheHit -= windowShape(13, 20, 28, 42, time) * 12;
    anomaly += windowShape(12, 18, 40, 52, time) * 0.72;
    deployEvent = time >= 12 && time < 12.2;
    health = time >= 34 && time < 50 ? "RECOVERING" : disturbance > 0.18 ? "PRESSURED" : "STABLE";
    phaseState = phase(time, [0, 12, 20, 34, 50, 60], ["BASELINE", "DEPLOY EVENT", "TEMPORARY PRESSURE", "RECOVERY", "STABLE"], ["Reference behaviour before the synthetic deployment event.", "A discrete event fires; continuous metrics have not all responded yet.", "Latency and error pressure follow the earlier event.", "Queued work drains and the health model reports recovery.", "The synthetic system returns to its stable envelope."]);
  }

  const values = Object.freeze({
    request_rate: clamp(requestRate, 0, 1000),
    latency_ms: clamp(latency, 20, 2000),
    error_rate: clamp(errorRate, 0, 20),
    queue_depth: clamp(queueDepth, 0, 1000),
    cache_hit_rate: clamp(cacheHit, 0, 100),
    cpu_load: clamp(cpuLoad, 0, 100),
    anomaly_score: clamp(anomaly, 0, 1),
  });
  const normalised = Object.freeze(Object.fromEntries(SIGNALS.map((signal) => [signal.id, normaliseSignal(signal.id, values[signal.id])])));
  return Object.freeze({ time, values, normalised, health, deployEvent, ...phaseState });
}

export function transformValue(value, transform) {
  const x = clamp(value);
  if (!TRANSFORM_TYPES.includes(transform)) throw new TypeError(`Unknown transform: ${transform}`);
  if (transform === "INVERSE") return 1 - x;
  if (transform === "EXPONENTIAL") return x * x;
  if (transform === "THRESHOLD") return x >= 0.6 ? 1 : 0;
  return x;
}

export function calculateMapping(mapping, rawNormalised) {
  validateMapping(mapping, { throwOnError: true });
  const span = Math.max(0.001, mapping.inputMax - mapping.inputMin);
  const rangedInput = clamp((rawNormalised - mapping.inputMin) / span);
  let transformed = transformValue(rangedInput, mapping.transform);
  if (mapping.polarity === "REVERSED") transformed = 1 - transformed;
  const output = mapping.outputMin + transformed * (mapping.outputMax - mapping.outputMin);
  return Object.freeze({ rawNormalised: clamp(rawNormalised), rangedInput, transformed, output: clamp(output, Math.min(mapping.outputMin, mapping.outputMax), Math.max(mapping.outputMin, mapping.outputMax)) });
}

export function createMapping({ id, source, target, transform = "LINEAR", inputMin = 0, inputMax = 1, outputMin, outputMax, polarity = "NORMAL", smoothing = "MEDIUM", enabled = true }) {
  const targetDefinition = TARGET_BY_ID[target];
  if (!targetDefinition) throw new TypeError(`Unknown target: ${target}`);
  const mapping = {
    id: String(id || `route-${source}-${target}`), source, target, transform,
    inputMin, inputMax,
    outputMin: outputMin ?? targetDefinition.min,
    outputMax: outputMax ?? targetDefinition.max,
    polarity, smoothing, enabled: Boolean(enabled),
  };
  validateMapping(mapping, { throwOnError: true });
  return mapping;
}

function route(id, source, target, transform, outputMin, outputMax, smoothing = "MEDIUM") {
  return createMapping({ id, source, target, transform, outputMin, outputMax, smoothing });
}

export const BUILT_IN_PRESETS = Object.freeze([
  Object.freeze({ id: "reference", name: "REFERENCE MAP", builtIn: true, mappings: Object.freeze([
    route("ref-request-pulse", "request_rate", "pulse_rate", "LINEAR", 0.45, 4.6),
    route("ref-latency-filter", "latency_ms", "filter_cutoff", "INVERSE", 420, 7200),
    route("ref-error-texture", "error_rate", "error_texture", "EXPONENTIAL", 0, 52, "FAST"),
    route("ref-queue-density", "queue_depth", "texture_density", "LINEAR", 4, 78),
    route("ref-cache-brightness", "cache_hit_rate", "harmonic_brightness", "LINEAR", 12, 78, "SLOW"),
    route("ref-cpu-level", "cpu_load", "tonal_level", "LINEAR", 18, 46),
    route("ref-anomaly-instability", "anomaly_score", "instability", "EXPONENTIAL", 0, 34),
  ]) }),
  Object.freeze({ id: "sparse", name: "SPARSE OPERATIONS", builtIn: true, mappings: Object.freeze([
    route("sparse-latency-filter", "latency_ms", "filter_cutoff", "INVERSE", 650, 6800, "SLOW"),
    route("sparse-error-texture", "error_rate", "error_texture", "EXPONENTIAL", 0, 38, "FAST"),
    route("sparse-anomaly-instability", "anomaly_score", "instability", "EXPONENTIAL", 0, 24),
  ]) }),
  Object.freeze({ id: "pressure", name: "PRESSURE FIELD", builtIn: true, mappings: Object.freeze([
    route("pressure-queue-pulse", "queue_depth", "pulse_rate", "EXPONENTIAL", 0.35, 6.2),
    route("pressure-latency-filter", "latency_ms", "filter_cutoff", "INVERSE", 280, 6500),
    route("pressure-queue-density", "queue_depth", "texture_density", "LINEAR", 8, 88),
    route("pressure-anomaly-delay", "anomaly_score", "delay", "EXPONENTIAL", 3, 34),
    route("pressure-anomaly-instability", "anomaly_score", "instability", "EXPONENTIAL", 0, 30),
  ]) }),
  Object.freeze({ id: "failure", name: "FAILURE TEXTURE", builtIn: true, mappings: Object.freeze([
    route("failure-error-texture", "error_rate", "error_texture", "EXPONENTIAL", 0, 64, "FAST"),
    route("failure-anomaly-instability", "anomaly_score", "instability", "EXPONENTIAL", 1, 35),
    route("failure-latency-filter", "latency_ms", "filter_cutoff", "INVERSE", 240, 5200),
    route("failure-queue-pulse", "queue_depth", "pulse_intensity", "EXPONENTIAL", 8, 66, "FAST"),
    route("failure-cache-brightness", "cache_hit_rate", "harmonic_brightness", "LINEAR", 7, 62, "SLOW"),
  ]) }),
]);

export function cloneMappings(mappings) {
  return mappings.map((mapping) => ({ ...mapping }));
}

export function mappingOutputs(frame, mappings) {
  const result = Object.fromEntries(TARGETS.map((target) => [target.id, target.defaultValue]));
  const claimedTargets = new Set();
  for (const mapping of mappings) {
    if (!mapping.enabled) continue;
    if (claimedTargets.has(mapping.target)) throw new TypeError(`Multiple enabled mappings target ${mapping.target}`);
    claimedTargets.add(mapping.target);
    result[mapping.target] = calculateMapping(mapping, frame.normalised[mapping.source]).output;
  }
  return Object.freeze(result);
}

export function validateMapping(mapping, { throwOnError = false } = {}) {
  const errors = [];
  if (!mapping || typeof mapping !== "object") errors.push("mapping must be an object");
  else {
    if (!mapping.id || typeof mapping.id !== "string") errors.push("mapping.id must be a non-empty string");
    if (!SIGNAL_BY_ID[mapping.source]) errors.push(`unknown signal: ${mapping.source}`);
    if (!TARGET_BY_ID[mapping.target]) errors.push(`unknown target: ${mapping.target}`);
    if (!TRANSFORM_TYPES.includes(mapping.transform)) errors.push(`unknown transform: ${mapping.transform}`);
    if (!POLARITIES.includes(mapping.polarity)) errors.push(`unknown polarity: ${mapping.polarity}`);
    if (!SMOOTHING_TYPES.includes(mapping.smoothing)) errors.push(`unknown smoothing: ${mapping.smoothing}`);
    for (const key of ["inputMin", "inputMax", "outputMin", "outputMax"]) {
      if (!Number.isFinite(mapping[key])) errors.push(`${key} must be finite`);
    }
    if (Number.isFinite(mapping.inputMin) && Number.isFinite(mapping.inputMax) && mapping.inputMax <= mapping.inputMin) errors.push("inputMax must be greater than inputMin");
    const target = TARGET_BY_ID[mapping.target];
    if (target && Number.isFinite(mapping.outputMin) && (mapping.outputMin < target.min || mapping.outputMin > target.max)) errors.push("outputMin is outside target bounds");
    if (target && Number.isFinite(mapping.outputMax) && (mapping.outputMax < target.min || mapping.outputMax > target.max)) errors.push("outputMax is outside target bounds");
  }
  if (throwOnError && errors.length) throw new TypeError(errors.join("; "));
  return Object.freeze({ valid: errors.length === 0, errors: Object.freeze(errors) });
}

export function validatePreset(preset, { throwOnError = false } = {}) {
  const errors = [];
  if (!preset || typeof preset !== "object") errors.push("preset must be an object");
  else {
    if (!preset.id || typeof preset.id !== "string") errors.push("preset.id must be a non-empty string");
    if (!preset.name || typeof preset.name !== "string" || !preset.name.trim()) errors.push("preset.name must be a non-empty string");
    if (!Array.isArray(preset.mappings)) errors.push("preset.mappings must be an array");
    else {
      const ids = new Set();
      const targets = new Set();
      for (const mapping of preset.mappings) {
        const result = validateMapping(mapping);
        errors.push(...result.errors.map((error) => `${mapping?.id || "mapping"}: ${error}`));
        if (ids.has(mapping.id)) errors.push(`duplicate mapping id: ${mapping.id}`);
        ids.add(mapping.id);
        if (mapping.enabled && targets.has(mapping.target)) errors.push(`duplicate enabled target: ${mapping.target}`);
        if (mapping.enabled) targets.add(mapping.target);
      }
    }
  }
  if (throwOnError && errors.length) throw new TypeError(errors.join("; "));
  return Object.freeze({ valid: errors.length === 0, errors: Object.freeze(errors) });
}

function stableMappingRecord(mapping) {
  return [mapping.id, mapping.source, mapping.target, mapping.transform, mapping.inputMin, mapping.inputMax, mapping.outputMin, mapping.outputMax, mapping.polarity, mapping.smoothing, mapping.enabled ? 1 : 0].join("|");
}

export function fingerprintMappings(mappings) {
  const canonical = [...mappings].sort((left, right) => left.id.localeCompare(right.id)).map(stableMappingRecord).join("\n");
  let hash = 0x811c9dc5;
  for (let index = 0; index < canonical.length; index += 1) {
    hash ^= canonical.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

export function formatValue(value, decimals) {
  if (!Number.isFinite(value)) return "—";
  return value.toFixed(decimals);
}

export function formatTime(time) {
  const bounded = clamp(Number(time), 0, RUN_DURATION_SECONDS);
  const totalTenths = Math.floor(bounded * 10 + 1e-7);
  const minutes = Math.floor(totalTenths / 600);
  const secondsTenths = totalTenths % 600;
  const seconds = Math.floor(secondsTenths / 10);
  const tenths = secondsTenths % 10;
  return `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}.${tenths}`;
}

export function scenarioSamples(scenarioId, stepSeconds = 0.1) {
  const samples = [];
  for (let time = 0; time <= RUN_DURATION_SECONDS + 1e-9; time += stepSeconds) samples.push(createFrame(scenarioId, Number(time.toFixed(4))));
  return samples;
}
