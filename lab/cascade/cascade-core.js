export const NODE_IDS = Object.freeze([
  "edge",
  "api",
  "core",
  "cache",
  "database",
  "queue",
  "worker",
]);

export const FAULTABLE_NODES = Object.freeze(["database", "cache"]);
export const FAULT_TYPES = Object.freeze(["fail", "degrade", "latency"]);
export const RESILIENCE_KEYS = Object.freeze([
  "cacheFallback",
  "asyncBuffer",
  "gracefulMode",
]);

export const NODE_STATES = Object.freeze([
  "healthy",
  "waiting",
  "degraded",
  "saturated",
  "failed",
  "isolated",
  "fallback",
  "buffering",
]);

const HEALTHY_NODES = Object.freeze(Object.fromEntries(
  NODE_IDS.map((id) => [id, "healthy"]),
));

const BASELINE_CONNECTIONS = Object.freeze({
  "edge-api": "healthy",
  "api-core": "healthy",
  "core-cache": "healthy",
  "core-database": "healthy",
  "core-queue": "healthy",
  "queue-worker": "healthy",
});

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

export function createBaselineState() {
  return {
    rootFault: null,
    resilience: {
      cacheFallback: false,
      asyncBuffer: false,
      gracefulMode: false,
    },
    nodes: { ...HEALTHY_NODES },
    connections: { ...BASELINE_CONNECTIONS },
    mechanisms: {
      cacheFallback: false,
      asyncBuffer: false,
      gracefulMode: false,
    },
    phase: "baseline",
    stage: 0,
    instruction: "Introduce a fault.",
    consequence: "All components healthy.",
    explanation: "Synthetic work is flowing through the dependency graph.",
  };
}

export function withResilience(state, key, enabled) {
  if (!RESILIENCE_KEYS.includes(key)) {
    throw new TypeError(`Unknown resilience property: ${key}`);
  }
  const next = clone(state);
  next.resilience[key] = Boolean(enabled);
  return next;
}

function step({ nodes = {}, connections = {}, mechanisms = {}, consequence, explanation }) {
  return { nodes, connections, mechanisms, consequence, explanation };
}

function databaseFailSteps(resilience) {
  const fallback = resilience.cacheFallback;
  const buffering = resilience.asyncBuffer;

  if (fallback && buffering) {
    return [
      step({
        nodes: { database: "failed" },
        connections: { "core-database": "failed" },
        consequence: "Database unavailable.",
      }),
      step({
        nodes: { cache: "fallback", queue: "buffering" },
        connections: { "core-cache": "fallback", "core-queue": "buffering" },
        mechanisms: { cacheFallback: true, asyncBuffer: true },
        consequence: "Fallback reads and buffered writes activate.",
      }),
      step({
        nodes: { core: "degraded" },
        connections: { "api-core": "degraded" },
        consequence: "Core service continues in degraded mode.",
      }),
      step({
        consequence: "The root fault remains contained from the user-facing path.",
        explanation: "Database failure still exists. Synthetic reads use stale cache data while writes queue for later processing.",
      }),
    ];
  }

  if (fallback) {
    return [
      step({
        nodes: { database: "failed" },
        connections: { "core-database": "failed" },
        consequence: "Database unavailable.",
      }),
      step({
        nodes: { cache: "fallback" },
        connections: { "core-cache": "fallback" },
        mechanisms: { cacheFallback: true },
        consequence: "Cache fallback activates.",
      }),
      step({
        nodes: { core: "degraded" },
        connections: { "api-core": "degraded" },
        consequence: "Core service serves a bounded stale response.",
      }),
      step({
        consequence: "User-facing availability is preserved with reduced freshness.",
        explanation: "The root fault still exists. Cache fallback contained its user-facing effect at the cost of freshness.",
      }),
    ];
  }

  if (buffering) {
    return [
      step({
        nodes: { database: "failed" },
        connections: { "core-database": "failed" },
        consequence: "Database unavailable.",
      }),
      step({
        nodes: { queue: "buffering" },
        connections: { "core-queue": "buffering" },
        mechanisms: { asyncBuffer: true },
        consequence: "Write work is accepted into the asynchronous buffer.",
      }),
      step({
        nodes: { core: "degraded", api: "degraded" },
        connections: { "api-core": "degraded", "edge-api": "degraded" },
        consequence: "Writes remain accepted; synchronous reads are impaired.",
      }),
      step({
        nodes: { edge: "degraded" },
        consequence: "The queue delays part of the impact, but does not restore the missing database.",
        explanation: "Async buffering preserves synthetic write acceptance while the synchronous read path remains degraded.",
      }),
    ];
  }

  return [
    step({
      nodes: { database: "failed" },
      connections: { "core-database": "failed" },
      consequence: "Database unavailable.",
    }),
    step({
      nodes: { core: "waiting" },
      connections: { "api-core": "pressure" },
      consequence: "Core service waits on a required dependency.",
    }),
    step({
      nodes: { api: "saturated" },
      connections: { "edge-api": "pressure" },
      consequence: "Pending synchronous requests accumulate at the API.",
    }),
    step({
      nodes: { edge: "degraded" },
      consequence: "Database failure has reached the user-facing edge.",
      explanation: "Synchronous dependency loss propagated upstream. The request path had no alternate source or degradation mode.",
    }),
  ];
}

