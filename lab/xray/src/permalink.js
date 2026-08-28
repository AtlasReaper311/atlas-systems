/**
 * Permalink codec.
 *
 * The query string is the only persistence this tool has. There is no backend,
 * no local storage, and no session state; a configuration exists because it is
 * in the URL. Comparison configurations use the same keys with a `b` prefix.
 */

import { normaliseConfig } from "./engine.js";

const KEYS = Object.freeze({
  cacheHit: "c",
  staleCache: "s",
  rateLimit: "l",
  retries: "n",
  timeoutMs: "t",
  serviceError: "e",
  jitter: "j",
});

const COMPARE_PREFIX = "b";
const COMPARE_FLAG = "cmp";
const DEFAULT_CONFIG = normaliseConfig({});

function sameConfig(left, right) {
  return JSON.stringify(normaliseConfig(left)) === JSON.stringify(normaliseConfig(right));
}

function isDefaultState({ config, compare = false, compareConfig = null }) {
  return !compare && !compareConfig && sameConfig(config, DEFAULT_CONFIG);
}

/** Serialise a configuration into query parameters. */
export function writeParams(params, config, { prefix = "" } = {}) {
  const value = normaliseConfig(config);
  params.set(prefix + KEYS.cacheHit, value.cacheHit ? "1" : "0");
  params.set(prefix + KEYS.staleCache, value.staleCache ? "1" : "0");
  params.set(prefix + KEYS.rateLimit, value.rateLimit ? "1" : "0");
  params.set(prefix + KEYS.retries, String(value.retries));
  params.set(prefix + KEYS.timeoutMs, String(value.timeoutMs));
  params.set(prefix + KEYS.serviceError, value.serviceError ? "1" : "0");
  params.set(prefix + KEYS.jitter, value.jitter ? "1" : "0");
  return params;
}

/** Read a configuration out of query parameters, falling back to defaults. */
export function readParams(params, { prefix = "" } = {}) {
  const raw = {};
  for (const [field, key] of Object.entries(KEYS)) {
    const value = params.get(prefix + key);
    if (value !== null) raw[field] = value;
  }
  return normaliseConfig(raw);
}

/**
 * Build the full query string for the current interface state.
 *
 * @param {{config: object, compare: boolean, compareConfig: object}} state
 */
export function encodeState({ config, compare = false, compareConfig = null, omitDefault = false }) {
  if (omitDefault && isDefaultState({ config, compare, compareConfig })) return "";
  const params = new URLSearchParams();
  writeParams(params, config);
  if (compare && compareConfig) {
    params.set(COMPARE_FLAG, "1");
    writeParams(params, compareConfig, { prefix: COMPARE_PREFIX });
  }
  return params.toString();
}

/** Read the full interface state from a query string. */
export function decodeState(search) {
  const params = new URLSearchParams(search ?? "");
  const compare = params.get(COMPARE_FLAG) === "1";
  return {
    config: readParams(params),
    compare,
    compareConfig: compare ? readParams(params, { prefix: COMPARE_PREFIX }) : null,
  };
}
