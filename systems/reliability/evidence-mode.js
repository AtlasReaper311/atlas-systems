const ENDPOINTS = Object.freeze({
  reliability: "https://api.atlas-systems.uk/v1/reliability",
  objectives: "https://api.atlas-systems.uk/v1/reliability/objectives",
  slo: "https://api.atlas-systems.uk/v1/slo",
});

const FETCH_TIMEOUT_MS = 6000;
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

function evidenceMode(entry, envelope) {
  if (envelope?.stale === true) return "stale-measured";
  const state = String(entry?.state ?? "unknown");
  if (state === "unmeasured") return "not-applicable-unscored";
  if (["unavailable_source", "malformed_evidence"].includes(state)) return "unavailable";
  if (["insufficient_evidence"].includes(state)) return "unknown";
  return "measured";
}

function evidenceLabel(mode) {
  return {
    measured: "Measured",
    "stale-measured": "Stale measured",
    unavailable: "Unavailable",
    unknown: "Unknown",
    "not-applicable-unscored": "Not applicable / unscored",
  }[mode] ?? "Unknown";
}

function objectiveComponentMap(payload) {
  const map = new Map();
  for (const objective of Array.isArray(payload?.objectives) ? payload.objectives : []) {
    if (objective?.service_id && objective?.component) map.set(String(objective.service_id), String(objective.component));
  }
  return map;
}

export function failureHistory(sloPayload, component, nowMs = Date.now()) {
  const days = sloPayload?.components?.[component]?.days;
  if (!days || typeof days !== "object") return null;
  const failures = Object.entries(days)
    .filter(([, bucket]) => Number(bucket?.total) > Number(bucket?.ok))
    .map(([date, bucket]) => ({ date, failed: Math.max(0, Number(bucket?.total || 0) - Number(bucket?.ok || 0)) }))
    .filter((entry) => Number.isFinite(entry.failed) && entry.failed > 0)
    .sort((a, b) => a.date.localeCompare(b.date));
  if (!failures.length) return { failedProbes: 0, firstDay: null, lastDay: null, lastAge: null };
  const failedProbes = failures.reduce((sum, entry) => sum + entry.failed, 0);
  const lastDay = failures.at(-1).date;
  return { failedProbes, firstDay: failures[0].date, lastDay, lastAge: ageLabel(`${lastDay}T23:59:59Z`, nowMs) };
}

export function reliabilityEvidenceText(entry, report, history, nowMs = Date.now()) {
  const reasons = Array.isArray(entry?.reasons) ? entry.reasons.filter(Boolean).map(String) : [];
  const parts = [];
  if (reasons.length) parts.push(reasons.slice(0, 2).join("; "));
  if (history?.failedProbes > 0) {
    parts.push(`${history.failedProbes} failed probe${history.failedProbes === 1 ? "" : "s"} across ${history.firstDay} to ${history.lastDay}; last failed day ${history.lastAge}`);
  } else if (history?.failedProbes === 0) {
    parts.push("no failed probe days remain in the current raw window");
  }
  parts.push(report?.evaluated_at ? `evaluated ${ageLabel(report.evaluated_at, nowMs)}` : "evaluation time unavailable");
  return parts.join(" · ");
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

function entriesOf(payload) {
  const report = payload?.report ?? {};
  const results = Array.isArray(report?.results) ? report.results : [];
  const unmeasured = Array.isArray(report?.unmeasured)
    ? report.unmeasured.map((entry) => ({ service_id: entry?.service_id, state: "unmeasured", reasons: [entry?.reason ?? "no approved objective"] }))
    : [];
  return { report, entries: [...results, ...unmeasured] };
}

function makeEvidenceCell(entry, envelope, report, history) {
  const mode = evidenceMode(entry, envelope);
  const fragment = document.createDocumentFragment();
  const badge = document.createElement("span");
  badge.className = "atlas-evidence-mode";
  badge.dataset.evidenceMode = mode;
  badge.textContent = evidenceLabel(mode);
  const detail = document.createElement("span");
  detail.className = "systems-evidence-detail";
  detail.textContent = reliabilityEvidenceText(entry, report, history);
  fragment.append(badge, detail);
  return { fragment, mode };
}

function apply(payload, objectives, slo) {
  const { report, entries } = entriesOf(payload);
  const byService = new Map(entries.map((entry) => [String(entry?.service_id ?? ""), entry]));
  const components = objectiveComponentMap(objectives);
  const rows = byId("budget-rows")?.querySelectorAll("tr") ?? [];
  for (const row of rows) {
    const service = row.cells?.[0]?.textContent?.trim();
    const cell = row.cells?.[5];
    const entry = service ? byService.get(service) : null;
    if (!entry || !cell) continue;
    const component = components.get(service);
    const history = component ? failureHistory(slo, component) : null;
    const rendered = makeEvidenceCell(entry, payload, report, history);
    cell.className = "systems-evidence-cell";
    cell.dataset.evidenceMode = rendered.mode;
    cell.replaceChildren(rendered.fragment);
  }
}

function watchRows(applyFn) {
  const body = byId("budget-rows");
  if (!body || typeof MutationObserver === "undefined") return;
  const observer = new MutationObserver(() => {
    observer.disconnect();
    applyFn();
    observer.observe(body, { childList: true, subtree: true, characterData: true });
  });
  observer.observe(body, { childList: true, subtree: true, characterData: true });
}

async function load() {
  const [reliability, objectives, slo] = await Promise.all([
    fetchJson(ENDPOINTS.reliability),
    fetchJson(ENDPOINTS.objectives),
    fetchJson(ENDPOINTS.slo),
  ]);
  const applyFn = () => apply(reliability, objectives, slo);
  applyFn();
  watchRows(applyFn);
}

if (typeof document !== "undefined") void load();