function databaseDegradeSteps(resilience) {
  const graceful = resilience.gracefulMode;
  return [
    step({
      nodes: { database: "degraded" },
      connections: { "core-database": "degraded" },
      consequence: "Database capacity reduced.",
    }),
    step({
      nodes: { core: "degraded" },
      connections: { "api-core": graceful ? "healthy" : "degraded" },
      mechanisms: graceful ? { gracefulMode: true } : {},
      consequence: graceful
        ? "Core service disables a non-essential synthetic feature."
        : "Core service absorbs the reduced dependency capacity.",
    }),
    step({
      nodes: graceful ? {} : { api: "degraded" },
      connections: graceful ? {} : { "edge-api": "degraded" },
      consequence: graceful
        ? "Primary API capacity remains available."
        : "Reduced capacity reaches the API.",
    }),
    step({
      nodes: graceful ? {} : { edge: "degraded" },
      consequence: graceful
        ? "Graceful mode contains the user-facing effect."
        : "Degradation reaches the user-facing edge.",
      explanation: graceful
        ? "The database is still degraded. A non-essential synthetic feature was disabled to preserve the primary request path."
        : "Reduced dependency capacity propagated through the synchronous path because every feature remained enabled.",
    }),
  ];
}

function databaseLatencySteps(resilience) {
  const graceful = resilience.gracefulMode;
  return [
    step({
      nodes: { database: "degraded" },
      connections: { "core-database": "pressure" },
      consequence: "Synthetic database latency increased.",
    }),
    step({
      nodes: { core: "waiting" },
      connections: { "api-core": "pressure" },
      consequence: "Core service holds requests open longer.",
    }),
    step({
      nodes: graceful ? { api: "degraded" } : { api: "saturated" },
      connections: { "edge-api": graceful ? "degraded" : "pressure" },
      mechanisms: graceful ? { gracefulMode: true } : {},
      consequence: graceful
        ? "Graceful mode sheds non-essential work before saturation."
        : "Concurrent requests accumulate at the API.",
    }),
    step({
      nodes: { edge: "degraded" },
      consequence: graceful
        ? "The edge degrades, but saturation is avoided."
        : "Latency becomes user-facing degradation.",
      explanation: graceful
        ? "The dependency remains slow. Graceful mode reduced synthetic work, limiting amplification without removing the root latency."
        : "A logically available but slow dependency amplified waiting through the synchronous request path.",
    }),
  ];
}

function cacheFailSteps(resilience) {
  const graceful = resilience.gracefulMode;
  return [
    step({
      nodes: { cache: "failed" },
      connections: { "core-cache": "failed" },
      consequence: "Cache unavailable.",
    }),
    step({
      nodes: { core: "degraded" },
      connections: { "api-core": graceful ? "healthy" : "degraded" },
      mechanisms: graceful ? { gracefulMode: true } : {},
      consequence: graceful
        ? "Core service disables cache-dependent enrichment."
        : "Core service falls back to the slower primary dependency.",
    }),
    step({
      nodes: graceful ? {} : { api: "degraded" },
      connections: graceful ? {} : { "edge-api": "degraded" },
      consequence: graceful
        ? "Primary requests remain available."
        : "Additional primary-database demand reduces API capacity.",
    }),
    step({
      nodes: graceful ? {} : { edge: "degraded" },
      consequence: graceful
        ? "Graceful mode contains the cache failure."
        : "Cache loss becomes visible at the edge.",
      explanation: graceful
        ? "The cache fault still exists. Cache-dependent synthetic enrichment is isolated while the primary path remains available."
        : "Cache loss increased pressure on the synchronous primary path and propagated as degraded service.",
    }),
  ];
}

