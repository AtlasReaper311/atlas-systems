const ENDPOINTS = Object.freeze({
  telemetry: "https://api.atlas-systems.uk/specular",
  registry: "https://api.atlas-systems.uk/v1/registry",
  infra: "https://api.atlas-systems.uk/v1/infra/status",
  corpus: "https://api.atlas-systems.uk/v1/rag/stats",
  events: "https://api.atlas-systems.uk/notify/recent",
});

const FETCH_TIMEOUT_MS = 6000;
const TELEMETRY_STALE_MS = 2 * 60 * 1000;
const GENERAL_STALE_MS = 20 * 60 * 1000;

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

function ageLabel(value) {
  const parsed = timestampOf(value);
  if (parsed === null) return "timestamp unavailable";
  const seconds = Math.max(0, Math.round((Date.now() - parsed) / 1000));
  if (seconds < 60) return `${seconds}s old`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m old`;
  if (seconds < 86400) return `${Math.round(seconds / 3600)}h old`;
  return `${Math.round(seconds / 86400)}d old`;
}

function isStale(value, threshold) {
  const parsed = timestampOf(value);
  return parsed === null || Date.now() - parsed > threshold;
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
  const candidates = [payload?.services, payload?.workers, payload?.entries, payload?.registry?.services, payload?.data?.services];
  return candidates.find(Array.isArray) ?? [];
}

function registryState(entry) {
  const raw = String(entry?.status ?? entry?.state ?? entry?.health ?? "unknown").toLowerCase();
  if (["healthy", "live", "operational", "ok", "up"].includes(raw)) return "healthy";
  if (["warning", "degraded", "stale"].includes(raw)) return raw === "stale" ? "stale" : "degraded";
  if (["failed", "failure", "down", "offline"].includes(raw)) return "failed";
  return "unknown";
}

function renderRegistry(payload) {
  const rows = byId("registry-rows");
  rows.replaceChildren();
  const entries = registryEntries(payload);
  if (!entries.length) {
    const row = document.createElement("tr");
    const cell = document.createElement("td");
    cell.colSpan = 4;
    cell.textContent = "The registry returned no public services. Empty is not operational.";
    row.appendChild(cell);
    rows.appendChild(row);
    setText("summary-services", "0 observed");
    const status = byId("registry-status");
    status.dataset.state = "warning";
    status.textContent = "Registry response was valid but empty.";
    return "empty";
  }

  const bounded = entries.slice(0, 80);
  let measured = 0;
  for (const entry of bounded) {
    const row = document.createElement("tr");
    const name = document.createElement("td");
    const layer = document.createElement("td");
    const stateCell = document.createElement("td");
    const evidence = document.createElement("td");
    const state = registryState(entry);
    name.textContent = String(entry?.display_name ?? entry?.name ?? entry?.service ?? entry?.id ?? "unnamed public service");
    layer.textContent = String(entry?.layer ?? entry?.kind ?? "unclassified");
    const badge = document.createElement("span");
    badge.className = "focus-state";
    badge.dataset.state = state;
    badge.textContent = state;
    stateCell.appendChild(badge);
    const verified = entry?.meta_verified === true || entry?.measured === true || entry?.source === "probe";
    evidence.textContent = verified ? "measured public evidence" : "declared or unmeasured";
    if (verified) measured += 1;
    row.append(name, layer, stateCell, evidence);
    rows.appendChild(row);
  }
  setText("summary-services", `${bounded.length} public`);
  const status = byId("registry-status");
  status.dataset.state = "healthy";
  status.textContent = `${bounded.length} public services rendered; ${measured} explicitly measured.`;
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

function renderInfra(payload) {
  const raw = String(payload?.overall ?? payload?.state ?? payload?.status ?? "unknown").toLowerCase();
  const stale = payload?.stale === true || isStale(payload?.checked_at ?? payload?.generated_at ?? payload?.last_report_at, GENERAL_STALE_MS);
  const state = stale ? "stale" : ["ok", "healthy", "operational", "up"].includes(raw) ? "healthy" : ["degraded", "warning"].includes(raw) ? "degraded" : ["down", "failed", "failure"].includes(raw) ? "failed" : "unknown";
  setState("infra-state", state);
  const checks = payload?.checks && typeof payload.checks === "object" ? Object.keys(payload.checks).length : 0;
  setText("infra-detail", `${checks || "No"} public check${checks === 1 ? "" : "s"}; ${payload?.checked_at ? ageLabel(payload.checked_at) : "report age unknown"}.`);
  return state;
}

function renderCorpus(payload) {
  const hour = Number(payload?.last_hour ?? payload?.counts?.last_hour ?? payload?.queries_last_hour);
  const today = Number(payload?.today ?? payload?.counts?.today ?? payload?.queries_today);
  const total = Number(payload?.total ?? payload?.counts?.total ?? payload?.queries_total);
  const hasCounts = [hour, today, total].some(Number.isFinite);
  const state = payload?.stale === true ? "stale" : hasCounts ? "healthy" : "unknown";
  setState("corpus-state", state);
  setText("summary-corpus", Number.isFinite(hour) ? `${hour} / hour` : Number.isFinite(today) ? `${today} today` : "unknown");
  setText("corpus-detail", hasCounts
    ? `${Number.isFinite(hour) ? hour : "unknown"} last hour; ${Number.isFinite(today) ? today : "unknown"} today; ${Number.isFinite(total) ? total : "unknown"} all time. Terms and IPs are not rendered.`
    : "The public response did not contain aggregate query counts. No index-health claim is made.");
  return state;
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
  const results = await Promise.allSettled(Object.values(ENDPOINTS).map(fetchJson));
  const [telemetry, registry, infra, corpus, events] = results;
  const states = [];

  if (telemetry.status === "fulfilled") states.push(renderTelemetry(telemetry.value));
  else {
    setState("telemetry-state", "unavailable");
    renderFailure("telemetry-detail", "summary-telemetry", "Telemetry", telemetry.reason);
    states.push("unavailable");
  }

  if (registry.status === "fulfilled") states.push(renderRegistry(registry.value));
  else {
    renderFailure("registry-status", "summary-services", "Registry", registry.reason);
    states.push("unavailable");
  }

  if (infra.status === "fulfilled") states.push(renderInfra(infra.value));
  else {
    setState("infra-state", "unavailable");
    setText("infra-detail", "Public infra status is unavailable.");
    states.push("unavailable");
  }

  if (corpus.status === "fulfilled") states.push(renderCorpus(corpus.value));
  else {
    setState("corpus-state", "unavailable");
    setText("summary-corpus", "unavailable");
    setText("corpus-detail", "Aggregate corpus activity is unavailable.");
    states.push("unavailable");
  }

  if (events.status === "fulfilled") states.push(renderEvents(events.value));
  else {
    renderFailure("incident-status", "summary-failures", "Recent events", events.reason);
    states.push("unavailable");
  }

  const overall = byId("observation-status");
  if (states.some((state) => ["failed", "failure", "down"].includes(state))) {
    overall.dataset.state = "failure";
    overall.textContent = "At least one bounded source reports failure evidence.";
  } else if (states.some((state) => ["stale", "degraded", "empty", "unknown", "unavailable"].includes(state))) {
    overall.dataset.state = "warning";
    overall.textContent = "The frame contains stale, empty, unknown, degraded, or unavailable evidence.";
  } else {
    overall.dataset.state = "healthy";
    overall.textContent = "All loaded public sources returned current bounded evidence.";
  }
}

load();
