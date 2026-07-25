const ENDPOINTS = Object.freeze({
  telemetry: "https://api.atlas-systems.uk/specular",
  registry: "https://api.atlas-systems.uk/v1/registry",
  health: "https://api.atlas-systems.uk/sonify",
  topology: "https://api.atlas-systems.uk/v1/topology",
  infra: "https://api.atlas-systems.uk/v1/infra/status",
  corpus: "https://api.atlas-systems.uk/v1/rag/stats",
  events: "https://api.atlas-systems.uk/notify/recent",
});

const FETCH_TIMEOUT_MS = 6000;
const TELEMETRY_STALE_MS = 2 * 60 * 1000;
const GENERAL_STALE_MS = 20 * 60 * 1000;
const OBSERVED_STATES = new Set(["healthy", "degraded", "down", "unknown"]);

const byId = (id) => document.getElementById(id);

function setText(id, value) {
  const node = byId(id);
  if (node) node.textContent = String(value ?? "unknown");
}

function setState(id, state, label = state) {
  const node = byId(id);
  if (!node) return;
  node.dataset.state = state;
  node.textContent = label;
}

function timestampOf(value) {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function ageLabel(value, nowMs = Date.now()) {
  const parsed = timestampOf(value);
  if (parsed === null) return "timestamp unavailable";
  const seconds = Math.max(0, Math.round((nowMs - parsed) / 1000));
  if (seconds < 60) return `${seconds}s old`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m old`;
  if (seconds < 86400) return `${Math.round(seconds / 3600)}h old`;
  return `${Math.round(seconds / 86400)}d old`;
}

function isStale(value, threshold, nowMs = Date.now()) {
  const parsed = timestampOf(value);
  return parsed === null || nowMs - parsed > threshold;
}

function percent(value) {
  const number = Number(value);
  return Number.isFinite(number) ? `${Math.round(number)}%` : "not measured";
}

function temperature(value) {
  const number = Number(value);
  return Number.isFinite(number) ? `${Math.round(number)}°C` : "not measured";
}

async function fetchJson(url) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      headers: { Accept: "application/json" },
      cache: "no-store",
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
    return await response.json();
  } finally {
    window.clearTimeout(timeout);
  }
}

function telemetryTimestamp(payload) {
  return payload?.telemetry?.sampled_at
    || payload?.timestamp
    || payload?.fetched_at
    || payload?.last_seen
    || null;
}

function renderTelemetry(payload) {
  const telemetry = payload?.telemetry ?? payload ?? {};
  const online = payload?.online;
  const sampledAt = telemetryTimestamp(payload);
  const stale = isStale(sampledAt, TELEMETRY_STALE_MS);
  const state = online === false ? "down" : stale ? "stale" : online === true ? "healthy" : "unknown";
  setState("telemetry-state", state, state === "down" ? "offline" : state);
  setText("summary-telemetry", state);
  setText("metric-gpu", percent(telemetry?.gpu?.utilisation_pct ?? telemetry?.gpu?.utilization_pct));
  setText("metric-gpu-temp", temperature(telemetry?.gpu?.temperature_c));
  setText("metric-cpu", percent(telemetry?.cpu?.overall_pct ?? telemetry?.cpu?.percent));
  setText("metric-ram", percent(telemetry?.ram?.pct ?? telemetry?.memory?.percent));
  const detail = byId("telemetry-detail");
  detail.dataset.state = state === "healthy" ? "healthy" : state === "down" ? "failure" : "warning";
  detail.textContent = sampledAt
    ? `${stale ? "Stale sample" : "Latest successful sample"}: ${ageLabel(sampledAt)}.`
    : "No valid sample timestamp was published.";
  return state;
}

function registryEntries(payload) {
  const candidates = [payload?.workers, payload?.services, payload?.entries, payload?.registry?.services, payload?.data?.services];
  return candidates.find(Array.isArray) ?? [];
}

function healthEntries(payload) {
  return Array.isArray(payload?.services) ? payload.services : [];
}

function topologyEntries(payload) {
  return Array.isArray(payload?.components) ? payload.components : [];
}

function observedState(value) {
  const state = String(value ?? "unknown").toLowerCase();
  return OBSERVED_STATES.has(state) ? state : "unknown";
}

export function buildObservedServices(registryPayload, healthPayload, topologyPayload) {
  const registry = registryEntries(registryPayload);
  const healthByName = new Map(
    healthEntries(healthPayload)
      .filter((entry) => typeof entry?.name === "string")
      .map((entry) => [entry.name, entry]),
  );
  const topologyByName = new Map(
    topologyEntries(topologyPayload)
      .filter((entry) => typeof (entry?.id ?? entry?.name) === "string")
      .map((entry) => [entry.id ?? entry.name, entry]),
  );

  const services = [];
  const uncovered = [];
  for (const entry of registry.slice(0, 80)) {
    const name = String(entry?.name ?? entry?.service ?? entry?.id ?? "").trim();
    if (!name) continue;
    const health = healthByName.get(name);
    if (!health) {
      uncovered.push(name);
      continue;
    }
    const topology = topologyByName.get(name);
    services.push({
      name,
      layer: topology?.layer ?? topology?.kind ?? "public worker",
      state: observedState(health.status),
      detail: health.health_detail ?? "Bounded health record returned no detail.",
      evidenceSource: health.evidence_source ?? null,
      measuredAt: health.measured_at ?? healthPayload?.timestamp ?? null,
      latencyMs: Number.isFinite(health.latency_ms) ? health.latency_ms : null,
    });
  }

  return {
    services,
    uncovered,
    totalRegistry: registry.length,
    currentMeasurements: services.filter((service) => service.state !== "unknown" && service.measuredAt).length,
  };
}

function serviceEvidenceLabel(service) {
  const parts = [service.detail];
  if (service.measuredAt) parts.push(ageLabel(service.measuredAt));
  if (Number.isFinite(service.latencyMs)) parts.push(`${Math.round(service.latencyMs)} ms`);
  return parts.filter(Boolean).join("; ");
}

function renderObservedServices(registryPayload, healthPayload, topologyPayload) {
  const rows = byId("registry-rows");
  rows.replaceChildren();
  const view = buildObservedServices(registryPayload, healthPayload, topologyPayload);

  if (!view.services.length) {
    const row = document.createElement("tr");
    const cell = document.createElement("td");
    cell.colSpan = 4;
    cell.textContent = "No registry entries have a bounded health contract. Inventory alone is not observation.";
    row.appendChild(cell);
    rows.appendChild(row);
    setText("summary-services", "0 covered");
    const status = byId("registry-status");
    status.dataset.state = "warning";
    status.textContent = `${view.totalRegistry} public registry entries; none can be presented as observed services.`;
    return "empty";
  }

  for (const service of view.services) {
    const row = document.createElement("tr");
    const name = document.createElement("td");
    const layer = document.createElement("td");
    const stateCell = document.createElement("td");
    const evidence = document.createElement("td");
    name.textContent = service.name;
    layer.textContent = service.layer;
    const badge = document.createElement("span");
    badge.className = "focus-state";
    badge.dataset.state = service.state;
    badge.textContent = service.state;
    stateCell.appendChild(badge);
    evidence.textContent = serviceEvidenceLabel(service);
    row.append(name, layer, stateCell, evidence);
    rows.appendChild(row);
  }

  setText("summary-services", `${view.services.length} covered`);
  const status = byId("registry-status");
  const hasDown = view.services.some((service) => service.state === "down");
  const hasNonHealthy = view.services.some((service) => ["degraded", "unknown"].includes(service.state));
  status.dataset.state = view.uncovered.length ? "warning" : hasDown ? "failure" : hasNonHealthy ? "warning" : "healthy";
  status.textContent = view.uncovered.length
    ? `${view.services.length}/${view.totalRegistry} public services have health contracts; ${view.uncovered.length} inventory-only entr${view.uncovered.length === 1 ? "y was" : "ies were"} omitted.`
    : `${view.services.length}/${view.totalRegistry} public services have health contracts; ${view.currentMeasurements} current measurements available.`;

  if (hasDown) return "failed";
  if (view.uncovered.length || hasNonHealthy) return "degraded";
  return "healthy";
}

function eventEntries(payload) {
  const candidates = [payload?.events, payload?.items, payload?.recent, payload?.data?.events];
  return candidates.find(Array.isArray) ?? [];
}

function eventTimestamp(event) {
  return event?.ts ?? event?.timestamp ?? event?.created_at ?? event?.generated_at ?? null;
}

function renderEvents(payload) {
  const list = byId("failure-feed");
  list.replaceChildren();
  const events = eventEntries(payload);
  const failures = events
    .filter((event) => ["failure", "failed", "error", "critical"].includes(String(event?.level ?? event?.status ?? "").toLowerCase()))
    .slice(0, 12);
  setText("summary-failures", String(failures.length));
  const status = byId("incident-status");

  if (!failures.length) {
    const item = document.createElement("li");
    const title = document.createElement("strong");
    const detail = document.createElement("span");
    title.textContent = events.length ? "No failure-level events in the bounded response." : "No recent event evidence was returned.";
    detail.textContent = events.length ? "This is a feed result, not a whole-estate health verdict." : "Unknown is not healthy.";
    item.append(title, detail);
    list.appendChild(item);
    status.dataset.state = events.length ? "healthy" : "warning";
    status.textContent = events.length ? `${events.length} recent events inspected.` : "Recent event feed was empty.";
    return events.length ? "healthy" : "empty";
  }

  for (const event of failures) {
    const item = document.createElement("li");
    const title = document.createElement("strong");
    const detail = document.createElement("p");
    const meta = document.createElement("span");
    title.textContent = String(event?.title ?? event?.event ?? "Failure event");
    detail.textContent = String(event?.message ?? "No public message supplied.");
    meta.textContent = `${String(event?.source ?? event?.dialect ?? "public event stream")} · ${ageLabel(eventTimestamp(event))}`;
    item.append(title, detail, meta);
    list.appendChild(item);
  }
  status.dataset.state = "failure";
  status.textContent = `${failures.length} failure-level event${failures.length === 1 ? "" : "s"} in the bounded response.`;
  return "failure";
}

export function deriveInfraView(payload, nowMs = Date.now()) {
  const raw = String(payload?.overall ?? payload?.state ?? payload?.status ?? "unknown").toLowerCase();
  const reportAt = payload?.last_report_at ?? payload?.checked_at ?? payload?.generated_at ?? null;
  const stale = payload?.stale === true || isStale(reportAt, GENERAL_STALE_MS, nowMs);
  const state = stale
    ? "stale"
    : ["ok", "healthy", "operational", "up"].includes(raw)
      ? "healthy"
      : ["degraded", "warning"].includes(raw)
        ? "degraded"
        : ["down", "failed", "failure"].includes(raw)
          ? "failed"
          : "unknown";
  const checks = payload?.components && typeof payload.components === "object"
    ? Object.keys(payload.components).length
    : payload?.checks && typeof payload.checks === "object"
      ? Object.keys(payload.checks).length
      : 0;
  return {
    state,
    checks,
    reportAt,
    detail: `${checks || "No"} local check${checks === 1 ? "" : "s"}; ${reportAt ? `report ${ageLabel(reportAt, nowMs)}` : "report age unknown"}.`,
  };
}

function renderInfra(payload) {
  const view = deriveInfraView(payload);
  setState("infra-state", view.state);
  setText("infra-detail", view.detail);
  return view.state;
}

export function deriveCorpusView(payload, nowMs = Date.now()) {
  const hour = Number(payload?.last_hour ?? payload?.counts?.last_hour ?? payload?.queries_last_hour);
  const today = Number(payload?.today ?? payload?.counts?.today ?? payload?.queries_today);
  const total = Number(payload?.total ?? payload?.counts?.total ?? payload?.queries_total);
  const hasCounts = [hour, today, total].some(Number.isFinite);
  const source = String(payload?.source ?? "none");
  const summaryAt = payload?.last_summary_at ?? payload?.generated_at ?? null;
  const state = source === "live" && hasCounts
    ? "healthy"
    : source === "last-summary" && hasCounts
      ? "stale"
      : "unknown";
  const countText = Number.isFinite(hour) ? `${hour} / hour` : Number.isFinite(today) ? `${today} today` : "unknown";
  const counts = `${Number.isFinite(hour) ? hour : "unknown"} last hour; ${Number.isFinite(today) ? today : "unknown"} today; ${Number.isFinite(total) ? total : "unknown"} all time.`;
  const provenance = source === "live"
    ? "Live corpus statistics."
    : source === "last-summary"
      ? `Cached activity summary; ${summaryAt ? ageLabel(summaryAt, nowMs) : "summary time unavailable"}. This does not prove current index health.`
      : "No live or cached corpus source is available. No index-health claim is made.";
  return { state, countText, detail: `${counts} ${provenance} Terms and IPs are not rendered.` };
}

function renderCorpus(payload) {
  const view = deriveCorpusView(payload);
  setState("corpus-state", view.state);
  setText("summary-corpus", view.countText);
  setText("corpus-detail", view.detail);
  return view.state;
}

function renderFailure(id, summaryId, label, error) {
  if (summaryId) setText(summaryId, "unavailable");
  const node = byId(id);
  if (node) {
    node.dataset.state = "failure";
    node.textContent = `${label} unavailable: ${error instanceof Error ? error.message : String(error)}`;
  }
}

async function load() {
  const keys = Object.keys(ENDPOINTS);
  const settled = await Promise.allSettled(keys.map((key) => fetchJson(ENDPOINTS[key])));
  const results = Object.fromEntries(keys.map((key, index) => [key, settled[index]]));
  const states = [];

  if (results.telemetry.status === "fulfilled") states.push(renderTelemetry(results.telemetry.value));
  else {
    setState("telemetry-state", "unavailable");
    renderFailure("telemetry-detail", "summary-telemetry", "Telemetry", results.telemetry.reason);
    states.push("unavailable");
  }

  if (
    results.registry.status === "fulfilled"
    && results.health.status === "fulfilled"
    && results.topology.status === "fulfilled"
  ) {
    states.push(renderObservedServices(results.registry.value, results.health.value, results.topology.value));
  } else {
    const failed = [results.registry, results.health, results.topology].find((result) => result.status === "rejected");
    renderFailure("registry-status", "summary-services", "Observed service composition", failed?.reason ?? "source unavailable");
    states.push("unavailable");
  }

  if (results.infra.status === "fulfilled") states.push(renderInfra(results.infra.value));
  else {
    setState("infra-state", "unavailable");
    setText("infra-detail", "Public infra status is unavailable.");
    states.push("unavailable");
  }

  if (results.corpus.status === "fulfilled") states.push(renderCorpus(results.corpus.value));
  else {
    setState("corpus-state", "unavailable");
    setText("summary-corpus", "unavailable");
    setText("corpus-detail", "Aggregate corpus activity is unavailable.");
    states.push("unavailable");
  }

  if (results.events.status === "fulfilled") states.push(renderEvents(results.events.value));
  else {
    renderFailure("incident-status", "summary-failures", "Recent events", results.events.reason);
    states.push("unavailable");
  }

  const overall = byId("observation-status");
  if (states.some((state) => ["failed", "failure", "down"].includes(state))) {
    overall.dataset.state = "failure";
    overall.textContent = "At least one bounded source reports current failure evidence.";
  } else if (states.some((state) => ["stale", "degraded", "empty", "unknown", "unavailable"].includes(state))) {
    overall.dataset.state = "warning";
    overall.textContent = "The frame contains stale, empty, unknown, degraded, or unavailable evidence.";
  } else {
    overall.dataset.state = "healthy";
    overall.textContent = "All loaded public sources returned current bounded evidence.";
  }
}

if (typeof document !== "undefined") load();
