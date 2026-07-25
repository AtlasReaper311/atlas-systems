const ENDPOINTS = Object.freeze({
  reliability: "https://api.atlas-systems.uk/v1/reliability",
  objectives: "https://api.atlas-systems.uk/v1/reliability/objectives",
  dora: "https://api.atlas-systems.uk/dora/metrics",
  chaos: "https://api.atlas-systems.uk/v1/evidence/chaos",
});

const EVALUATOR_STATES = Object.freeze([
  "objective_met",
  "budget_at_risk",
  "budget_exhausted",
  "insufficient_evidence",
  "stale_evidence",
  "unavailable_source",
  "malformed_evidence",
  "unmeasured",
]);
const EVALUATOR_STATE_SET = new Set(EVALUATOR_STATES);
const FETCH_TIMEOUT_MS = 6000;
const byId = (id) => document.getElementById(id);

function setText(id, value) {
  const node = byId(id);
  if (node) node.textContent = String(value ?? "unknown");
}

function setStatus(id, state, text) {
  const node = byId(id);
  if (!node) return;
  node.dataset.state = state;
  node.textContent = text;
}

function evaluatorState(value) {
  const state = String(value ?? "unknown");
  return EVALUATOR_STATE_SET.has(state) ? state : "unknown";
}

function stateBadge(value) {
  const state = evaluatorState(value);
  const badge = document.createElement("span");
  badge.className = "focus-state";
  badge.dataset.state = state;
  badge.textContent = state.replaceAll("_", " ");
  return badge;
}

function numberOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function percentFromFraction(value, digits = 1) {
  const number = numberOrNull(value);
  return number === null ? "not measured" : `${(number * 100).toFixed(digits)}%`;
}

