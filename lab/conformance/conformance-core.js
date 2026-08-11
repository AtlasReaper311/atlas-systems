const ENDPOINT = "https://api.atlas-systems.uk/v1/evidence/conformance";
const EM_DASH = "—";
/** Hard abort for hung public conformance evidence fetches. */
const HARD_ABORT_MS = 4500;

const reportElements = {
  score: document.querySelector("#estate-score"),
  repos: document.querySelector("#repo-count"),
  generated: document.querySelector("#generated-at"),
  errors: document.querySelector("#error-count"),
  warnings: document.querySelector("#warning-count"),
  unknown: document.querySelector("#unknown-count"),
  status: document.querySelector("#evidence-status"),
  repoTable: document.querySelector("#repo-table"),
  findingTable: document.querySelector("#finding-table"),
  rules: document.querySelector("#rule-grid"),
  filter: document.querySelector("#repo-filter"),
};

const evidenceSurfaces = [
  document.querySelector("#conformance-summary-surface"),
  document.querySelector("#conformance-repository-surface"),
  document.querySelector("#conformance-rule-surface"),
  document.querySelector("#conformance-finding-surface"),
  document.querySelector("#conformance-provenance-surface"),
].filter(Boolean);

const evidenceValues = [
  reportElements.score,
  reportElements.repos,
  reportElements.generated,
  reportElements.errors,
  reportElements.warnings,
  reportElements.unknown,
].filter(Boolean);

const missingElements = [];
if (!reportElements.filter) missingElements.push("repo-filter");
if (missingElements.length) {
  if (reportElements.status) {
    reportElements.status.dataset.interfaceState = "partial";
    reportElements.status.dataset.interfaceMissing = missingElements.join(",");
  }
  console.warn(
    "[lab/conformance] optional interface elements unavailable; continuing with partial rendering",
    { missing: missingElements },
  );
}

let report = null;
let evidenceMode = "unknown";

function relativeTime(value) {
  if (!value) return EM_DASH;
  const seconds = Math.round((Date.now() - Date.parse(value)) / 1000);
  if (Math.abs(seconds) < 60) return `${seconds}s ago`;
  if (Math.abs(seconds) < 3600) return `${Math.round(seconds / 60)}m ago`;
  if (Math.abs(seconds) < 86400) return `${Math.round(seconds / 3600)}h ago`;
  return `${Math.round(seconds / 86400)}d ago`;
}

function fallbackReport() {
  return {
    schema: "atlas-estate-conformance-report/v1",
    generated_at: null,
    policy_version: "not published",
    source: { repository: "AtlasReaper311/atlas-infra", commit: "unavailable" },
    summary: {
      repositories_scanned: null,
      repositories_scored: null,
      estate_score: null,
      errors: null,
      warnings: null,
      unknown: null,
      passing: null,
    },
    rules: [],
    repositories: [],
    findings: [],
    fingerprint: "not available",
  };
}

function statusClass(value) {
  return `status-${value || "unknown"}`;
}

function setText(element, value) {
  if (element) element.textContent = value;
}

function setTextById(id, value) {
  setText(document.querySelector(id), value);
}

function addClass(element, value) {
  if (!element) return;
  if (element.classList?.add) {
    element.classList.add(value);
    return;
  }
  const classes = new Set(String(element.className || "").split(/\s+/).filter(Boolean));
  classes.add(value);
  element.className = [...classes].join(" ");
}

function applyEvidenceMode(mode) {
  evidenceMode = mode;
  for (const surface of evidenceSurfaces) {
    addClass(surface, "atlas-evidence-surface");
    surface.dataset.evidenceMode = mode;
  }
  for (const value of evidenceValues) {
    addClass(value, "atlas-evidence-value");
    value.dataset.evidenceMode = mode;
  }
  if (reportElements.status) {
    addClass(reportElements.status, "atlas-evidence-mode");
    reportElements.status.dataset.evidenceMode = mode;
  }
}

function displayCount(value) {
  return value === null || value === undefined ? EM_DASH : String(value);
}

function renderSummary() {
  const summary = report.summary;
  setText(reportElements.score, summary.estate_score === null ? "unscored" : summary.estate_score.toFixed(1));
  setText(reportElements.repos, displayCount(summary.repositories_scanned));
  setText(reportElements.generated, relativeTime(report.generated_at));
  setText(reportElements.errors, displayCount(summary.errors));
  setText(reportElements.warnings, displayCount(summary.warnings));
  setText(reportElements.unknown, displayCount(summary.unknown));
  setTextById("#policy-version", report.policy_version);
  setTextById("#source-repository", report.source?.repository || EM_DASH);
  setTextById("#source-commit", report.source?.commit || EM_DASH);
  setTextById("#fingerprint", report.fingerprint || EM_DASH);
}

