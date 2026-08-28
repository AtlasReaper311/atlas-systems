/**
 * Request X-Ray simulation engine.
 *
 * Pure and DOM-free. Given a switch configuration it returns the exact hop
 * sequence a request takes through the seven-layer pipeline, plus a summary.
 * The same configuration always produces the same trace, including when
 * latency variance is enabled, so a permalink is a reproducible experiment
 * rather than a re-roll.
 *
 * The latency constants are a deliberate model, not measurements. See
 * docs/latency-model.md for why each number is what it is.
 */

import { explainTrace } from "./explanations.js";

/** Pipeline layers, in request order. */
export const LAYERS = ["browser", "edge", "router", "api", "service", "cache", "database"];

/** Base cost of each layer on the request path, in milliseconds. */
export const REQUEST_LATENCY_MS = Object.freeze({
  browser: 5,
  edge: 10,
  router: 5,
  api: 20,
  service: 40,
  cache: 5,
  database: 60,
});

/**
 * Cost of each layer on the response path. Returning a prepared response is
 * cheaper than deciding what the response should be, so these are lower.
 */
export const RESPONSE_LATENCY_MS = Object.freeze({
  router: 3,
  edge: 5,
  browser: 8,
});

/** Exponential backoff before retry N: 30ms, 60ms, 120ms. */
export const BACKOFF_BASE_MS = 30;

/** Upper bound of the extra latency each layer can absorb when jitter is on. */
export const JITTER_BUDGET_MS = Object.freeze({
  edge: 40,
  router: 10,
  api: 10,
  service: 60,
  cache: 5,
  database: 50,
});

/** The latency budget the interface measures a run against. */
export const DEFAULT_BUDGET_MS = 500;

/** The api layer only offers these deadlines. */
export const TIMEOUT_CHOICES_MS = Object.freeze([50, 100, 250, 500]);

/** Which switches each layer owns. Browser and database are passive. */
export const LAYER_SWITCHES = Object.freeze({
  browser: [],
  edge: ["jitter"],
  router: ["rateLimit"],
  api: ["retries", "timeoutMs"],
  service: ["serviceError"],
  cache: ["cacheHit", "staleCache"],
  database: [],
});

export const DEFAULT_CONFIG = Object.freeze({
  cacheHit: true,
  staleCache: false,
  rateLimit: false,
  retries: 0,
  timeoutMs: 250,
  serviceError: false,
  jitter: false,
});

/**
 * Coerce arbitrary input into a valid configuration. Out-of-range values are
 * clamped rather than rejected, so a hand-edited permalink degrades into the
 * nearest legal experiment instead of an error page.
 */
export function normaliseConfig(input = {}) {
  const retries = Number.isFinite(Number(input.retries)) ? Math.trunc(Number(input.retries)) : DEFAULT_CONFIG.retries;
  const timeout = Number(input.timeoutMs);
  return {
    cacheHit: toBoolean(input.cacheHit, DEFAULT_CONFIG.cacheHit),
    staleCache: toBoolean(input.staleCache, DEFAULT_CONFIG.staleCache),
    rateLimit: toBoolean(input.rateLimit, DEFAULT_CONFIG.rateLimit),
    retries: Math.min(3, Math.max(0, retries)),
    timeoutMs: TIMEOUT_CHOICES_MS.includes(timeout) ? timeout : DEFAULT_CONFIG.timeoutMs,
    serviceError: toBoolean(input.serviceError, DEFAULT_CONFIG.serviceError),
    jitter: toBoolean(input.jitter, DEFAULT_CONFIG.jitter),
  };
}

function toBoolean(value, fallback) {
  if (value === undefined || value === null) return fallback;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  const text = String(value).trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(text)) return true;
  if (["0", "false", "no", "off"].includes(text)) return false;
  return fallback;
}