function ageLabel(value) {
  const parsed = Date.parse(value ?? "");
  if (!Number.isFinite(parsed)) return "timestamp unavailable";
  const seconds = Math.max(0, Math.round((Date.now() - parsed) / 1000));
  if (seconds < 60) return `${seconds}s old`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m old`;
  if (seconds < 86400) return `${Math.round(seconds / 3600)}h old`;
  return `${Math.round(seconds / 86400)}d old`;
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

function clearTable(id, colspan, emptyText) {
  const body = byId(id);
  body.replaceChildren();
  const row = document.createElement("tr");
  const cell = document.createElement("td");
  cell.colSpan = colspan;
  cell.textContent = emptyText;
  row.appendChild(cell);
  body.appendChild(row);
}

function renderObjectives(payload) {
  const objectives = Array.isArray(payload?.objectives) ? payload.objectives : [];
  const unmeasured = Array.isArray(payload?.unmeasured) ? payload.unmeasured : [];
  setText("objective-count", objectives.length);
  setText("unmeasured-count", unmeasured.length);

  if (!objectives.length) {
    clearTable("objective-rows", 5, "The public policy contains no approved objectives. Empty is not healthy.");
    setStatus("objectives-status", "warning", `Policy ${payload?.policy_state ?? "unknown"}; zero objectives.`);
    return;
  }

  const body = byId("objective-rows");
  body.replaceChildren();
  for (const objective of objectives.slice(0, 100)) {
    const row = document.createElement("tr");
    for (const value of [
      objective?.service_id ?? "unknown service",
      objective?.label ?? objective?.objective_id ?? "unknown objective",
      objective?.indicator ?? "unknown",
      numberOrNull(objective?.target_pct) === null ? "not specified" : `${Number(objective.target_pct).toFixed(2)}%`,
      numberOrNull(objective?.window_days) === null ? "not specified" : `${objective.window_days} days`,
    ]) {
      const cell = document.createElement("td");
      cell.textContent = String(value);
      row.appendChild(cell);
    }
    body.appendChild(row);
  }
  const state = payload?.policy_state === "fresh" ? "healthy" : "stale";
  setStatus(
    "objectives-status",
    state,
    `${objectives.length} approved objective${objectives.length === 1 ? "" : "s"}; policy ${payload?.policy_state ?? "unknown"}; fingerprint ${String(payload?.fingerprint ?? "unavailable").slice(0, 12)}.`,
  );
}

function resultRows(payload) {
  const report = payload?.report ?? {};
  return {
    results: Array.isArray(report?.results) ? report.results : [],
    unmeasured: Array.isArray(report?.unmeasured) ? report.unmeasured : [],
    report,
  };
}

function evidenceLabel(result, envelope) {
  if (envelope?.stale === true) return "stale evaluation";
  const reasons = Array.isArray(result?.reasons) ? result.reasons.filter(Boolean) : [];
  if (reasons.length) return reasons.slice(0, 2).join("; ");
  return result?.evaluated_at ? `evaluated ${ageLabel(result.evaluated_at)}` : "evidence time unavailable";
}

function renderReliability(payload) {
  const { results, unmeasured, report } = resultRows(payload);
  setText("measured-count", results.length);
  if (byId("unmeasured-count")?.textContent === "unknown") setText("unmeasured-count", unmeasured.length);
  const atRisk = results.filter((entry) => ["budget_at_risk", "budget_exhausted"].includes(evaluatorState(entry?.state))).length;
  setText("risk-count", atRisk);

  const body = byId("budget-rows");
  body.replaceChildren();
  const entries = [
    ...results,
    ...unmeasured.map((entry) => ({
      service_id: entry?.service_id,
      objective_id: entry?.objective_id ?? "none",
      state: "unmeasured",
      reasons: [entry?.reason ?? "no approved objective"],
    })),
  ];
  if (!entries.length) {
    clearTable("budget-rows", 6, "No reliability results or explicit unmeasured entries were published.");
  } else {
    for (const entry of entries.slice(0, 120)) {
      const row = document.createElement("tr");
      const service = document.createElement("td");
      service.textContent = String(entry?.service_id ?? "unknown service");
      const state = document.createElement("td");
      state.appendChild(stateBadge(entry?.state));
      const budget = document.createElement("td");
      budget.textContent = percentFromFraction(entry?.budget?.remaining_fraction);
      const fast = document.createElement("td");
      fast.textContent = numberOrNull(entry?.burn?.fast?.rate) === null ? "not measured" : `${entry.burn.fast.rate}×`;
      const slow = document.createElement("td");
      slow.textContent = numberOrNull(entry?.burn?.slow?.rate) === null ? "not measured" : `${entry.burn.slow.rate}×`;
      const evidence = document.createElement("td");
      evidence.textContent = evidenceLabel(entry, payload);
      row.append(service, state, budget, fast, slow, evidence);
      body.appendChild(row);
    }
  }

  const nonHealthyStates = new Set(EVALUATOR_STATES.filter((state) => state !== "objective_met"));
  const hasNonHealthy = entries.some((entry) => nonHealthyStates.has(evaluatorState(entry?.state)));
  const state = payload?.stale === true || payload?.policy_state !== "fresh"
    ? "stale"
    : hasNonHealthy
      ? "warning"
      : entries.length
        ? "healthy"
        : "unknown";
  setStatus(
    "reliability-status",
    state,
    `${results.length} measured result${results.length === 1 ? "" : "s"}; ${unmeasured.length} explicitly unmeasured; evaluation ${report?.evaluated_at ? ageLabel(report.evaluated_at) : "time unavailable"}.`,
  );
}

function firstDefined(...values) {
  return values.find((value) => value !== undefined && value !== null);
}

function renderDora(payload) {
  const frequency = payload?.deploymentFrequency ?? payload?.deployment_frequency ?? {};
  const cfr = payload?.changeFailureRate ?? payload?.change_failure_rate ?? {};
  const mttr = payload?.meanTimeToRecovery ?? payload?.mean_time_to_recovery ?? {};

  const perWeek = numberOrNull(firstDefined(frequency?.perWeek, frequency?.per_week));
  setText("dora-frequency", perWeek === null ? "not computable" : perWeek.toFixed(2));
  setText("dora-frequency-basis", `${firstDefined(frequency?.totalInWindow, frequency?.total_in_window, 0)} deploys in window.`);

  const rate = numberOrNull(cfr?.rate);
  setText("dora-cfr", rate === null ? "not computable" : `${Math.round(rate * 100)}%`);
  setText(
    "dora-cfr-basis",
    rate === null
      ? String(cfr?.note ?? "Insufficient correlation evidence.")
      : `${firstDefined(cfr?.failedDeploys, cfr?.failed_deploys, 0)} of ${firstDefined(cfr?.totalDeploys, cfr?.total_deploys, 0)} deploys; ${firstDefined(cfr?.correlationWindowMinutes, cfr?.correlation_window_minutes, "unknown")} minute correlation window.`,
  );

  const minutes = numberOrNull(firstDefined(mttr?.minutes, mttr?.meanMinutes, mttr?.mean_minutes, mttr?.value));
  setText("dora-mttr", minutes === null ? "not computable" : `${Math.round(minutes)} min`);
  setText("dora-mttr-basis", String(mttr?.note ?? `${firstDefined(mttr?.recoveries, mttr?.sample_count, 0)} measured recoveries.`));

  const degraded = payload?.degraded === true || payload?.data_quality === "degraded";
  const windowText = firstDefined(payload?.window?.label, payload?.windowLabel, payload?.window_label, payload?.window?.start && payload?.window?.end ? `${payload.window.start} to ${payload.window.end}` : null);
  setText("dora-window", `${windowText ?? "Window metadata unavailable"}; generated ${payload?.generatedAt || payload?.generated_at ? ageLabel(payload.generatedAt ?? payload.generated_at) : "time unavailable"}.`);
  setStatus("dora-status", degraded ? "warning" : "healthy", degraded ? "Delivery metrics are published with degraded-data handling." : "Delivery metrics loaded from the bounded public event stream.");
}

function chaosReport(payload) {
  return payload?.report ?? payload ?? {};
}

function renderChaos(payload) {
  const report = chaosReport(payload);
  const experiments = Array.isArray(report?.experiments) ? report.experiments : [];
  const list = byId("chaos-list");
  list.replaceChildren();
  if (!experiments.length) {
    const item = document.createElement("li");
    const title = document.createElement("strong");
    const detail = document.createElement("span");
    title.textContent = "No chaos experiments were published in the latest report.";
    detail.textContent = "Empty evidence does not prove recovery behaviour.";
    item.append(title, detail);
    list.appendChild(item);
    setStatus("chaos-status", "warning", "Latest chaos report is empty or unavailable.");
    return;
  }

  for (const experiment of experiments.slice(0, 12)) {
    const item = document.createElement("li");
    const title = document.createElement("strong");
    const detail = document.createElement("p");
    const meta = document.createElement("span");
    title.textContent = String(experiment?.experiment_id ?? "unnamed experiment");
    detail.textContent = `${experiment?.fault ?? "unknown fault"} on ${experiment?.target ?? "unknown target"}; ${experiment?.passed ? "passed" : "failed"}.`;
    meta.textContent = `${experiment?.mode ?? "unknown mode"} evidence · detect ≤ ${experiment?.expectations?.detect_within_seconds ?? "unknown"}s · recover ≤ ${experiment?.expectations?.recover_within_seconds ?? "unknown"}s`;
    item.append(title, detail, meta);
    list.appendChild(item);
  }
  const liveCount = experiments.filter((experiment) => experiment?.mode === "live").length;
  const failed = experiments.filter((experiment) => experiment?.passed !== true).length;
  setStatus(
    "chaos-status",
    failed ? "failure" : "healthy",
    `${experiments.length} experiment${experiments.length === 1 ? "" : "s"}; ${liveCount} live and ${experiments.length - liveCount} simulated; report ${report?.generated_at ? ageLabel(report.generated_at) : "time unavailable"}.`,
  );
}

function renderUnavailable(kind, error) {
  const message = `${kind} unavailable: ${error instanceof Error ? error.message : String(error)}`;
  if (kind === "Reliability evaluation") {
    setStatus("reliability-status", "failure", message);
    setText("measured-count", "unavailable");
    setText("risk-count", "unavailable");
    clearTable("budget-rows", 6, message);
  } else if (kind === "Objective policy") {
    setStatus("objectives-status", "failure", message);
    setText("objective-count", "unavailable");
    setText("unmeasured-count", "unavailable");
    clearTable("objective-rows", 5, message);
  } else if (kind === "DORA metrics") {
    setStatus("dora-status", "failure", message);
  } else if (kind === "Chaos evidence") {
    setStatus("chaos-status", "failure", message);
  }
}

async function load() {
  const [reliability, objectives, dora, chaos] = await Promise.allSettled([
    fetchJson(ENDPOINTS.reliability),
    fetchJson(ENDPOINTS.objectives),
    fetchJson(ENDPOINTS.dora),
    fetchJson(ENDPOINTS.chaos),
  ]);

  if (objectives.status === "fulfilled") renderObjectives(objectives.value);
  else renderUnavailable("Objective policy", objectives.reason);

  if (reliability.status === "fulfilled") renderReliability(reliability.value);
  else renderUnavailable("Reliability evaluation", reliability.reason);

  if (dora.status === "fulfilled") renderDora(dora.value);
  else renderUnavailable("DORA metrics", dora.reason);

  if (chaos.status === "fulfilled") renderChaos(chaos.value);
  else renderUnavailable("Chaos evidence", chaos.reason);
}

load();
