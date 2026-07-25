const ENDPOINTS = Object.freeze({
  activity: "https://api.atlas-systems.uk/pulse/heatmap",
  deployment: "https://api.atlas-systems.uk/deploy-watch/latest",
  pipeline: "https://api.atlas-systems.uk/notify/recent",
  reports: "https://api.atlas-systems.uk/v1/evidence",
});

const FETCH_TIMEOUT_MS = 6000;
const STALE_AFTER_MS = 24 * 60 * 60 * 1000;
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

function parsedTime(value) {
  const parsed = Date.parse(value ?? "");
  return Number.isFinite(parsed) ? parsed : null;
}

function ageLabel(value) {
  const parsed = parsedTime(value);
  if (parsed === null) return "timestamp unavailable";
  const seconds = Math.max(0, Math.round((Date.now() - parsed) / 1000));
  if (seconds < 60) return `${seconds}s old`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m old`;
  if (seconds < 86400) return `${Math.round(seconds / 3600)}h old`;
  return `${Math.round(seconds / 86400)}d old`;
}

function sourceState(value, explicitStale = false) {
  const parsed = parsedTime(value);
  if (explicitStale || parsed === null || Date.now() - parsed > STALE_AFTER_MS) return "stale";
  return "healthy";
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

function clearTable(id, colspan, message) {
  const body = byId(id);
  body.replaceChildren();
  const row = document.createElement("tr");
  const cell = document.createElement("td");
  cell.colSpan = colspan;
  cell.textContent = message;
  row.appendChild(cell);
  body.appendChild(row);
}

function heatmapDays(payload) {
  const days = payload?.days;
  if (!days || typeof days !== "object" || Array.isArray(days)) return [];
  return Object.entries(days)
    .filter(([date, count]) => /^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isFinite(Number(count)))
    .map(([date, count]) => ({ date, count: Math.max(0, Math.trunc(Number(count))) }))
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-90);
}

function activityLevel(count) {
  if (count <= 0) return 0;
  if (count === 1) return 1;
  if (count === 2) return 2;
  if (count <= 4) return 3;
  return 4;
}

function renderActivity(payload) {
  const days = heatmapDays(payload);
  const heatmap = byId("activity-heatmap");
  const rows = byId("activity-rows");
  heatmap.replaceChildren();
  rows.replaceChildren();

  if (!days.length) {
    clearTable("activity-rows", 3, "The activity source returned no valid day records.");
    setText("summary-commits", "0");
    setStatus("activity-status", "warning", "Activity evidence is empty. Empty does not prove inactivity.");
    setText("source-activity", "empty response; source timestamp unavailable");
    return "empty";
  }

  for (const day of days) {
    const cell = document.createElement("button");
    cell.type = "button";
    cell.dataset.level = String(activityLevel(day.count));
    cell.tabIndex = -1;
    cell.title = `${day.date}: ${day.count} commit${day.count === 1 ? "" : "s"}`;
    cell.setAttribute("aria-hidden", "true");
    heatmap.appendChild(cell);

    const row = document.createElement("tr");
    const date = document.createElement("td");
    const count = document.createElement("td");
    const state = document.createElement("td");
    date.textContent = day.date;
    count.textContent = String(day.count);
    state.textContent = day.count ? "recorded activity" : "recorded zero";
    row.append(date, count, state);
    rows.appendChild(row);
  }

  const total = Number(payload?.totals?.commitsLast90Days);
  const computed = days.reduce((sum, day) => sum + day.count, 0);
  setText("summary-commits", Number.isFinite(total) ? total : computed);
  const generatedAt = payload?.generated_at ?? payload?.generatedAt ?? payload?.fetched_at ?? null;
  const state = sourceState(generatedAt, payload?.stale === true);
  setStatus("activity-status", state, `${days.length} daily records rendered; source ${ageLabel(generatedAt)}.`);
  setText("source-activity", `${state}; ${ageLabel(generatedAt)}; ${days.length} daily records`);
  return state;
}

function deploymentTimestamp(payload) {
  return payload?.observedAt ?? payload?.observed_at ?? payload?.timestamp ?? payload?.created_on ?? payload?.generated_at ?? null;
}

function deploymentOutcome(payload) {
  return String(payload?.status ?? payload?.outcome ?? payload?.deployment?.status ?? "unknown").toLowerCase();
}

function renderDeployment(payload) {
  const outcome = deploymentOutcome(payload);
  const timestamp = deploymentTimestamp(payload);
  const state = ["success", "succeeded", "active", "ready"].includes(outcome)
    ? sourceState(timestamp, payload?.stale === true)
    : ["failure", "failed", "error", "cancelled"].includes(outcome)
      ? "failure"
      : "unknown";
  setText("summary-deployment", outcome);
  setText("deploy-outcome", outcome);
  setText("deploy-repository", payload?.repository ?? payload?.repo ?? payload?.source?.repository ?? "not supplied");
  setText("deploy-commit", payload?.commitSha ?? payload?.commit_sha ?? payload?.commit ?? "not supplied");
  setText("deploy-id", payload?.deployId ?? payload?.deployment_id ?? payload?.id ?? "not supplied");
  setText("deploy-time", timestamp ? `${timestamp} (${ageLabel(timestamp)})` : "timestamp unavailable");
  setStatus("deployment-status", state, `Latest bounded deployment outcome: ${outcome}; ${ageLabel(timestamp)}.`);
  setText("source-deployment", `${state}; ${ageLabel(timestamp)}; deploy-watch latest record`);
  return state;
}

function eventsOf(payload) {
  for (const candidate of [payload?.events, payload?.items, payload?.recent, payload?.data?.events]) {
    if (Array.isArray(candidate)) return candidate;
  }
  return [];
}

function eventTime(event) {
  return event?.ts ?? event?.timestamp ?? event?.created_at ?? event?.generated_at ?? null;
}

function isPipelineEvent(event) {
  const haystack = [event?.signal_class, event?.dialect, event?.event, event?.source, event?.title]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return /(cicd|ci\/cd|pipeline|deploy|github|pages|workflow|build)/.test(haystack);
}

function eventState(event) {
  const raw = String(event?.level ?? event?.status ?? "unknown").toLowerCase();
  if (["success", "passed", "ok"].includes(raw)) return "healthy";
  if (["warning", "degraded", "stale"].includes(raw)) return "warning";
  if (["failure", "failed", "error", "critical"].includes(raw)) return "failure";
  return "unknown";
}

function renderPipeline(payload) {
  const allEvents = eventsOf(payload);
  const events = allEvents.filter(isPipelineEvent).slice(0, 20);
  const list = byId("pipeline-list");
  list.replaceChildren();
  setText("summary-events", events.length);

  if (!events.length) {
    const item = document.createElement("li");
    const title = document.createElement("strong");
    const detail = document.createElement("span");
    title.textContent = "No pipeline-class events were present in the bounded response.";
    detail.textContent = allEvents.length ? "Other event classes were excluded." : "Empty evidence is not a successful pipeline.";
    item.append(title, detail);
    list.appendChild(item);
    setStatus("pipeline-status", "warning", `${allEvents.length} total events inspected; zero pipeline events.`);
    setText("source-pipeline", `empty pipeline subset; ${allEvents.length} total events inspected`);
    return "empty";
  }

  for (const event of events) {
    const item = document.createElement("li");
    const title = document.createElement("strong");
    const detail = document.createElement("p");
    const meta = document.createElement("span");
    title.textContent = String(event?.title ?? event?.event ?? "Pipeline event");
    detail.textContent = String(event?.message ?? "No public event message supplied.");
    meta.textContent = `${eventState(event)} · ${String(event?.source ?? event?.dialect ?? "public event stream")} · ${ageLabel(eventTime(event))}`;
    item.append(title, detail, meta);
    list.appendChild(item);
  }

  const failures = events.filter((event) => eventState(event) === "failure").length;
  const newest = events.map(eventTime).filter(Boolean).sort().at(-1) ?? null;
  const state = failures ? "failure" : sourceState(newest, payload?.stale === true);
  setStatus("pipeline-status", state, `${events.length} pipeline event${events.length === 1 ? "" : "s"}; ${failures} failure-level; newest ${ageLabel(newest)}.`);
  setText("source-pipeline", `${state}; newest ${ageLabel(newest)}; fixed pipeline classification filter`);
  return state;
}

function reportEntries(payload) {
  if (Array.isArray(payload?.items)) return payload.items;
  if (Array.isArray(payload?.reports)) return payload.reports;
  if (payload?.evidence && typeof payload.evidence === "object") {
    return Object.entries(payload.evidence).map(([name, value]) => ({ name, ...value }));
  }
  return [];
}

function reportTime(report) {
  return report?.generated_at ?? report?.updated_at ?? report?.stored_at ?? report?.timestamp ?? null;
}

function reportState(report) {
  if (report?.stale === true) return "stale";
  if (report?.passed === true || report?.ok === true || report?.state === "pass") return "pass";
  if (report?.passed === false || report?.ok === false || report?.state === "fail") return "failure";
  return "unknown";
}

function renderReports(payload) {
  const reports = reportEntries(payload);
  setText("summary-reports", reports.length);
  const body = byId("report-rows");
  body.replaceChildren();
  if (!reports.length) {
    clearTable("report-rows", 4, "The public evidence index returned no assurance records.");
    setStatus("reports-status", "warning", "Evidence index is empty or uses an unsupported shape.");
    setText("source-reports", "empty response; provenance unavailable");
    return "empty";
  }

  for (const report of reports.slice(0, 40)) {
    const row = document.createElement("tr");
    const name = document.createElement("td");
    const state = document.createElement("td");
    const generated = document.createElement("td");
    const fingerprint = document.createElement("td");
    name.textContent = String(report?.name ?? report?.kind ?? report?.type ?? report?.schema ?? "unnamed report");
    state.textContent = reportState(report);
    generated.textContent = reportTime(report) ? `${reportTime(report)} (${ageLabel(reportTime(report))})` : "timestamp unavailable";
    fingerprint.textContent = String(report?.fingerprint ?? report?.sha256 ?? "not supplied");
    row.append(name, state, generated, fingerprint);
    body.appendChild(row);
  }
  const newest = reports.map(reportTime).filter(Boolean).sort().at(-1) ?? payload?.generated_at ?? null;
  const hasFailure = reports.some((report) => reportState(report) === "failure");
  const state = hasFailure ? "failure" : sourceState(newest, payload?.stale === true);
  setStatus("reports-status", state, `${reports.length} assurance record${reports.length === 1 ? "" : "s"}; newest ${ageLabel(newest)}.`);
  setText("source-reports", `${state}; newest ${ageLabel(newest)}; fingerprints rendered when supplied`);
  return state;
}

function renderUnavailable(kind, statusId, summaryId, sourceId, error) {
  const message = `${kind} unavailable: ${error instanceof Error ? error.message : String(error)}`;
  setStatus(statusId, "failure", message);
  if (summaryId) setText(summaryId, "unavailable");
  setText(sourceId, message);
}

async function load() {
  const [activity, deployment, pipeline, reports] = await Promise.allSettled([
    fetchJson(ENDPOINTS.activity),
    fetchJson(ENDPOINTS.deployment),
    fetchJson(ENDPOINTS.pipeline),
    fetchJson(ENDPOINTS.reports),
  ]);
  const states = [];

  if (activity.status === "fulfilled") states.push(renderActivity(activity.value));
  else {
    renderUnavailable("Activity evidence", "activity-status", "summary-commits", "source-activity", activity.reason);
    states.push("unavailable");
  }

  if (deployment.status === "fulfilled") states.push(renderDeployment(deployment.value));
  else {
    renderUnavailable("Deployment evidence", "deployment-status", "summary-deployment", "source-deployment", deployment.reason);
    states.push("unavailable");
  }

  if (pipeline.status === "fulfilled") states.push(renderPipeline(pipeline.value));
  else {
    renderUnavailable("Pipeline evidence", "pipeline-status", "summary-events", "source-pipeline", pipeline.reason);
    states.push("unavailable");
  }

  if (reports.status === "fulfilled") states.push(renderReports(reports.value));
  else {
    renderUnavailable("Assurance evidence", "reports-status", "summary-reports", "source-reports", reports.reason);
    states.push("unavailable");
  }

  if (states.some((state) => state === "failure")) {
    setStatus("evidence-status", "failure", "At least one public record contains failure evidence or could not be retrieved.");
  } else if (states.some((state) => ["stale", "empty", "unknown", "unavailable", "warning"].includes(state))) {
    setStatus("evidence-status", "warning", "The evidence set contains stale, empty, unknown, or unavailable records.");
  } else {
    setStatus("evidence-status", "healthy", "All four bounded evidence sources returned current records.");
  }
}

load();