function cacheDegradeSteps(resilience) {
  const graceful = resilience.gracefulMode;
  return [
    step({
      nodes: { cache: "degraded" },
      connections: { "core-cache": "degraded" },
      consequence: "Cache hit capacity reduced.",
    }),
    step({
      nodes: { core: "degraded" },
      mechanisms: graceful ? { gracefulMode: true } : {},
      consequence: graceful
        ? "Core service trims cache-dependent work."
        : "Core service makes more primary dependency requests.",
    }),
    step({
      nodes: graceful ? {} : { api: "degraded" },
      connections: graceful ? {} : { "api-core": "degraded" },
      consequence: graceful
        ? "Primary API capacity remains available."
        : "Reduced efficiency reaches the API.",
    }),
    step({
      nodes: graceful ? {} : { edge: "degraded" },
      connections: graceful ? {} : { "edge-api": "degraded" },
      consequence: graceful
        ? "The degraded cache is isolated from the primary experience."
        : "Cache degradation reaches the edge.",
      explanation: graceful
        ? "The cache remains degraded. Graceful mode trades a non-essential feature for stable primary service."
        : "Reduced cache effectiveness amplified demand on the synchronous request path.",
    }),
  ];
}

function cacheLatencySteps(resilience) {
  const graceful = resilience.gracefulMode;
  return [
    step({
      nodes: { cache: "degraded" },
      connections: { "core-cache": "pressure" },
      consequence: "Synthetic cache latency increased.",
    }),
    step({
      nodes: graceful ? { core: "degraded" } : { core: "waiting" },
      mechanisms: graceful ? { gracefulMode: true } : {},
      consequence: graceful
        ? "Core service stops waiting for non-essential cache enrichment."
        : "Core service waits on the slow cache path.",
    }),
    step({
      nodes: graceful ? {} : { api: "saturated" },
      connections: graceful ? {} : { "api-core": "pressure" },
      consequence: graceful
        ? "Primary requests bypass the slow optional path."
        : "Waiting requests accumulate at the API.",
    }),
    step({
      nodes: graceful ? {} : { edge: "degraded" },
      connections: graceful ? {} : { "edge-api": "degraded" },
      consequence: graceful
        ? "Graceful mode contains the latency amplification."
        : "Cache latency becomes user-facing degradation.",
      explanation: graceful
        ? "The slow cache still exists. Optional synthetic work was isolated before it could saturate the primary path."
        : "Latency on an optional dependency became blocking work and propagated upstream.",
    }),
  ];
}

export function propagationFor(rootFault, resilience = createBaselineState().resilience) {
  if (!rootFault || !FAULTABLE_NODES.includes(rootFault.node) || !FAULT_TYPES.includes(rootFault.type)) {
    throw new TypeError("A supported deterministic root fault is required.");
  }
  const normalizedResilience = Object.fromEntries(
    RESILIENCE_KEYS.map((key) => [key, Boolean(resilience[key])]),
  );

  if (rootFault.node === "database") {
    if (rootFault.type === "fail") return databaseFailSteps(normalizedResilience);
    if (rootFault.type === "degrade") return databaseDegradeSteps(normalizedResilience);
    return databaseLatencySteps(normalizedResilience);
  }
  if (rootFault.type === "fail") return cacheFailSteps(normalizedResilience);
  if (rootFault.type === "degrade") return cacheDegradeSteps(normalizedResilience);
  return cacheLatencySteps(normalizedResilience);
}

export function beginFault(state, rootFault) {
  const next = createBaselineState();
  next.resilience = { ...state.resilience };
  next.rootFault = { ...rootFault };
  next.phase = "propagating";
  next.instruction = "Watch the consequence propagate.";
  next.consequence = "Root fault introduced.";
  next.explanation = "Propagation is deterministic from the selected baseline and resilience settings.";
  return next;
}

export function applyPropagationStep(state, patch, stage) {
  const next = clone(state);
  Object.assign(next.nodes, patch.nodes || {});
  Object.assign(next.connections, patch.connections || {});
  Object.assign(next.mechanisms, patch.mechanisms || {});
  if (patch.consequence) next.consequence = patch.consequence;
  if (patch.explanation) next.explanation = patch.explanation;
  next.stage = stage;
  return next;
}

export function settleFault(state) {
  const next = clone(state);
  next.phase = "settled";
  next.instruction = "Change one resilience control and replay the same fault.";
  return next;
}

export function simulateFault(rootFault, resilience = createBaselineState().resilience) {
  let state = createBaselineState();
  state.resilience = { ...resilience };
  state = beginFault(state, rootFault);
  const steps = propagationFor(rootFault, state.resilience);
  steps.forEach((patch, index) => {
    state = applyPropagationStep(state, patch, index + 1);
  });
  return settleFault(state);
}

export function stateSummary(state) {
  const nodeSummary = NODE_IDS
    .map((id) => `${id}: ${state.nodes[id]}`)
    .join("; ");
  const root = state.rootFault
    ? `${state.rootFault.node} ${state.rootFault.type}`
    : "none";
  const active = RESILIENCE_KEYS.filter((key) => state.mechanisms[key]);
  return `Phase ${state.phase}. Root fault: ${root}. ${nodeSummary}. Active containment: ${active.length ? active.join(", ") : "none"}. ${state.consequence}`;
}
