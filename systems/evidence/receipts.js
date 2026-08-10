const ENDPOINTS = Object.freeze({
  activity: "https://api.atlas-systems.uk/pulse/heatmap",
  deployment: "https://api.atlas-systems.uk/deploy-watch/latest",
  slo: "https://api.atlas-systems.uk/v1/slo",
  stats: "https://api.atlas-systems.uk/v1/stats",
});

const FETCH_TIMEOUT_MS = 6000;
const STALE_AFTER_MS = 24 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const byId = (id) => document.getElementById(id);

const COMPONENT_LABELS = Object.freeze({
  registry: "atlas-api-index",
  notify: "atlas-notify",
  specular: "SPECULAR-CORE telemetry",
  specular_edge: "specular-edge",
  corpus: "atlas-corpus",
  machine: "SPECULAR-CORE local infra",
  ramone_trigger: "ramone-trigger",
  github_pulse: "github-pulse",
  site_pulse: "site-pulse",
  deploy_watch: "deploy-watch",
  atlas_blackbox: "atlas-blackbox",
  atlas_quota_watch: "atlas-quota-watch",
  ramone_edge: "ramone-edge",
  atlas_doc_viewer: "atlas-doc-viewer",
  atlas_systems: "atlas-systems",
  status_surface: "status",
  atlas_badges: "atlas-badges",
  atlas_dep_audit: "atlas-dep-audit",
  atlas_journey_watch: "atlas-journey-watch",
});

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

function evidenceModeFromTime(value, explicitStale = false, nowMs = Date.now()) {
  const parsed = timestampMs(value);
  if (parsed === null) return "unknown";
  return explicitStale || nowMs - parsed > STALE_AFTER_MS ? "stale-measured" : "measured";
}

