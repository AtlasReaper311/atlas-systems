/**
 * estate-search/client.js
 *
 * The one retrieval code path for every search surface on the site.
 * Query in, normalized hits out. Zero DOM references by design, so this
 * module is unit-testable in isolation and reusable from any placement.
 *
 * Endpoint chain (order preserved from the shipped corpus widget, which
 * goes local-first when previewing on localhost and otherwise straight
 * at the tunnel; the proxied edge is appended as a new final tier, it
 * does not reorder anything that already worked):
 *
 *   1. local     http://localhost:8092/search        (localhost preview only)
 *   2. tunnel    https://corpus.atlas-systems.uk/search
 *   3. edge      https://api.atlas-systems.uk/v1/search
 *
 * All three are GET so no CORS preflight fires; atlas-corpus added the
 * GET route for exactly this reason. The edge tier wraps the corpus
 * response in {ok, count, ...}; normalizeResponse absorbs both shapes.
 *
 * Hit shape note: the deployed SearchHit model is
 *   {text, score, source_repo, file_path, doc_type, last_updated, chunk_index}
 * Some estate docs describe it as {repo, path, excerpt, ...}. normalizeHit
 * accepts both spellings so a consumer never breaks if the producer's
 * serialization shifts (the API registry panel already taught this lesson).
 *
 * Rate budget: the tunnel allows 60 searches per hour per IP and the edge
 * allows 10 per minute, and every hit costs a real embedding on the 5070.
 * The client therefore keeps a small LRU cache of successful results,
 * the same defence atlas-terminal already ships. On 429 the chain still
 * advances to the next endpoint, matching the shipped widget's failover
 * semantics, and only reports a RateLimitError if every tier is spent.
 */

"use strict";

export const CORPUS_TUNNEL_BASE = "https://corpus.atlas-systems.uk";
export const EDGE_PROXY_BASE = "https://api.atlas-systems.uk";

/* Mirrors of the atlas-corpus contract (app/models.py). Enforced client
   side so a bad query never even leaves the browser. */
export const QUERY_MAX_CHARS = 500;
export const TOP_K_MAX = 10;

const DEFAULT_TIMEOUT_MS = 8000;
const CACHE_MAX_ENTRIES = 30;

export class RateLimitError extends Error {
  constructor(message) {
    super(message || "rate limited; wait a minute");
    this.name = "RateLimitError";
  }
}

export class SearchUnavailableError extends Error {
  constructor(message, cause) {
    super(message || "search unavailable");
    this.name = "SearchUnavailableError";
    if (cause) this.cause = cause;
  }
}

/**
 * Build the endpoint chain for a given page hostname. Exported so tests
 * can assert the order without touching window.location.
 */
export function defaultEndpoints(hostname) {
  const endpoints = [];
  const isLocalLab = hostname === "localhost" || hostname === "127.0.0.1";

  if (isLocalLab) {
    /* Match the page's own host form so the browser does not treat
       localhost and 127.0.0.1 as different origins mid-session. Same
       rule the shipped widget uses. */
    const localHost = hostname === "127.0.0.1" ? "127.0.0.1" : "localhost";
    endpoints.push({
      name: "local",
      searchUrl(query, topK) {
        return "http://" + localHost + ":8092/search?q=" +
          encodeURIComponent(query) + "&top_k=" + topK;
      }
    });
  }

  endpoints.push({
    name: "tunnel",
    searchUrl(query, topK) {
      return CORPUS_TUNNEL_BASE + "/search?q=" +
        encodeURIComponent(query) + "&top_k=" + topK;
    }
  });

  endpoints.push({
    name: "edge",
    searchUrl(query, topK) {
      return EDGE_PROXY_BASE + "/v1/search?q=" +
        encodeURIComponent(query) + "&top_k=" + topK;
    }
  });

  return endpoints;
}

/**
 * Normalize one raw hit into the shape render.js consumes. Accepts both
 * the deployed field names and the shorthand some docs use.
 */
export function normalizeHit(raw) {
  if (!raw || typeof raw !== "object") return null;
  const repo = String(raw.source_repo || raw.repo || "");
  const path = String(raw.file_path || raw.path || "");
  const excerpt = String(raw.text || raw.excerpt || "");
  if (!repo && !path && !excerpt) return null;
  return {
    repo: repo || "corpus",
    path: path || "unknown",
    docType: String(raw.doc_type || raw.docType || ""),
    score: Number.isFinite(Number(raw.score)) ? Number(raw.score) : 0,
    excerpt: excerpt,
    chunkIndex: Number.isFinite(Number(raw.chunk_index)) ? Number(raw.chunk_index) : 0,
    lastUpdated: String(raw.last_updated || raw.lastUpdated || "")
  };
}

/** Absorb both response envelopes: corpus-direct and the edge wrapper. */
export function normalizeResponse(data) {
  if (!data || typeof data !== "object" || !Array.isArray(data.hits)) {
    return null;
  }
  const hits = [];
  for (const raw of data.hits) {
    const hit = normalizeHit(raw);
    if (hit) hits.push(hit);
  }
  return {
    query: String(data.query || ""),
    hits: hits,
    tookMs: Number.isFinite(Number(data.took_ms)) ? Number(data.took_ms) : null
  };
}

