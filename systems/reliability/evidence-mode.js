const ENDPOINTS = Object.freeze({
  reliability: "https://api.atlas-systems.uk/v1/reliability",
  objectives: "https://api.atlas-systems.uk/v1/reliability/objectives",
  slo: "https://api.atlas-systems.uk/v1/slo",
  dora: "https://api.atlas-systems.uk/dora/metrics",
});

const FETCH_TIMEOUT_MS = 6000;
const MIN_WEEKLY_DORA_WINDOW_DAYS = 7;
const byId = (id) => document.getElementById(id);

function timestampMs(value) {
  const parsed = Date.parse(value ?? "");
  return Number.isFinite(parsed) ? parsed : null;
}

function numberOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
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

export function calendarDayAgeLabel(date, nowMs = Date.now()) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date ?? ""))) return "date unavailable";
  const dayMs = Date.parse(`${date}T00:00:00Z`);
  if (!Number.isFinite(dayMs)) return "date unavailable";
  const now = new Date(nowMs);
  const todayMs = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const days = Math.max(0, Math.floor((todayMs - dayMs) / 86400000));
  if (days === 0) return "today";
  if (days === 1) return "1 day ago";
  return `${days} days ago`;
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

function objectiveMap(payload) {
  const map = new Map();
  for (const objective of Array.isArray(payload?.objectives) ? payload.objectives : []) {
    if (!objective?.service_id) continue;
    map.set(String(objective.service_id), {
      component: objective?.component ?? objective?.measurement_source?.component ?? null,
      indicator: objective?.indicator ?? null,
      label: objective?.label ?? objective?.display?.label ?? objective?.objective_id ?? null,
      targetPct: numberOrNull(objective?.target_pct),
      windowDays: numberOrNull(objective?.window_days),
    });
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
  return {
    failedProbes,
    firstDay: failures[0].date,
    lastDay,
    lastAge: calendarDayAgeLabel(lastDay, nowMs),
  };
}

function objectiveContext(objective) {
  if (!objective) return null;
  const parts = [];
  if (Number.isFinite(objective.windowDays)) parts.push(`${Math.trunc(objective.windowDays)}-day`);
  if (objective.indicator) parts.push(String(objective.indicator).replaceAll("_", " "));
  if (!parts.length && objective.label) parts.push(String(objective.label));
  return parts.length ? `${parts.join(" ")} objective` : null;
}

export function budgetRemainingLabel(value) {
  const fraction = numberOrNull(value);
  if (fraction === null) return "not measured";
  if (fraction <= 0) return "0.0% remaining";
  return `${(fraction * 100).toFixed(1)}%`;
}

export function reliabilityEvidenceText(entry, report, history, nowMs = Date.now(), objective = null) {
  const reasons = Array.isArray(entry?.reasons) ? entry.reasons.filter(Boolean).map(String) : [];
  const parts = [];
  const context = objectiveContext(objective);
  if (context) parts.push(context);
  if (reasons.length) parts.push(reasons.slice(0, 2).join("; "));
  const remaining = numberOrNull(entry?.budget?.remaining_fraction);
  if (remaining !== null && remaining < 0) {
    parts.push(`${Math.abs(remaining * 100).toFixed(1)}% beyond the error budget`);
  }
  if (history?.failedProbes > 0) {
    parts.push(`${history.failedProbes} failed probe${history.failedProbes === 1 ? "" : "s"} across ${history.firstDay} to ${history.lastDay}; last failed day ${history.lastAge}`);
  } else if (history?.failedProbes === 0) {
    parts.push("no failed probe days remain in the current raw window");
  }
  parts.push(report?.evaluated_at ? `evaluated ${ageLabel(report.evaluated_at, nowMs)}` : "evaluation time unavailable");
  return parts.join(" · ");
}

function formatWindow(days) {
  if (!Number.isFinite(days) || days <= 0) return "window unavailable";
  if (days < 1 / 24) return `${Math.max(1, Math.round(days * 24 * 60))} minutes`;
  if (days < 1) return `${(days * 24).toFixed(days * 24 < 10 ? 1 : 0)} hours`;
  return `${days.toFixed(days < 10 ? 1 : 0)} days`;
}

export function doraPresentation(payload) {
  const frequency = payload?.deploymentFrequency ?? payload?.deployment_frequency ?? {};
  const total = numberOrNull(frequency?.totalInWindow ?? frequency?.total_in_window);
  const perWeek = numberOrNull(frequency?.perWeek ?? frequency?.per_week);
  const days = numberOrNull(payload?.window?.days);
  const generatedAt = payload?.computedAt ?? payload?.generatedAt ?? payload?.generated_at ?? null;
  const shortWindow = days === null || days < MIN_WEEKLY_DORA_WINDOW_DAYS;
  const degraded = payload?.degraded === true || payload?.data_quality === "degraded";

  if (shortWindow) {
    return {
      statusState: "warning",
      statusText: days === null
        ? "Delivery events loaded, but the observation window is unavailable. A weekly rate is not promoted from an unbounded sample."
        : `Delivery events loaded from only ${formatWindow(days)} of observed history. Weekly extrapolation is withheld until at least ${MIN_WEEKLY_DORA_WINDOW_DAYS} days are observed.`,
      frequencyLabel: "Observed deployments",
      frequencyValue: total === null ? "not computable" : String(Math.trunc(total)),
      frequencyBasis: `${total === null ? "Unknown deployment count" : `${Math.trunc(total)} deployment${Math.trunc(total) === 1 ? "" : "s"}`} in ${formatWindow(days)}; source-rate extrapolation ${perWeek === null ? "unavailable" : `${perWeek.toFixed(2)}/week`} is not presented as a stable weekly baseline.`,
      windowText: `Observed window ${formatWindow(days)}; generated ${generatedAt ? ageLabel(generatedAt) : "time unavailable"}.`,
    };
  }

  return {
    statusState: degraded ? "warning" : "healthy",
    statusText: degraded
      ? "Delivery metrics are published with degraded-data handling."
      : "Delivery metrics loaded from a bounded observation window long enough to report the weekly frequency.",
    frequencyLabel: "Deploys per week",
    frequencyValue: perWeek === null ? "not computable" : perWeek.toFixed(2),
    frequencyBasis: `${total === null ? "Unknown deployment count" : `${Math.trunc(total)} deployment${Math.trunc(total) === 1 ? "" : "s"}`} across ${formatWindow(days)} of observed history.`,
    windowText: `Observed window ${formatWindow(days)}; generated ${generatedAt ? ageLabel(generatedAt) : "time unavailable"}.`,
  };
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

function makeEvidenceCell(entry, envelope, report, history, objective) {
  const mode = evidenceMode(entry, envelope);
  const fragment = document.createDocumentFragment();
  const badge = document.createElement("span");
  badge.className = "atlas-evidence-mode";
  badge.dataset.evidenceMode = mode;
  badge.textContent = evidenceLabel(mode);
  const detail = document.createElement("span");
  detail.className = "systems-evidence-detail";
  detail.textContent = reliabilityEvidenceText(entry, report, history, Date.now(), objective);
  fragment.append(badge, detail);
  return { fragment, mode };
}

function apply(payload, objectives, slo) {
  const { report, entries } = entriesOf(payload);
  const byService = new Map(entries.map((entry) => [String(entry?.service_id ?? ""), entry]));
  const objectiveByService = objectiveMap(objectives);
  const rows = byId("budget-rows")?.querySelectorAll("tr") ?? [];
  for (const row of rows) {
    const service = row.cells?.[0]?.textContent?.trim();
    const evidenceCell = row.cells?.[5];
    const budgetCell = row.cells?.[2];
    const entry = service ? byService.get(service) : null;
    if (!entry || !evidenceCell) continue;
    const objective = objectiveByService.get(service) ?? null;
    const component = objective?.component ?? null;
    const history = component ? failureHistory(slo, component) : null;
    const rendered = makeEvidenceCell(entry, payload, report, history, objective);
    if (budgetCell) budgetCell.textContent = budgetRemainingLabel(entry?.budget?.remaining_fraction);
    evidenceCell.className = "systems-evidence-cell";
    evidenceCell.dataset.evidenceMode = rendered.mode;
    evidenceCell.replaceChildren(rendered.fragment);
  }
}

function applyDora(payload) {
  const presentation = doraPresentation(payload);
  const value = byId("dora-frequency");
  const label = value?.closest(".focus-metric")?.querySelector("span");
  if (label) label.textContent = presentation.frequencyLabel;
  if (value) value.textContent = presentation.frequencyValue;
  const basis = byId("dora-frequency-basis");
  if (basis) basis.textContent = presentation.frequencyBasis;
  const window = byId("dora-window");
  if (window) window.textContent = presentation.windowText;
  const status = byId("dora-status");
  if (status) {
    status.dataset.state = presentation.statusState;
    status.textContent = presentation.statusText;
  }
}

function watch(section, applyFn) {
  if (!section || typeof MutationObserver === "undefined") return;
  const observer = new MutationObserver(() => {
    observer.disconnect();
    applyFn();
    observer.observe(section, { childList: true, subtree: true, characterData: true });
  });
  observer.observe(section, { childList: true, subtree: true, characterData: true });
}

async function load() {
  const [reliability, objectives, slo, dora] = await Promise.allSettled([
    fetchJson(ENDPOINTS.reliability),
    fetchJson(ENDPOINTS.objectives),
    fetchJson(ENDPOINTS.slo),
    fetchJson(ENDPOINTS.dora),
  ]);

  if (reliability.status === "fulfilled" && objectives.status === "fulfilled") {
    const applyFn = () => apply(
      reliability.value,
      objectives.value,
      slo.status === "fulfilled" ? slo.value : {},
    );
    applyFn();
    watch(byId("budget-rows"), applyFn);
  }

  if (dora.status === "fulfilled") {
    const applyFn = () => applyDora(dora.value);
    applyFn();
    watch(byId("dora-frequency")?.closest("section"), applyFn);
  }
}

if (typeof document !== "undefined") void load();
