const ENDPOINT = "https://api.atlas-systems.uk/v1/evidence/chaos";
const HISTORY_ENDPOINT = `${ENDPOINT}?history=1`;
const LIVE_CANARY_URL =
  "/lab/reliability/evidence/specular-route-503-live-2026-07-15.json";

function relativeTime(value) {
  if (!value) return "-";
  const seconds = Math.round((Date.now() - Date.parse(value)) / 1000);
  if (Math.abs(seconds) < 60) return `${seconds}s ago`;
  if (Math.abs(seconds) < 3600) return `${Math.round(seconds / 60)}m ago`;
  if (Math.abs(seconds) < 86400) return `${Math.round(seconds / 3600)}h ago`;
  return `${Math.round(seconds / 86400)}d ago`;
}

function stageLatency(stage) {
  if (!stage) return "not run";
  if (!stage.ok) return "failed";
  if (stage.latency_ms === null || stage.latency_ms === undefined) return "pass";
  return `${stage.latency_ms} ms`;
}

function fallback() {
  return {
    schema: "atlas-chaos-report-set/v1",
    generated_at: null,
    passed: false,
    summary: { experiments: 0, passed: 0, failed: 0 },
    experiments: [],
    fingerprint: "not available",
  };
}

function sourceRunUrl(experiment) {
  const value = String(experiment?.source?.run_url || "");
  return /^https:\/\/github\.com\/AtlasReaper311\/atlas-infra\/actions\/runs\/\d+$/.test(
    value,
  )
    ? value
    : "";
}

function experimentCard(experiment, context) {
  const stages = experiment.stages || {};
  const article = document.createElement("article");
  const runUrl = sourceRunUrl(experiment);
  article.className = "panel experiment";
  article.innerHTML = `
    <div class="experiment-head">
      <div>
        <span class="experiment-context">${context}</span>
        <code>${experiment.experiment_id}</code>
        <p class="note">${experiment.fault} on ${experiment.target} · ${experiment.mode}</p>
      </div>
      <span class="verdict ${experiment.passed ? "pass" : "fail"}">${experiment.passed ? "pass" : "fail"}</span>
    </div>
    <div class="stage-grid">
      <div class="stage"><span>injection</span><strong>${stageLatency(stages.injection)}</strong></div>
      <div class="stage"><span>detection</span><strong>${stageLatency(stages.detection)}</strong></div>
      <div class="stage"><span>notification</span><strong>${stageLatency(stages.notification)}</strong></div>
      <div class="stage"><span>recovery</span><strong>${stageLatency(stages.recovery)}</strong></div>
    </div>
    <p class="note">detect ≤ ${experiment.expectations.detect_within_seconds}s · recover ≤ ${experiment.expectations.recover_within_seconds}s · fingerprint ${experiment.fingerprint.slice(0, 12)}</p>`;
  if (runUrl) {
    const source = document.createElement("a");
    source.className = "experiment-source";
    source.href = runUrl;
    source.target = "_blank";
    source.rel = "noopener noreferrer";
    source.textContent = "open source run →";
    article.appendChild(source);
  }
  return article;
}

function renderExperiments(grid, experiments, context, emptyMessage) {
  grid.replaceChildren();
  if (!experiments.length) {
    const empty = document.createElement("p");
    empty.className = "note";
    empty.textContent = emptyMessage;
    grid.appendChild(empty);
    return;
  }
  for (const experiment of experiments) {
    grid.appendChild(experimentCard(experiment, context));
  }
}

function renderLatest(report) {
  const verdict = document.querySelector("#latest-verdict");
  verdict.textContent = report.summary.experiments === 0 ? "unproven" : report.passed ? "pass" : "fail";
  verdict.className = report.summary.experiments === 0 ? "" : report.passed ? "status-pass" : "status-error";
  document.querySelector("#experiment-count").textContent = String(report.summary.experiments);
  document.querySelector("#generated-at").textContent = relativeTime(report.generated_at);
  const grid = document.querySelector("#experiment-grid");
  renderExperiments(
    grid,
    report.experiments,
    report.experiments?.[0]?.mode === "live" ? "current live report" : "latest simulation",
    "No chaos evidence has been published yet. Scheduled simulation will populate this page after the evidence secret is configured.",
  );
  const first = report.experiments[0];
  document.querySelector("#report-mode").textContent = first?.mode || "-";
  document.querySelector("#source-repository").textContent = first?.source?.repository || "-";
  document.querySelector("#source-commit").textContent = first?.source?.commit || "-";
  document.querySelector("#fingerprint").textContent = report.fingerprint || "-";
}

function renderLiveCanary(report, history) {
  if (
    report.schema !== "atlas-chaos-report-set/v1" ||
    !report.experiments?.length ||
    report.experiments.some((experiment) => experiment.mode !== "live")
  ) {
    throw new Error("archived canary is not a live chaos report");
  }
  const inPublicHistory = history.items?.some(
    (item) => item.fingerprint === report.fingerprint,
  );
  if (!inPublicHistory) {
    throw new Error("archived canary is absent from public evidence history");
  }

  const status = document.querySelector("#live-evidence-status");
  status.textContent = `verified in public history · ${relativeTime(report.generated_at)}`;
  status.dataset.state = report.passed ? "pass" : "error";
  renderExperiments(
    document.querySelector("#live-experiment-grid"),
    report.experiments,
    "bounded production canary",
    "No verified live canary is available.",
  );
}

function renderLiveUnavailable() {
  const status = document.querySelector("#live-evidence-status");
  status.textContent = "live canary verification unavailable";
  status.dataset.state = "warning";
  renderExperiments(
    document.querySelector("#live-experiment-grid"),
    [],
    "",
    "The archived live canary could not be matched to the public evidence history, so it is not displayed.",
  );
}

async function getJson(url) {
  const response = await fetch(url, {
    headers: { Accept: "application/json" },
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`evidence endpoint returned ${response.status}`);
  return response.json();
}

async function load() {
  const status = document.querySelector("#evidence-status");
  let report;
  try {
    report = (await getJson(ENDPOINT)).report;
    status.textContent = report.experiments?.[0]?.mode === "live" ? "live experiment evidence" : "simulation evidence";
    status.dataset.state = report.passed ? "pass" : "error";
  } catch (error) {
    console.error(error);
    report = fallback();
    status.textContent = "no report published yet";
    status.dataset.state = "warning";
  }
  renderLatest(report);

  try {
    const [history, liveCanary] = await Promise.all([
      getJson(HISTORY_ENDPOINT),
      getJson(LIVE_CANARY_URL),
    ]);
    renderLiveCanary(liveCanary, history);
  } catch (error) {
    console.error(error);
    renderLiveUnavailable();
  }
}

load();