/**
 * Create a search client. Options:
 *   endpoints  override the chain (tests, future placements)
 *   fetchImpl  injectable fetch (tests run without a network)
 *   hostname   override hostname detection (tests)
 *   timeoutMs  per-attempt budget; the chain never hangs on one tier
 */
export function createSearchClient(options) {
  const opts = options || {};
  const hostname = opts.hostname !== undefined
    ? opts.hostname
    : (typeof location !== "undefined" ? location.hostname : "");
  const endpoints = opts.endpoints || defaultEndpoints(hostname);
  const fetchImpl = opts.fetchImpl ||
    (typeof fetch !== "undefined" ? fetch.bind(globalThis) : null);
  const timeoutMs = opts.timeoutMs || DEFAULT_TIMEOUT_MS;

  /* LRU of successful results only; failures are never cached because
     the whole point of the chain is that the next attempt may succeed. */
  const cache = new Map();

  function cacheKey(query, topK) {
    return query.toLowerCase() + "|" + topK;
  }

  function cachePut(key, value) {
    if (cache.has(key)) cache.delete(key);
    cache.set(key, value);
    if (cache.size > CACHE_MAX_ENTRIES) {
      cache.delete(cache.keys().next().value);
    }
  }

  async function attempt(endpoint, query, topK, callerSignal) {
    const controller = new AbortController();
    const timer = setTimeout(function () {
      controller.abort(new DOMException("attempt timed out", "TimeoutError"));
    }, timeoutMs);
    const onCallerAbort = function () {
      controller.abort(callerSignal.reason);
    };
    if (callerSignal) {
      if (callerSignal.aborted) {
        clearTimeout(timer);
        throw callerSignal.reason || new DOMException("aborted", "AbortError");
      }
      callerSignal.addEventListener("abort", onCallerAbort, { once: true });
    }
    try {
      const response = await fetchImpl(endpoint.searchUrl(query, topK), {
        cache: "no-store",
        signal: controller.signal,
        headers: { Accept: "application/json" }
      });
      if (response.status === 429) {
        const err = new RateLimitError();
        err.endpoint = endpoint.name;
        throw err;
      }
      if (!response.ok) {
        throw new Error(endpoint.name + " answered " + response.status);
      }
      const normalized = normalizeResponse(await response.json());
      if (!normalized) {
        throw new Error(endpoint.name + " returned an unexpected body");
      }
      return normalized;
    } finally {
      clearTimeout(timer);
      if (callerSignal) callerSignal.removeEventListener("abort", onCallerAbort);
    }
  }

  /**
   * search(query, {topK, signal}) resolves to
   *   {query, hits, tookMs, endpoint, fromCache}
   * and rejects with RateLimitError, SearchUnavailableError, or the
   * caller's AbortError. Every other failure mode is folded into those
   * three so UI code has exactly three branches to render.
   */
  async function search(query, params) {
    const p = params || {};
    const trimmed = String(query || "").trim().slice(0, QUERY_MAX_CHARS);
    if (!trimmed) {
      throw new SearchUnavailableError("empty query");
    }
    const topK = Math.min(Math.max(parseInt(p.topK, 10) || 5, 1), TOP_K_MAX);

    const key = cacheKey(trimmed, topK);
    if (cache.has(key)) {
      const cached = cache.get(key);
      cachePut(key, cached);
      return Object.assign({}, cached, { fromCache: true });
    }

    let lastError = null;
    let sawRateLimit = false;

    for (const endpoint of endpoints) {
      try {
        const normalized = await attempt(endpoint, trimmed, topK, p.signal);
        const result = {
          query: normalized.query || trimmed,
          hits: normalized.hits,
          tookMs: normalized.tookMs,
          endpoint: endpoint.name,
          fromCache: false
        };
        cachePut(key, result);
        return result;
      } catch (err) {
        if (err && (err.name === "AbortError" || (p.signal && p.signal.aborted))) {
          throw err; /* the caller cancelled; do not fail over on purpose */
        }
        if (err instanceof RateLimitError) sawRateLimit = true;
        lastError = err;
        /* fall through to the next tier; this matches the shipped
           widget, which also advances on any failure including 429 */
      }
    }

    if (sawRateLimit) {
      throw new RateLimitError(
        "rate limited on every tier; the corpus budget is deliberate and resets on its own"
      );
    }
    throw new SearchUnavailableError(
      "corpus unreachable; search lives on SPECULAR-CORE behind a tunnel and the tunnel is not answering",
      lastError
    );
  }

  return { search: search, endpoints: endpoints };
}

/* One shared instance per page so the homepage widget and the nav
   overlay share a cache, which is the whole point of having one. */
let sharedClient = null;
export function getSharedClient() {
  if (!sharedClient) sharedClient = createSearchClient();
  return sharedClient;
}
