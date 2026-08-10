const ENDPOINTS = Object.freeze({
  telemetry: "https://api.atlas-systems.uk/specular",
  infra: "https://api.atlas-systems.uk/v1/infra/status",
  corpus: "https://api.atlas-systems.uk/v1/rag/stats",
});

const FETCH_TIMEOUT_MS = 6000;
const TELEMETRY_STALE_MS = 2 * 60 * 1000;
const INFRA_STALE_MS = 20 * 60 * 1000;
const byId = (id) => document.getElementById(id);

function timestampMs(value) {
  const parsed = Date.parse(value ?? "");
  return Number.isFinite(parsed) ? parsed : null;
}

export function ageLabel(value, nowMs = Date.now()) {
  const parsed = timestampMs(value);
  if (parsed === null) return "timestamp unavailable";
  const seconds = Math.max(0, Math.round((nowMs - parsed) / 1000));
  if (seconds < 60) return `${seconds}s old`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m old`;
  if (seconds < 86400) return `${Math.round(seconds / 3600)}h old`;
  return `${Math.round(seconds / 86400)}d old`;
}

function staleAt(value, thresholdMs, nowMs = Date.now()) {
  const parsed = timestampMs(value);
  return parsed === null || nowMs - parsed > thresholdMs;
}

function evidenceLabel(mode) {
  return {
    measured: "Measured",
    "stale-measured": "Stale measured",
    unavailable: "Unavailable",
    unknown: "Unknown",
  }[mode] ?? "Unknown";
}

function runtimeState(raw) {
  const value = String(raw ?? "unknown").toLowerCase();
  if (["ok", "healthy", "operational", "up"].includes(value)) return "healthy";
  if (["degraded", "warning"].includes(value)) return "degraded";
  if (["down", "failed", "failure", "offline"].includes(value)) return "down";
  return "unknown";
}

export function deriveTelemetryEvidence(payload, nowMs = Date.now()) {
  const telemetry = payload?.telemetry ?? null;
  const sampledAt = telemetry?.sampled_at ?? payload?.last_seen ?? payload?.fetched_at ?? null;
  const stale = staleAt(sampledAt, TELEMETRY_STALE_MS, nowMs);
  const online = payload?.online;
  const runtime = online === false ? "down" : online === true ? (stale ? "degraded" : "healthy") : "unknown";
  const evidenceMode = telemetry
    ? (stale || online === false ? "stale-measured" : "measured")
    : online === false ? "unavailable" : "unknown";
  return { telemetry, sampledAt, stale, runtime, evidenceMode };
}

export function deriveInfraEvidence(payload, nowMs = Date.now()) {
  const reportAt = payload?.last_report_at ?? payload?.checked_at ?? payload?.generated_at ?? null;
  const stale = payload?.stale === true || staleAt(reportAt, INFRA_STALE_MS, nowMs);
  let runtime = runtimeState(payload?.overall ?? payload?.state ?? payload?.status);
  if (stale && runtime === "healthy") runtime = "unknown";
  const evidenceMode = reportAt ? (stale ? "stale-measured" : "measured") : "unknown";
  const components = payload?.components && typeof payload.components === "object"
    ? Object.entries(payload.components)
    : [];
  const passing = components.filter(([, value]) => value?.ok === true).length;
  return { reportAt, stale, runtime, evidenceMode, components, passing };
}

export function deriveCorpusEvidence(payload, nowMs = Date.now()) {
  const hour = Number(payload?.queries_last_hour ?? payload?.last_hour ?? payload?.counts?.last_hour);
  const today = Number(payload?.queries_today ?? payload?.today ?? payload?.counts?.today);
  const total = Number(payload?.queries_total ?? payload?.total ?? payload?.counts?.total);
  const hasCounts = [hour, today, total].some(Number.isFinite);
  const source = String(payload?.source ?? "none");
  const sourceAt = source === "live"
    ? payload?.generated_at ?? payload?.last_query_at ?? null
    : payload?.last_summary_at ?? payload?.generated_at ?? null;
  const evidenceMode = source === "live" && hasCounts
    ? "measured"
    : source === "last-summary" && hasCounts
      ? "stale-measured"
      : source === "none"
        ? "unavailable"
        : "unknown";
  const countText = ["measured", "stale-measured"].includes(evidenceMode)
    ? Number.isFinite(hour) ? `${hour} / hour` : Number.isFinite(today) ? `${today} today` : "—"
    : "—";
  return { hour, today, total, source, sourceAt, evidenceMode, countText, nowMs };
}

async function fetchJson(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, { headers: { Accept: "application/json" }, cache: "no-store", signal: controller.signal });
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
    return await response.json();
  } finally {
    clearTimeout(timeout);
  }
}

function ensureEvidenceBadge(anchorId, badgeId, mode) {
  const anchor = byId(anchorId);
  if (!anchor) return null;
  let badge = byId(badgeId);
  if (!badge) {
    badge = document.createElement("span");
    badge.id = badgeId;
    anchor.insertAdjacentElement("afterend", badge);
  }
  badge.className = "atlas-evidence-mode systems-evidence-mode-inline";
  badge.dataset.evidenceMode = mode;
  badge.textContent = evidenceLabel(mode);
  return badge;
}

function setRuntimeBadge(id, state, label = state) {
  const node = byId(id);
  if (!node) return;
  node.className = "focus-state";
  node.dataset.state = state;
  delete node.dataset.evidenceMode;
  node.textContent = label;
}

function setEvidenceValue(id, value, mode) {
  const node = byId(id);
  if (!node) return;
  node.dataset.evidenceMode = mode;
  node.textContent = value;
}

function pct(value) {
  const number = Number(value);
  return Number.isFinite(number) ? `${Math.round(number)}%` : "—";
}

function temp(value) {
  const number = Number(value);
  return Number.isFinite(number) ? `${Math.round(number)}°C` : "—";
}

function applyTelemetry(payload) {
  const view = deriveTelemetryEvidence(payload);
  setRuntimeBadge("telemetry-state", view.runtime, view.runtime === "down" ? "offline" : view.runtime);
  ensureEvidenceBadge("telemetry-state", "telemetry-evidence-mode", view.evidenceMode);
  setEvidenceValue("summary-telemetry", view.runtime === "down" ? "offline" : view.runtime, view.evidenceMode);
  const values = [
    ["metric-gpu", pct(view.telemetry?.gpu?.utilisation_pct ?? view.telemetry?.gpu?.utilization_pct)],
    ["metric-gpu-temp", temp(view.telemetry?.gpu?.temperature_c)],
    ["metric-cpu", pct(view.telemetry?.cpu?.overall_pct ?? view.telemetry?.cpu?.percent)],
    ["metric-ram", pct(view.telemetry?.ram?.pct ?? view.telemetry?.memory?.percent)],
  ];
  for (const [id, value] of values) setEvidenceValue(id, value, value === "—" ? "unavailable" : view.evidenceMode);
  const detail = byId("telemetry-detail");
  if (detail) {
    detail.dataset.state = view.runtime === "down" ? "failure" : view.runtime === "healthy" ? "healthy" : "warning";
    if (view.runtime === "down") {
      detail.textContent = view.sampledAt
        ? `SPECULAR-CORE is offline. Last successful sample ${ageLabel(view.sampledAt)}; displayed metrics are last-known-good, not current.`
        : "SPECULAR-CORE is offline and no last-known-good telemetry sample is available.";
    } else if (view.evidenceMode === "stale-measured") {
      detail.textContent = `The telemetry endpoint reports ${view.runtime}, but the newest sample is ${ageLabel(view.sampledAt)}. Values are stale measured evidence.`;
    } else {
      detail.textContent = `Current telemetry sample ${ageLabel(view.sampledAt)}.`;
    }
  }
}

function applyInfra(payload) {
  const view = deriveInfraEvidence(payload);
  setRuntimeBadge("infra-state", view.runtime, view.runtime);
  ensureEvidenceBadge("infra-state", "infra-evidence-mode", view.evidenceMode);
  const detail = byId("infra-detail");
  if (!detail) return;
  const count = view.components.length;
  const checks = count ? `${view.passing}/${count} local checks last reported passing` : "No local check detail published";
  if (view.runtime === "down" && view.stale) {
    detail.textContent = `${checks}; sentinel is silent and the public infra contract reports the local runtime down. Last report ${ageLabel(view.reportAt)}.`;
  } else if (view.stale) {
    detail.textContent = `${checks}; last report ${ageLabel(view.reportAt)}. Runtime health is not promoted from stale evidence.`;
  } else {
    detail.textContent = `${checks}; current report ${ageLabel(view.reportAt)}.`;
  }
}

function applyCorpus(payload) {
  const view = deriveCorpusEvidence(payload);
  const badge = byId("corpus-state");
  if (badge) {
    badge.className = "atlas-evidence-mode";
    delete badge.dataset.state;
    badge.dataset.evidenceMode = view.evidenceMode;
    badge.textContent = evidenceLabel(view.evidenceMode);
  }
  setEvidenceValue("summary-corpus", view.countText, view.evidenceMode);
  const detail = byId("corpus-detail");
  if (!detail) return;
  const counts = `${Number.isFinite(view.hour) ? view.hour : "—"} last hour; ${Number.isFinite(view.today) ? view.today : "—"} today; ${Number.isFinite(view.total) ? view.total : "—"} all time.`;
  if (view.evidenceMode === "measured") {
    detail.textContent = `${counts} Current aggregate activity evidence. This is not an index-health verdict. Terms and IPs are not rendered.`;
  } else if (view.evidenceMode === "stale-measured") {
    detail.textContent = `${counts} Cached activity summary, ${ageLabel(view.sourceAt)}. This does not prove current index health.`;
  } else {
    detail.textContent = "No current or cached corpus activity evidence is available. No index-health claim is made.";
  }
}

function clarifyObservedServices() {
  const table = byId("registry-rows")?.closest("table");
  const headers = table?.querySelectorAll("thead th");
  if (headers?.[2]) headers[2].textContent = "Public endpoint state";
  const note = table?.closest("section")?.nextElementSibling;
  if (note?.classList.contains("focus-note")) {
    note.textContent = "This table reports the public service contract named in each row. Edge Workers may remain healthy while SPECULAR-CORE is off; local runtime state is reported separately above.";
  }
}

function watch(section, apply) {
  if (!section || typeof MutationObserver === "undefined") return;
  const observer = new MutationObserver(() => {
    observer.disconnect();
    apply();
    observer.observe(section, { childList: true, subtree: true, characterData: true, attributes: true });
  });
  observer.observe(section, { childList: true, subtree: true, characterData: true, attributes: true });
}

async function load() {
  const [telemetry, infra, corpus] = await Promise.allSettled([
    fetchJson(ENDPOINTS.telemetry),
    fetchJson(ENDPOINTS.infra),
    fetchJson(ENDPOINTS.corpus),
  ]);
  if (telemetry.status === "fulfilled") {
    const apply = () => applyTelemetry(telemetry.value);
    apply();
    watch(byId("telemetry-state")?.closest("section"), apply);
  }
  if (infra.status === "fulfilled") {
    const apply = () => applyInfra(infra.value);
    apply();
    watch(byId("infra-state")?.closest("article"), apply);
  }
  if (corpus.status === "fulfilled") {
    const apply = () => applyCorpus(corpus.value);
    apply();
    watch(byId("corpus-state")?.closest("article"), apply);
  }
  clarifyObservedServices();
  watch(byId("registry-rows")?.closest("section"), clarifyObservedServices);
}

if (typeof document !== "undefined") void load();
