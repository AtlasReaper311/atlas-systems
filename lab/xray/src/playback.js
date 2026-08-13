/**
 * Playback layer.
 *
 * Consumes a hops array and animates it across the SVG pipeline. It knows
 * nothing about switches, presets, or the engine's internals; give it any
 * array of `{ layer, attempt, outcome, latencyMs }` and it will play it.
 *
 * Hop duration is proportional to that hop's real latency, so a slow database
 * read genuinely takes longer on screen than a cache hit, and the api-service
 * retry bounce reads as agitated rather than metronomic.
 */

/** Wall-clock milliseconds per simulated millisecond. */
export const TIME_SCALE = 6;

/** How long the phosphor glow lingers after a node resolves. */
const GLOW_MS = 520;

/**
 * Maps a hop outcome onto the estate status vocabulary. Amber is reserved for
 * the node the packet is currently travelling to, so a settled node is green
 * when it did its job, amber only when the result deserves a caveat, and red
 * when it failed.
 */
export const OUTCOME_STATE = {
  sent: "ok",
  forwarded: "ok",
  routed: "ok",
  dispatched: "ok",
  called: "ok",
  hit: "ok",
  read: "ok",
  returned: "ok",
  rendered: "ok",
  retrying: "warn",
  stale: "warn",
  miss: "warn",
  error: "fail",
  timeout: "fail",
  exhausted: "fail",
  failed: "fail",
  rate_limited: "fail",
};

/** Standard ease for ordinary forward travel. Never leaves the 0 to 1 range. */
export function easeInOut(t) {
  return t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
}

/**
 * Overshoot ease used for the retry bounce. It deliberately leaves the 0 to 1
 * range, so the packet travels past its target and settles back, which is what
 * makes a retry read as agitated rather than as ordinary forward progress.
 */
export function backOut(t) {
  const c1 = 1.9;
  const c3 = c1 + 1;
  return 1 + c3 * (t - 1) ** 3 + c1 * (t - 1) ** 2;
}

/**
 * Everything after the first attempt is part of the api-service retry bounce,
 * so it gets the overshoot. The first pass through the pipeline does not.
 */
export function easeForHop(hop) {
  return hop.attempt > 1 ? backOut : easeInOut;
}

function prefersReducedMotion() {
  return typeof globalThis.matchMedia === "function" && globalThis.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function parseTranslate(element) {
  const match = /translate\(\s*(-?[\d.]+)[ ,]+(-?[\d.]+)\s*\)/.exec(element.getAttribute("transform") ?? "");
  if (!match) return { x: 0, y: 0 };
  return { x: Number(match[1]), y: Number(match[2]) };
}

/**
 * @param {object} options
 * @param {SVGElement} options.svg the pipeline diagram
 * @param {SVGElement} options.packet the moving marker
 * @param {(hop: object, index: number, elapsedMs: number) => void} [options.onHop]
 * @param {(elapsedMs: number) => void} [options.onProgress]
 * @param {(hops: Array<object>) => void} [options.onComplete]
 */
export function createPlayback({ svg, packet, onHop, onProgress, onComplete }) {
  const nodes = new Map();
  for (const group of svg.querySelectorAll("[data-layer]")) {
    nodes.set(group.dataset.layer, { group, ...parseTranslate(group) });
  }

  let runToken = 0;
  const glowTimers = new Set();

  function clearGlowTimers() {
    for (const timer of glowTimers) clearTimeout(timer);
    glowTimers.clear();
  }

  function reset() {
    runToken += 1;
    clearGlowTimers();
    for (const { group } of nodes.values()) {
      group.classList.remove("is-active", "is-ok", "is-fail", "is-warn", "just-resolved");
    }
    packet.classList.remove("is-visible", "is-fail");
    const start = nodes.get("browser");
    if (start) packet.setAttribute("transform", `translate(${start.x},${start.y})`);
  }

  function settle(hop) {
    const node = nodes.get(hop.layer);
    if (!node) return;
    const state = OUTCOME_STATE[hop.outcome] ?? "active";
    node.group.classList.remove("is-active", "is-ok", "is-fail", "is-warn");
    node.group.classList.add(`is-${state}`);
    node.group.classList.add("just-resolved");
    const timer = setTimeout(() => {
      node.group.classList.remove("just-resolved");
      glowTimers.delete(timer);
    }, GLOW_MS);
    glowTimers.add(timer);
    packet.classList.toggle("is-fail", state === "fail");
  }

  function travel({ from, to, durationMs, ease, token }) {
    return new Promise((resolve) => {
      if (durationMs <= 0 || (from.x === to.x && from.y === to.y && durationMs < 1)) {
        packet.setAttribute("transform", `translate(${to.x},${to.y})`);
        resolve();
        return;
      }
      const started = performance.now();
      const step = (now) => {
        if (token !== runToken) {
          resolve();
          return;
        }
        const progress = Math.min(1, (now - started) / durationMs);
        const eased = ease(progress);
        const x = from.x + (to.x - from.x) * eased;
        const y = from.y + (to.y - from.y) * eased;
        packet.setAttribute("transform", `translate(${x},${y})`);
        if (progress < 1) {
          requestAnimationFrame(step);
          return;
        }
        resolve();
      };
      requestAnimationFrame(step);
    });
  }

  /**
   * Play a trace.
   *
   * @param {Array<object>} hops
   * @param {{instant?: boolean}} [options] instant skips animation entirely and
   *   applies the final state in one pass. It is used for the table view, for
   *   comparison runs, and whenever the visitor has asked for reduced motion.
   */
  async function play(hops, { instant = false } = {}) {
    reset();
    const token = runToken;
    const skipAnimation = instant || prefersReducedMotion();

    packet.classList.add("is-visible");
    let elapsedMs = 0;

    for (let index = 0; index < hops.length; index += 1) {
      if (token !== runToken) return;
      const hop = hops[index];
      const to = nodes.get(hop.layer);
      if (!to) continue;
      const previous = index === 0 ? to : nodes.get(hops[index - 1].layer) ?? to;

      if (!skipAnimation) {
        // Amber marks the node the packet is heading for; settle() replaces it
        // with the real outcome the moment the packet arrives.
        to.group.classList.remove("is-ok", "is-fail", "is-warn");
        to.group.classList.add("is-active");
        await travel({
          from: previous,
          to,
          durationMs: hop.latencyMs * TIME_SCALE,
          ease: easeForHop(hop),
          token,
        });
      }
      if (token !== runToken) return;

      elapsedMs += hop.latencyMs;
      settle(hop);
      onHop?.(hop, index, elapsedMs);
      onProgress?.(elapsedMs);
    }

    if (token !== runToken) return;
    packet.classList.remove("is-visible");
    onComplete?.(hops);
  }

  return { play, reset, cancel: reset };
}
