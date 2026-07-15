const ENDPOINT = "https://api.atlas-systems.uk/v1/evidence/conformance";

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

let report = null;

function relativeTime(value) {
  if (!value) return "-";
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
      repositories_scanned: 0,
      repositories_scored: 0,
      estate_score: null,
      errors: 0,
      warnings: 0,
      unknown: 0,
      passing: 0,
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

function renderSummary() {
  const summary = report.summary;
  reportElements.score.textContent = summary.estate_score === null ? "unscored" : summary.estate_score.toFixed(1);
  reportElements.repos.textContent = String(summary.repositories_scanned);
  reportElements.generated.textContent = relativeTime(report.generated_at);
  reportElements.errors.textContent = String(summary.errors);
  reportElements.warnings.textContent = String(summary.warnings);
  reportElements.unknown.textContent = String(summary.unknown);
  document.querySelector("#policy-version").textContent = report.policy_version;
  document.querySelector("#source-repository").textContent = report.source?.repository || "-";
  document.querySelector("#source-commit").textContent = report.source?.commit || "-";
  document.querySelector("#fingerprint").textContent = report.fingerprint || "-";
}

function renderRepositories() {
  const query = reportElements.filter.value.trim().toLowerCase();
  const repositories = (report.repositories || []).filter((item) =>
    `${item.repository} ${item.status}`.toLowerCase().includes(query),
  );
  reportElements.repoTable.innerHTML = "";
  if (!repositories.length) {
    reportElements.repoTable.innerHTML = '<tr><td colspan="6">No repository rows match the current evidence.</td></tr>';
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
        <td class="score">${repository.score === null ? "unknown" : repository.score.toFixed(1)}</td>
        <td class="${statusClass(repository.status)}">${repository.status}</td>
        <td>${errors}</td>
        <td>${warnings}</td>
        <td>${applicable}</td>`;
      reportElements.repoTable.appendChild(row);
    });
}

function renderRules() {
  reportElements.rules.innerHTML = "";
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
  reportElements.findingTable.innerHTML = "";
  if (!report.findings.length) {
    reportElements.findingTable.innerHTML = '<tr><td colspan="5">No findings in the latest report.</td></tr>';
    return;
  }
  report.findings.forEach((finding) => {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td class="severity-${finding.severity}">${finding.severity}</td>
      <td><code>${finding.repo}</code></td>
      <td><code>${finding.rule}</code></td>
      <td><code>${finding.path || "-"}</code></td>
      <td>${finding.message}</td>`;
    reportElements.findingTable.appendChild(row);
  });
}

async function load() {
  try {
    const response = await fetch(ENDPOINT, { cache: "no-store" });
    if (!response.ok) throw new Error(`evidence endpoint returned ${response.status}`);
    const payload = await response.json();
    report = payload.report;
    reportElements.status.textContent = "live weekly evidence";
    reportElements.status.dataset.state = report.summary.errors ? "error" : report.summary.warnings ? "warning" : "pass";
  } catch (error) {
    console.error(error);
    report = fallbackReport();
    reportElements.status.textContent = "no report published yet";
    reportElements.status.dataset.state = "warning";
  }
  renderSummary();
  renderRepositories();
  renderRules();
  renderFindings();
}

reportElements.filter.addEventListener("input", renderRepositories);
load();