function renderRepositories() {
  if (!reportElements.repoTable) return;
  reportElements.repoTable.innerHTML = "";
  if (evidenceMode !== "measured") {
    reportElements.repoTable.innerHTML = '<tr><td colspan="6">Repository evidence is unavailable. No zero-value result has been inferred.</td></tr>';
    return;
  }
  const query = (reportElements.filter?.value || "").trim().toLowerCase();
  const repositories = (report.repositories || []).filter((item) =>
    `${item.repository} ${item.status}`.toLowerCase().includes(query),
  );
  if (!repositories.length) {
    reportElements.repoTable.innerHTML = '<tr><td colspan="6">No repository rows match the current measured evidence.</td></tr>';
    return;
  }
  repositories
    .sort((left, right) => {
      if (left.score === null) return 1;
      if (right.score === null) return -1;
      return left.score - right.score || left.repository.localeCompare(right.repository);
    })
    .forEach((repository) => {
      const errors = repository.findings.filter((item) => item.severity === "error").length;
      const warnings = repository.findings.filter((item) => item.severity === "warning").length;
      const applicable = repository.rules.filter((item) => item.applicable).length;
      const row = document.createElement("tr");
      row.innerHTML = `
        <td><code>${repository.repository}</code></td>
        <td class="score">${repository.score === null ? "unscored" : repository.score.toFixed(1)}</td>
        <td class="${statusClass(repository.status)}">${repository.status}</td>
        <td>${errors}</td>
        <td>${warnings}</td>
        <td>${applicable}</td>`;
      reportElements.repoTable.appendChild(row);
    });
}

function renderRules() {
  if (!reportElements.rules) return;
  reportElements.rules.innerHTML = "";
  if (evidenceMode !== "measured") {
    reportElements.rules.innerHTML = '<p class="note">The public rule catalogue is unavailable with this evidence request.</p>';
    return;
  }
  if (!report.rules.length) {
    reportElements.rules.innerHTML = '<p class="note">No public rule catalogue has been published yet.</p>';
    return;
  }
  report.rules.forEach((rule) => {
    const article = document.createElement("article");
    article.className = "panel rule-card";
    article.innerHTML = `
      <header><code>${rule.id}</code><span class="weight">weight ${rule.weight}</span></header>
      <p>${rule.description || "No description."}</p>
      <span class="note">default severity: ${rule.severity}</span>`;
    reportElements.rules.appendChild(article);
  });
}

function renderFindings() {
  if (!reportElements.findingTable) return;
  reportElements.findingTable.innerHTML = "";
  if (evidenceMode !== "measured") {
    reportElements.findingTable.innerHTML = '<tr><td colspan="5">Finding evidence is unavailable. No clean result has been inferred.</td></tr>';
    return;
  }
  if (!report.findings.length) {
    reportElements.findingTable.innerHTML = '<tr><td colspan="5">No findings in the latest measured report.</td></tr>';
    return;
  }
  report.findings.forEach((finding) => {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td class="severity-${finding.severity}">${finding.severity}</td>
      <td><code>${finding.repo}</code></td>
      <td><code>${finding.rule}</code></td>
      <td><code>${finding.path || EM_DASH}</code></td>
      <td>${finding.message}</td>`;
    reportElements.findingTable.appendChild(row);
  });
}

async function load() {
  const controller = typeof AbortController === "function" ? new AbortController() : null;
  const hardTimer = controller
    ? setTimeout(() => controller.abort(), HARD_ABORT_MS)
    : null;

  applyEvidenceMode("unknown");
  if (reportElements.status) {
    delete reportElements.status.dataset.errorSource;
    delete reportElements.status.dataset.errorContext;
    reportElements.status.dataset.runtimeState = "checking";
    reportElements.status.dataset.state = "unknown";
    reportElements.status.textContent = "Probing live";
    reportElements.status.title =
      "Checking the public conformance API. No measured estate score is shown yet.";
  }

  try {
    const response = await fetch(ENDPOINT, {
      cache: "no-store",
      signal: controller?.signal,
    });
    if (!response.ok) throw new Error(`evidence endpoint returned ${response.status}`);
    const payload = await response.json();
    report = payload.report;
    applyEvidenceMode("measured");
    if (reportElements.status) {
      delete reportElements.status.dataset.errorSource;
      delete reportElements.status.dataset.errorContext;
      reportElements.status.textContent = "Measured";
      reportElements.status.title = "Current weekly evidence from the public conformance API.";
      reportElements.status.dataset.runtimeState = report.summary.errors ? "error" : report.summary.warnings ? "warning" : "pass";
      reportElements.status.dataset.state = report.summary.errors ? "error" : report.summary.warnings ? "warning" : "pass";
    }
  } catch (error) {
    applyEvidenceMode("unavailable");
    if (reportElements.status) {
      reportElements.status.dataset.errorSource = "conformance-evidence";
      reportElements.status.dataset.errorContext = "live-load";
      reportElements.status.textContent = "Unavailable";
      reportElements.status.title = "The public conformance API did not provide evidence.";
      reportElements.status.dataset.runtimeState = "unknown";
      reportElements.status.dataset.state = "unknown";
    }
    console.warn(
      "[lab/conformance] live evidence load failed; rendering an unavailable evidence state",
      error,
    );
    report = fallbackReport();
  } finally {
    if (hardTimer) clearTimeout(hardTimer);
  }
  renderSummary();
  renderRepositories();
  renderRules();
  renderFindings();
}

reportElements.filter?.addEventListener("input", renderRepositories);
void load();