function evidenceLabel(mode) {
  return {
    measured: "Measured",
    "stale-measured": "Stale measured",
    unavailable: "Unavailable",
    unknown: "Unknown",
  }[mode] ?? "Unknown";
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

function utcDayKey(ms) {
  return new Date(ms).toISOString().slice(0, 10);
}

function rawDayMap(payload) {
  const input = payload?.days;
  if (!input || typeof input !== "object" || Array.isArray(input)) return new Map();
  return new Map(
    Object.entries(input)
      .filter(([date, count]) => /^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isFinite(Number(count)))
      .map(([date, count]) => [date, Math.max(0, Math.trunc(Number(count)))]),
  );
}

export function denseActivityDays(payload, nowMs = Date.now()) {
  const map = rawDayMap(payload);
  const truncated = payload?.truncated === true || (Array.isArray(payload?.truncatedRepos) && payload.truncatedRepos.length > 0);
  const today = new Date(nowMs);
  const todayUtc = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  const days = [];
  for (let offset = 89; offset >= 0; offset -= 1) {
    const date = utcDayKey(todayUtc - offset * DAY_MS);
    if (map.has(date)) {
      days.push({ date, count: map.get(date), evidenceMode: "measured" });
    } else if (truncated) {
      days.push({ date, count: null, evidenceMode: "unknown" });
    } else {
      days.push({ date, count: 0, evidenceMode: "measured" });
    }
  }
  return days;
}

function activityLevel(count) {
  if (count === null) return "unknown";
  if (count <= 0) return "0";
  if (count === 1) return "1";
  if (count === 2) return "2";
  if (count <= 4) return "3";
  return "4";
}

function ensureTooltip() {
  let tooltip = byId("activity-tooltip");
  if (tooltip) return tooltip;
  tooltip = document.createElement("div");
  tooltip.id = "activity-tooltip";
  tooltip.className = "systems-activity-tooltip";
  tooltip.hidden = true;
  document.body.appendChild(tooltip);
  return tooltip;
}

function showTooltip(tooltip, cell, event) {
  const count = cell.dataset.count === "unknown" ? null : Number(cell.dataset.count);
  tooltip.textContent = count === null
    ? `${cell.dataset.date}: daily count unavailable because the source distribution is truncated`
    : `${cell.dataset.date}: ${count} commit${count === 1 ? "" : "s"}`;
  tooltip.hidden = false;
  tooltip.style.left = `${event.clientX + 14}px`;
  tooltip.style.top = `${Math.max(8, event.clientY - 38)}px`;
}

export function activityDisclosureLabel(payload) {
  const truncated = payload?.truncated === true || (Array.isArray(payload?.truncatedRepos) && payload.truncatedRepos.length > 0);
  return truncated
    ? "Show complete 90-day evidence table, including unknown source-capped days"
    : "Show complete 90-day evidence table";
}

function ensureActivityDisclosure(payload = null) {
  const wrap = byId("activity-rows")?.closest(".focus-table-wrap");
  if (!wrap) return;
  const existing = wrap.closest(".systems-evidence-disclosure");
  if (existing) {
    const summary = existing.querySelector(":scope > summary");
    if (summary && payload) summary.textContent = activityDisclosureLabel(payload);
    return;
  }
  const details = document.createElement("details");
  details.className = "systems-evidence-disclosure";
  const summary = document.createElement("summary");
  summary.textContent = activityDisclosureLabel(payload ?? {});
  wrap.insertAdjacentElement("beforebegin", details);
  details.append(summary, wrap);
}

function renderActivity(payload) {
  const days = denseActivityDays(payload);
  const heatmap = byId("activity-heatmap");
  const rows = byId("activity-rows");
  if (!heatmap || !rows) return;
  heatmap.replaceChildren();
  rows.replaceChildren();
  const tooltip = ensureTooltip();
  const firstDate = new Date(`${days[0].date}T00:00:00Z`);
  const mondayIndex = (firstDate.getUTCDay() + 6) % 7;
  for (let index = 0; index < mondayIndex; index += 1) {
    const padding = document.createElement("span");
    padding.className = "focus-heatmap-cell systems-heatmap-padding";
    padding.setAttribute("aria-hidden", "true");
    heatmap.appendChild(padding);
  }
  for (const day of days) {
    const cell = document.createElement("span");
    cell.className = "focus-heatmap-cell systems-heatmap-cell";
    cell.dataset.level = activityLevel(day.count);
    cell.dataset.evidenceMode = day.evidenceMode;
    cell.dataset.date = day.date;
    cell.dataset.count = day.count === null ? "unknown" : String(day.count);
    cell.setAttribute("aria-hidden", "true");
    cell.addEventListener("mouseenter", (event) => showTooltip(tooltip, cell, event));
    cell.addEventListener("mousemove", (event) => showTooltip(tooltip, cell, event));
    cell.addEventListener("mouseleave", () => { tooltip.hidden = true; });
    heatmap.appendChild(cell);

    const row = document.createElement("tr");
    const date = document.createElement("td");
    const count = document.createElement("td");
    const state = document.createElement("td");
    date.textContent = day.date;
    count.textContent = day.count === null ? "—" : String(day.count);
    state.textContent = day.count === null ? "unknown because source distribution is truncated" : day.count ? "recorded activity" : "recorded zero";
    row.append(date, count, state);
    rows.appendChild(row);
  }

  ensureActivityDisclosure(payload);
  const generatedAt = payload?.generated_at ?? payload?.generatedAt ?? payload?.fetched_at ?? null;
  const truncatedRepos = Array.isArray(payload?.truncatedRepos) ? payload.truncatedRepos : [];
  const truncated = payload?.truncated === true || truncatedRepos.length > 0;
  const activeDays = days.filter((day) => Number(day.count) > 0).length;
  const sourceMode = evidenceModeFromTime(generatedAt, payload?.stale === true);
  const total = Number(payload?.totals?.commitsLast90Days);
  if (Number.isFinite(total)) byId("summary-commits").textContent = String(total);
  const status = byId("activity-status");
  if (status) {
    status.dataset.state = truncated || sourceMode === "stale-measured" ? "warning" : "healthy";
    status.textContent = truncated
      ? `90 calendar positions rendered; ${activeDays} contain recorded activity. Daily distribution is partial because ${truncatedRepos.length || "one or more"} repository histories still exceed the bounded source history; headline total remains source-reported. Source ${ageLabel(generatedAt)}.`
      : `90 calendar days rendered; ${activeDays} contain recorded activity. Source ${ageLabel(generatedAt)}.`;
  }
  const source = byId("source-activity");
  if (source) source.textContent = `${sourceMode}; ${ageLabel(generatedAt)}; 90 calendar days; ${activeDays} active day${activeDays === 1 ? "" : "s"}${truncated ? "; partial daily distribution" : ""}`;
  const note = byId("activity-note");
  if (note) note.textContent = truncated
    ? "Hover cells for per-day receipts. Expand the complete 90-day table for keyboard and screen-reader access. Unknown cells are never rendered as zero while the source reports a bounded partial distribution."
    : "Hover cells for per-day receipts. Expand the complete 90-day table for keyboard and screen-reader access; all calendar days are represented, including measured zero-commit days.";
}

export function deploymentReceipt(payload) {
  const commitUrl = typeof payload?.commitUrl === "string" ? payload.commitUrl : null;
  const repoMatch = commitUrl?.match(/^https:\/\/github\.com\/AtlasReaper311\/([^/]+)\/commit\//i);
  const created = payload?.createdOn ?? payload?.created_on ?? null;
  const ended = payload?.endedOn ?? payload?.ended_on ?? null;
  const checked = payload?.checkedAt ?? payload?.checked_at ?? payload?.observed_at ?? null;
  const startedMs = timestampMs(created);
  const endedMs = timestampMs(ended);
  const duration = startedMs !== null && endedMs !== null && endedMs >= startedMs
    ? Math.round((endedMs - startedMs) / 1000)
    : null;
  return {
    outcome: String(payload?.status ?? "unknown").toLowerCase(),
    repository: payload?.repository ?? payload?.repo ?? repoMatch?.[1] ?? "not supplied",
    branch: payload?.branch ?? "not supplied",
    commit: payload?.commitSha ?? payload?.commit_sha ?? "not supplied",
    commitUrl,
    deployId: payload?.deployId ?? payload?.deployment_id ?? payload?.id ?? "not supplied",
    created,
    ended,
    checked,
    duration,
  };
}

function setText(id, value) {
  const node = byId(id);
  if (node) node.textContent = String(value ?? "—");
}

function renderDeployment(payload) {
  const receipt = deploymentReceipt(payload);
  const evidenceAt = receipt.checked ?? receipt.ended ?? receipt.created;
  const mode = evidenceModeFromTime(evidenceAt, payload?.stale === true);
  setText("summary-deployment", receipt.outcome);
  setText("deploy-outcome", receipt.outcome);
  setText("deploy-repository", receipt.repository);
  setText("deploy-branch", receipt.branch);
  setText("deploy-commit", receipt.commit);
  setText("deploy-id", receipt.deployId);
  setText("deploy-started", receipt.created ? `${receipt.created} (${ageLabel(receipt.created)})` : "timestamp unavailable");
  setText("deploy-finished", receipt.ended ? `${receipt.ended} (${ageLabel(receipt.ended)})` : "timestamp unavailable");
  setText("deploy-duration", receipt.duration === null ? "not computable" : `${receipt.duration}s`);
  setText("deploy-time", receipt.checked ? `${receipt.checked} (${ageLabel(receipt.checked)})` : "timestamp unavailable");
  const badge = byId("deployment-evidence-mode");
  if (badge) {
    badge.dataset.evidenceMode = mode;
    badge.textContent = evidenceLabel(mode);
  }
  const status = byId("deployment-status");
  if (status) {
    const failure = ["failure", "failed", "error", "canceled", "cancelled"].includes(receipt.outcome);
    status.dataset.state = failure ? "failure" : mode === "stale-measured" ? "warning" : "healthy";
    status.textContent = `Latest bounded deployment outcome: ${receipt.outcome}; finished ${receipt.ended ? ageLabel(receipt.ended) : "time unavailable"}; record observed ${receipt.checked ? ageLabel(receipt.checked) : "time unavailable"}.`;
  }
  const source = byId("source-deployment");
  if (source) source.textContent = `${mode}; ${ageLabel(evidenceAt)}; deploy-watch latest record`;
}

function percent(ok, total) {
  if (!Number.isFinite(ok) || !Number.isFinite(total) || total <= 0) return "—";
  return `${((ok / total) * 100).toFixed(2)}%`;
}

export function availabilityRows(sloPayload) {
  const windowDays = Number(sloPayload?.window_days);
  const window = Number.isFinite(windowDays) && windowDays > 0 ? Math.trunc(windowDays) : 30;
  return Object.entries(sloPayload?.components ?? {})
    .map(([component, record]) => {
      const ok = Number(record?.ok);
      const total = Number(record?.total);
      const observed = Number(record?.days_observed);
      return {
        component,
        label: COMPONENT_LABELS[component] ?? component.replaceAll("_", "-"),
        observed: Number.isFinite(observed) ? Math.trunc(observed) : 0,
        window,
        ok: Number.isFinite(ok) ? ok : 0,
        total: Number.isFinite(total) ? total : 0,
        availability: percent(ok, total),
        avgMs: Number.isFinite(Number(record?.avg_ms)) ? Math.round(Number(record.avg_ms)) : null,
        firstDay: record?.first_day ?? null,
      };
    })
    .sort((a, b) => a.label.localeCompare(b.label));
}

function renderAvailability(sloPayload, statsPayload) {
  const body = byId("availability-rows");
  if (!body) return;
  const records = availabilityRows(sloPayload);
  body.replaceChildren();
  for (const record of records) {
    const measured = record.total > 0;
    const row = document.createElement("tr");
    const values = [
      record.label,
      measured ? `${record.observed} / ${record.window} days` : "—",
      measured ? record.availability : "—",
      measured ? `${record.ok} / ${record.total}` : "—",
      measured && record.avgMs !== null ? `${record.avgMs} ms` : "—",
    ];
    for (const value of values) {
      const cell = document.createElement("td");
      cell.textContent = value;
      row.appendChild(cell);
    }
    const evidence = document.createElement("td");
    const mode = measured ? "measured" : "unknown";
    const badge = document.createElement("span");
    badge.className = "atlas-evidence-mode";
    badge.dataset.evidenceMode = mode;
    badge.textContent = evidenceLabel(mode);
    const detail = document.createElement("span");
    detail.className = "systems-evidence-detail";
    detail.textContent = measured
      ? `first measured day ${record.firstDay ?? "unknown"}; one probe pass every ten minutes`
      : "no probe counters are available for this component";
    evidence.className = "systems-evidence-cell";
    evidence.append(badge, detail);
    row.appendChild(evidence);
    body.appendChild(row);
  }
  if (!records.length) {
    const row = document.createElement("tr");
    const cell = document.createElement("td");
    cell.colSpan = 6;
    cell.textContent = "No raw availability counters were published.";
    row.appendChild(cell);
    body.appendChild(row);
  }
  const generatedAt = sloPayload?.generated_at ?? null;
  const status = byId("availability-status");
  if (status) {
    status.dataset.state = records.length ? "healthy" : "warning";
    status.textContent = records.length
      ? `${records.length} components rendered from the ${records[0]?.window ?? 30}-day raw probe window; source ${ageLabel(generatedAt)}.`
      : "Raw availability evidence is empty.";
  }
  const source = byId("source-availability");
  if (source) source.textContent = `${records.length ? evidenceModeFromTime(generatedAt) : "unknown"}; ${ageLabel(generatedAt)}; ${records.length} components`;
  const checked = statsPayload?.estate?.checked_at ?? statsPayload?.generated_at ?? null;
  const note = byId("availability-note");
  if (note) note.textContent = `Coverage means calendar days with probe evidence inside the configured window, not days that were fully up. Availability is successful probes divided by total probes. Current estate snapshot ${ageLabel(checked)}.`;
}

export function assuranceStateSummary(states) {
  const normalized = states.map((state) => String(state ?? "unknown").trim().toLowerCase());
  const failures = normalized.filter((state) => ["fail", "failure", "failed"].includes(state)).length;
  const unknown = normalized.filter((state) => ["unknown", "unavailable", "stale", ""].includes(state)).length;
  return {
    total: normalized.length,
    failures,
    unknown,
    state: failures ? "failure" : unknown ? "warning" : normalized.length ? "healthy" : "warning",
  };
}

function reconcileAssuranceState() {
  const rows = [...(byId("report-rows")?.querySelectorAll("tr") ?? [])]
    .filter((row) => row.cells?.length >= 2 && row.cells[0].colSpan !== 4);
  if (!rows.length) return;
  const summary = assuranceStateSummary(rows.map((row) => row.cells[1]?.textContent));
  const status = byId("reports-status");
  const source = byId("source-reports");
  const overall = byId("evidence-status");

  if (summary.failures) {
    if (status) {
      status.dataset.state = "failure";
      status.textContent = `${summary.total} assurance records; ${summary.failures} explicit failure state${summary.failures === 1 ? "" : "s"}.`;
    }
    if (source) source.textContent = `failure; ${summary.failures}/${summary.total} report states failed`;
    if (overall) {
      overall.dataset.state = "failure";
      overall.textContent = "At least one public assurance record is explicitly failed.";
    }
    return;
  }

  if (summary.unknown) {
    if (status) {
      status.dataset.state = "warning";
      status.textContent = `${summary.total} assurance records; ${summary.unknown} state${summary.unknown === 1 ? " is" : "s are"} unknown or non-current. Freshness does not promote an unknown assurance verdict to healthy.`;
    }
    if (source) source.textContent = `warning; ${summary.unknown}/${summary.total} report states unknown or non-current; freshness is independent of verdict`;
    if (overall?.dataset.state !== "failure") {
      overall.dataset.state = "warning";
      overall.textContent = "The evidence set contains an assurance record whose verdict is unknown or non-current.";
    }
  }
}

function watch(section, apply) {
  if (!section || typeof MutationObserver === "undefined") return;
  const observer = new MutationObserver(() => {
    observer.disconnect();
    apply();
    observer.observe(section, { childList: true, subtree: true, characterData: true, attributes: true });
  });
  observer.observe(section, { childList: true, subtree: true, characterData: true, attributes: true });
}

async function load() {
  ensureActivityDisclosure();
  reconcileAssuranceState();
  watch(byId("report-rows"), reconcileAssuranceState);

  const [activity, deployment, slo, stats] = await Promise.all([
    fetchJson(ENDPOINTS.activity),
    fetchJson(ENDPOINTS.deployment),
    fetchJson(ENDPOINTS.slo),
    fetchJson(ENDPOINTS.stats),
  ]);
  const applyActivity = () => renderActivity(activity);
  const applyDeployment = () => renderDeployment(deployment);
  applyActivity();
  applyDeployment();
  renderAvailability(slo, stats);
  watch(byId("activity-heatmap")?.closest("section"), applyActivity);
  watch(byId("deploy-outcome")?.closest("section"), applyDeployment);
}

if (typeof document !== "undefined") void load();
