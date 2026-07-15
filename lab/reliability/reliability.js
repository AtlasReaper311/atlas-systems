const ENDPOINT = "https://api.atlas-systems.uk/v1/evidence/chaos";

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

function render(report) {
  const verdict = document.querySelector("#latest-verdict");
  verdict.textContent = report.summary.experiments === 0 ? "unproven" : report.passed ? "pass" : "fail";
  verdict.className = report.summary.experiments === 0 ? "" : report.passed ? "status-pass" : "status-error";
  document.querySelector("#experiment-count").textContent = String(report.summary.experiments);
  document.querySelector("#generated-at").textContent = relativeTime(report.generated_at);
  const grid = document.querySelector("#experiment-grid");
  grid.innerHTML = "";
  if (!report.experiments.length) {
    grid.innerHTML = '<p class="note">No chaos evidence has been published yet. Scheduled simulation will populate this page after the evidence secret is configured.</p>';
  }
  report.experiments.forEach((experiment) => {
    const stages = experiment.stages || {};
    const article = document.createElement("article");
    article.className = "panel experiment";
    article.innerHTML = `
      <div class="experiment-head">
        <div><code>${experiment.experiment_id}</code><p class="note">${experiment.fault} on ${experiment.target} · ${experiment.mode}</p></div>
        <span class="verdict ${experiment.passed ? "pass" : "fail"}">${experiment.passed ? "pass" : "fail"}</span>
      </div>
      <div class="stage-grid">
        <div class="stage"><span>injection</span><strong>${stageLatency(stages.injection)}</strong></div>
        <div class="stage"><span>detection</span><strong>${stageLatency(stages.detection)}</strong></div>
        <div class="stage"><span>notification</span><strong>${stageLatency(stages.notification)}</strong></div>
        <div class="stage"><span>recovery</span><strong>${stageLatency(stages.recovery)}</strong></div>
      </div>
      <p class="note">detect ≤ ${experiment.expectations.detect_within_seconds}s · recover ≤ ${experiment.expectations.recover_within_seconds}s · fingerprint ${experiment.fingerprint.slice(0, 12)}</p>`;
    grid.appendChild(article);
  });
  const first = report.experiments[0];
  document.querySelector("#report-mode").textContent = first?.mode || "-";
  document.querySelector("#source-repository").textContent = first?.source?.repository || "-";
  document.querySelector("#source-commit").textContent = first?.source?.commit || "-";
  document.querySelector("#fingerprint").textContent = report.fingerprint || "-";
}

async function load() {
  const status = document.querySelector("#evidence-status");
  let report;
  try {
    const response = await fetch(ENDPOINT, { cache: "no-store" });
    if (!response.ok) throw new Error(`evidence endpoint returned ${response.status}`);
    report = (await response.json()).report;
    status.textContent = report.experiments?.[0]?.mode === "live" ? "live experiment evidence" : "simulation evidence";
    status.dataset.state = report.passed ? "pass" : "error";
  } catch (error) {
    console.error(error);
    report = fallback();
    status.textContent = "no report published yet";
    status.dataset.state = "warning";
  }
  render(report);
}

load();