/** FNV-1a over the canonical configuration, so the seed follows the permalink. */
function seedFromConfig(config) {
  const canonical = [
    config.cacheHit ? 1 : 0,
    config.staleCache ? 1 : 0,
    config.rateLimit ? 1 : 0,
    config.retries,
    config.timeoutMs,
    config.serviceError ? 1 : 0,
    config.jitter ? 1 : 0,
  ].join(":");
  let hash = 0x811c9dc5;
  for (let index = 0; index < canonical.length; index += 1) {
    hash ^= canonical.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

/** mulberry32: small, fast, and good enough for reproducible variance. */
function createRandom(seed) {
  let state = seed >>> 0;
  return function next() {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Run one request through the pipeline.
 *
 * @param {object} input switch configuration
 * @returns {{config: object, hops: Array<object>, summary: object}}
 */
export function simulateRequest(input = {}) {
  const config = normaliseConfig(input);
  const random = config.jitter ? createRandom(seedFromConfig(config)) : null;
  const hops = [];

  const jitter = (layer) => {
    if (!random) return 0;
    return Math.round(random() * (JITTER_BUDGET_MS[layer] ?? 0));
  };

  const push = (layer, attempt, outcome, latencyMs, note) => {
    hops.push({ layer, attempt, outcome, latencyMs, note });
  };

  push("browser", 1, "sent", REQUEST_LATENCY_MS.browser, "Request built and dispatched.");
  push("edge", 1, "forwarded", REQUEST_LATENCY_MS.edge + jitter("edge"), "TLS terminated at the nearest point of presence.");

  if (config.rateLimit) {
    push(
      "router",
      1,
      "rate_limited",
      REQUEST_LATENCY_MS.router + jitter("router"),
      "Quota exceeded. Rejected with 429 before any downstream work.",
    );
    return finalise(config, hops, { terminalLayer: "router", attempts: 0, downstreamCalls: 0, servedFrom: null });
  }

  push("router", 1, "routed", REQUEST_LATENCY_MS.router + jitter("router"), "Matched the upstream pool for this path.");

  const maxAttempts = config.retries + 1;
  let downstreamCalls = 0;
  let servedFrom = null;
  let succeeded = false;
  let attempt = 0;

  while (attempt < maxAttempts) {
    attempt += 1;
    const backoff = attempt === 1 ? 0 : BACKOFF_BASE_MS * 2 ** (attempt - 2);
    push(
      "api",
      attempt,
      attempt === 1 ? "dispatched" : "retrying",
      REQUEST_LATENCY_MS.api + backoff + jitter("api"),
      attempt === 1
        ? `Handler selected. Deadline ${config.timeoutMs}ms per attempt.`
        : `Retry ${attempt - 1} of ${config.retries} after ${backoff}ms backoff.`,
    );

    const result = callDownstream({ config, attempt, hops, jitter, push });
    downstreamCalls += 1;

    if (result.ok) {
      succeeded = true;
      servedFrom = result.servedFrom;
      break;
    }
  }

  if (succeeded) {
    push("router", attempt, "returned", RESPONSE_LATENCY_MS.router, "Response handed back to the edge.");
    push("edge", attempt, "returned", RESPONSE_LATENCY_MS.edge, "Cached headers applied and streamed onward.");
    push("browser", attempt, "rendered", RESPONSE_LATENCY_MS.browser, "Response parsed and painted.");
    return finalise(config, hops, { terminalLayer: "browser", attempts: attempt, downstreamCalls, servedFrom });
  }

  // A failed request stops where the failure is owned. The api gave up, so the
  // trace ends at the api and no response travels back out through the router,
  // the edge, or the browser.
  const outcome = config.retries > 0 ? "exhausted" : "failed";
  push(
    "api",
    attempt,
    outcome,
    0,
    config.retries > 0
      ? `All ${maxAttempts} attempts spent. Giving up.`
      : "Attempt failed and no retry budget was configured.",
  );
  return finalise(config, hops, { terminalLayer: "api", attempts: attempt, downstreamCalls, servedFrom: null });
}

/**
 * One downstream attempt: service, then cache, then database on a miss.
 * Every hop is checked against the remaining per-attempt deadline first, so a
 * call that cannot finish inside the budget is recorded as a timeout at the
 * layer that ran out of time rather than silently completing.
 */
function callDownstream({ config, attempt, jitter, push }) {
  let spent = 0;

  const serviceMs = REQUEST_LATENCY_MS.service + jitter("service");
  if (spent + serviceMs > config.timeoutMs) {
    push("service", attempt, "timeout", config.timeoutMs - spent, `Deadline of ${config.timeoutMs}ms reached inside the service.`);
    return { ok: false, reason: "timeout" };
  }
  spent += serviceMs;

  if (config.serviceError) {
    push("service", attempt, "error", serviceMs, "Handler raised 503 before reading any data.");
    return { ok: false, reason: "error" };
  }
  push("service", attempt, "called", serviceMs, "Business logic ran and asked the cache for the record.");

  const cacheMs = REQUEST_LATENCY_MS.cache + jitter("cache");
  if (spent + cacheMs > config.timeoutMs) {
    push("cache", attempt, "timeout", config.timeoutMs - spent, `Deadline of ${config.timeoutMs}ms reached during the cache lookup.`);
    return { ok: false, reason: "timeout" };
  }
  spent += cacheMs;

  if (config.cacheHit) {
    const stale = config.staleCache;
    push(
      "cache",
      attempt,
      stale ? "stale" : "hit",
      cacheMs,
      stale ? "Entry found past its freshness window and served anyway." : "Fresh entry found. Database skipped.",
    );
    return { ok: true, servedFrom: stale ? "stale-cache" : "cache" };
  }
  push("cache", attempt, "miss", cacheMs, "No entry. Falling through to the database.");

  const databaseMs = REQUEST_LATENCY_MS.database + jitter("database");
  if (spent + databaseMs > config.timeoutMs) {
    push(
      "database",
      attempt,
      "timeout",
      config.timeoutMs - spent,
      config.timeoutMs - spent === 0
        ? `Deadline of ${config.timeoutMs}ms was already spent. The query never started.`
        : `Deadline of ${config.timeoutMs}ms reached mid-query.`,
    );
    return { ok: false, reason: "timeout" };
  }
  push("database", attempt, "read", databaseMs, "Row read and returned to the service.");
  return { ok: true, servedFrom: "database" };
}

function finalise(config, hops, { terminalLayer, attempts, downstreamCalls, servedFrom }) {
  const totalLatencyMs = hops.reduce((total, hop) => total + hop.latencyMs, 0);
  const terminalHop = hops[hops.length - 1];
  const timedOut = hops.some((hop) => hop.outcome === "timeout");
  const errored = hops.some((hop) => hop.outcome === "error");
  const status = statusFor(terminalHop.outcome);

  const summary = {
    status,
    outcome: terminalHop.outcome,
    terminalLayer,
    totalLatencyMs,
    attempts,
    downstreamCalls,
    servedFrom,
    timedOut,
    errored,
    budgetMs: DEFAULT_BUDGET_MS,
    overBudget: totalLatencyMs > DEFAULT_BUDGET_MS,
    hopCount: hops.length,
  };

  const explanation = explainTrace({ config, hops, summary });
  summary.explanationId = explanation.id;
  summary.explanation = explanation.text;

  return { config, hops, summary };
}

function statusFor(outcome) {
  if (outcome === "rendered") return "ok";
  if (outcome === "rate_limited") return "rate limited";
  if (outcome === "exhausted") return "exhausted";
  return "failed";
}
