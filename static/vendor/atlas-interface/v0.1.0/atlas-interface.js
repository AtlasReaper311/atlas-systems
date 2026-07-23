/*! Atlas Systems Interface Kit v0.1.0 */
const DEFAULT_SOURCE = "https://api.atlas-systems.uk/v1/stats";
const DEFAULT_STALE_AFTER_SECONDS = 1200;

export const STATUS_LABELS = Object.freeze({
  checking: "Checking",
  operational: "Operational",
  degraded: "Degraded",
  unavailable: "Unavailable",
  unknown: "Unknown",
});

export function classifyEstateStatus(payload, nowMs = Date.now(), staleAfterSeconds = DEFAULT_STALE_AFTER_SECONDS) {
  const estate = payload?.estate;
  const operational = Number(estate?.operational);
  const total = Number(estate?.total_components);
  const checkedAtMs = Date.parse(estate?.checked_at ?? "");

  if (!Number.isFinite(operational) || !Number.isFinite(total) || total <= 0 || operational < 0 || operational > total || !Number.isFinite(checkedAtMs)) {
    return "unknown";
  }

  if ((nowMs - checkedAtMs) / 1000 > staleAfterSeconds || checkedAtMs > nowMs + 60_000) {
    return "unknown";
  }

  if (operational === total) return "operational";
  if (operational > total / 2) return "degraded";
  return "unavailable";
}

export function applyStatus(element, state) {
  const safeState = Object.hasOwn(STATUS_LABELS, state) ? state : "unknown";
  element.dataset.state = safeState;
  const label = element.querySelector("[data-atlas-status-label]") ?? element;
  label.textContent = STATUS_LABELS[safeState];
  element.setAttribute("aria-label", `Atlas Systems status: ${STATUS_LABELS[safeState]}`);
}

export async function refreshStatus(element, options = {}) {
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const source = options.source ?? DEFAULT_SOURCE;
  const now = options.now ?? (() => Date.now());
  const staleAfterSeconds = options.staleAfterSeconds ?? DEFAULT_STALE_AFTER_SECONDS;

  applyStatus(element, "checking");
  try {
    const response = await fetchImpl(source, {
      headers: { Accept: "application/json" },
      signal: options.signal,
    });
    if (!response.ok) throw new Error(`Status request failed with ${response.status}`);
    const payload = await response.json();
    const state = classifyEstateStatus(payload, now(), staleAfterSeconds);
    applyStatus(element, state);
    return state;
  } catch {
    applyStatus(element, "unknown");
    return "unknown";
  }
}

export function initializeStatus(options = {}) {
  const elements = [...document.querySelectorAll("[data-atlas-status]")];
  return Promise.all(elements.map((element) => refreshStatus(element, options)));
}

if (typeof document !== "undefined") {
  const start = () => initializeStatus();
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
  else start();
}
