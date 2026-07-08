/**
 * poller.js :: the only file that talks to the network.
 *
 * Fetches GET /sonify every ten seconds, smooths the numeric fields,
 * runs them through the pure mapping layer, and hands a finished frame
 * to whoever subscribed (engine + ui). Owns the two pieces of state
 * that need memory across polls: the smoothing accumulators and the
 * previous incident count for edge-triggered hits.
 *
 * Failure discipline, per spec: hold the last known good frame (which
 * in practice means "deliver nothing new"; the engine keeps sounding
 * whatever it was last told), warn once per failure STREAK rather than
 * once per failed poll, and resume silently on the first success.
 */

import { computeFrame } from "./mapping.js?v=20260708-audio2";

/**
 * The sonify surface lives on the api hostname like every other estate
 * Worker (route layering: /sonify* is more specific than atlas-notify's
 * /* wildcard). https://api.atlas-systems.uk is already allowlisted in
 * the site's CSP connect-src (atlas-systems/_headers), so this fetch
 * needs no header change. Any future hostname move would.
 */
export const SONIFY_URL = "https://api.atlas-systems.uk/sonify";

/** Poll cadence per spec. */
export const POLL_INTERVAL_MS = 10000;

/**
 * Per-poll fetch timeout, comfortably inside the poll interval so a
 * hung request can never overlap the next tick.
 */
export const FETCH_TIMEOUT_MS = 8000;

/**
 * EMA weight for incoming samples. 0.45 means a step change reaches
 * ~90% of its target within four polls (40 seconds): fast enough that
 * the sound tracks reality, slow enough that a single jittery sample
 * cannot yank a voice across the scale. The engine's 300ms parameter
 * ramps handle intra-poll smoothness; this handles inter-poll noise.
 */
export const EMA_ALPHA = 0.45;

/** The numeric fields worth smoothing. Deploy age is monotonic clock
 *  data, not a noisy measurement, so it passes through untouched. */
const SMOOTHED_FIELDS = ["latency_ms", "uptime_pct", "error_rate"];

/**
 * Create a poller.
 *
 * @param {object} opts
 * @param {(frame: object, info: {newIncidents: number, raw: object}) => void} opts.onFrame
 *   Called with the mapped frame after every successful poll.
 * @param {(status: {failing: boolean, failures: number}) => void} [opts.onStatus]
 *   Called when the fetch health changes, for the UI's stale hint.
 * @param {string} [opts.url]           Override for tests / local dev.
 * @param {number} [opts.intervalMs]    Override for tests.
 * @returns {{ start(): void, stop(): void }}
 */
export function createPoller({
  onFrame,
  onStatus,
  url = SONIFY_URL,
  intervalMs = POLL_INTERVAL_MS,
}) {
  /** name -> { latency_ms, uptime_pct, error_rate } running EMAs. */
  const smooth = new Map();

  /**
   * Previous active_incidents. Starts null so the FIRST observation
   * establishes a baseline without firing: incidents that predate the
   * page load are standing state, not news, and the membrane hit is
   * reserved for news (spec: fire on increase only).
   */
  let prevIncidents = null;

  let consecutiveFailures = 0;
  let timer = null;
  let inFlight = false;
  let stopped = true;

  function smoothService(service) {
    // A service without data resets its accumulators: when it comes
    // back, smoothing restarts from the fresh sample instead of
    // averaging against values from before the gap.
    if (service.status === "unknown") {
      smooth.delete(service.name);
      return service;
    }
    let acc = smooth.get(service.name);
    if (!acc) {
      acc = {};
      smooth.set(service.name, acc);
    }
    const out = { ...service };
    for (const field of SMOOTHED_FIELDS) {
      const sample = service[field];
      if (sample == null || !Number.isFinite(sample)) {
        // Null stays null (mapping.js owns null semantics) and clears
        // the accumulator so a returning metric starts clean.
        delete acc[field];
        continue;
      }
      const prev = acc[field];
      const next =
        prev == null ? sample : prev + EMA_ALPHA * (sample - prev);
      acc[field] = next;
      out[field] = next;
    }
    return out;
  }

  async function poll() {
    if (inFlight || stopped) return;
    inFlight = true;
    try {
      const res = await fetch(url, {
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        headers: { accept: "application/json" },
      });
      if (!res.ok) throw new Error(`sonify answered ${res.status}`);
      const raw = await res.json();

      const smoothed = {
        ...raw,
        services: Array.isArray(raw.services)
          ? raw.services.map(smoothService)
          : [],
      };
      const frame = computeFrame(smoothed);

      // Edge-triggered incident detection: only an INCREASE fires, and
      // only by the delta, so a standing incident never re-drums on
      // every poll and a 1 -> 3 jump fires exactly twice.
      let newIncidents = 0;
      if (prevIncidents !== null && frame.activeIncidents > prevIncidents) {
        newIncidents = frame.activeIncidents - prevIncidents;
      }
      prevIncidents = frame.activeIncidents;

      if (consecutiveFailures > 0) {
        // Spec: resume normal behaviour silently. No recovery log.
        consecutiveFailures = 0;
        onStatus?.({ failing: false, failures: 0 });
      }

      onFrame(frame, { newIncidents, raw });
    } catch (err) {
      consecutiveFailures += 1;
      if (consecutiveFailures === 1) {
        // Once per streak, not once per failure: a machine that sleeps
        // for an hour should cost one console line, not 360.
        console.warn(
          `sonify: poll failed, holding last known good values (${
            err instanceof Error ? err.message : String(err)
          })`,
        );
        onStatus?.({ failing: true, failures: consecutiveFailures });
      }
      // Deliver nothing: the engine keeps ramping toward the last
      // frame it was given, which IS the hold-last-known-good rule.
    } finally {
      inFlight = false;
    }
  }

  return {
    start() {
      if (!stopped) return;
      stopped = false;
      // Immediate first poll so the readout is live within one round
      // trip of page load rather than after the first interval.
      poll();
      timer = setInterval(poll, intervalMs);
    },
    stop() {
      stopped = true;
      if (timer !== null) {
        clearInterval(timer);
        timer = null;
      }
    },
  };
}
