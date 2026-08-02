const LATEST_URL = "https://api.atlas-systems.uk/specular/anomaly";
const HISTORY_URL = "https://api.atlas-systems.uk/specular/anomaly/history";

const stateElement = document.querySelector("#overall-state");
const scoreElement = document.querySelector("#overall-score");
const generatedElement = document.querySelector("#generated-at");
const sourceStatus = document.querySelector("#source-status");
const metricSelect = document.querySelector("#metric-select");
const table = document.querySelector("#metric-table");
const canvas = document.querySelector("#anomaly-chart");
const context = canvas.getContext("2d");

let latest = null;
let history = [];

function formatNumber(value, digits = 2) {
  return value === null || value === undefined || Number.isNaN(Number(value))
    ? "-"
    : Number(value).toFixed(digits);
}

function relativeTime(value) {
  if (!value) return "-";
  const seconds = Math.round((Date.now() - Date.parse(value)) / 1000);
  if (Math.abs(seconds) < 60) return `${seconds}s ago`;
  if (Math.abs(seconds) < 3600) return `${Math.round(seconds / 60)}m ago`;
  return `${Math.round(seconds / 3600)}h ago`;
}

function stateClass(state) {
  return `state-${state || "error"}`;
}

function fallbackHistory() {
  const now = Date.now();
  const items = [];
  for (let index = 0; index < 72; index += 1) {
    const drift = index > 42 ? (index - 42) * 0.014 : 0;
    const score = Math.min(0.88, 0.12 + Math.sin(index / 6) * 0.025 + drift);
    const state = score > 0.72 ? "warning" : score > 0.42 ? "watch" : "normal";
    items.unshift({
      schema: "specular-anomaly/v1",
      state,
      score,
      generated_at: new Date(now - index * 30000).toISOString(),
      metrics: {
        "cpu.overall_pct": {
          metric: "cpu.overall_pct",
          state,
          score,
          confidence: 0.7,
          value: 34 + Math.sin(index / 5) + Math.max(0, 42 - index) * 0,
          robust_z: score * 4,
          slope_z: score * 5,
          volatility_ratio: 1 + score,
          dtw_distance: score * 1.4,
          warmup_remaining: 0,
          first_divergence_at: state === "normal" ? null : new Date(now - 15 * 60000).toISOString(),
        },
      },
    });
  }
  return items;
}

function renderLatest() {
  const state = latest?.state || "unknown";
  stateElement.textContent = state;
  stateElement.className = stateClass(state);
  scoreElement.textContent = latest?.score === null || latest?.score === undefined
    ? "-"
    : `${(Number(latest.score) * 100).toFixed(1)}%`;
  generatedElement.textContent = relativeTime(latest?.generated_at);
  sourceStatus.dataset.state = state;
  metricSelect.innerHTML = "";
  const metrics = Object.keys(latest?.metrics || {});
  metrics.forEach((metric) => {
    const option = document.createElement("option");
    option.value = metric;
    option.textContent = metric;
    metricSelect.appendChild(option);
  });
  table.innerHTML = "";
  if (!metrics.length) {
    table.innerHTML = '<tr><td colspan="7">No metric evidence is available.</td></tr>';
    renderSelected();
    return;
  }
  metrics.forEach((name) => {
    const metric = latest.metrics[name];
    const row = document.createElement("tr");
    row.innerHTML = `
      <td><code>${name}</code></td>
      <td class="${stateClass(metric.state)}">${metric.state}</td>
      <td>${formatNumber(metric.score, 3)}</td>
      <td>${formatNumber(metric.value, 2)}</td>
      <td>${formatNumber(metric.dtw_distance, 3)}</td>
      <td>${formatNumber(metric.slope_z, 2)}</td>
      <td>${formatNumber(metric.confidence, 3)}</td>`;
    table.appendChild(row);
  });
  renderSelected();
}

function setText(id, value) {
  document.querySelector(id).textContent = value;
}

function renderSelected() {
  const name = metricSelect.value || Object.keys(latest?.metrics || {})[0];
  const metric = latest?.metrics?.[name];
  setText("#metric-value", formatNumber(metric?.value));
  setText("#metric-z", formatNumber(metric?.robust_z));
  setText("#metric-slope", formatNumber(metric?.slope_z));
  setText("#metric-volatility", formatNumber(metric?.volatility_ratio));
  setText("#metric-dtw", formatNumber(metric?.dtw_distance, 3));
  setText("#metric-confidence", formatNumber(metric?.confidence, 3));
  setText("#metric-divergence", metric?.first_divergence_at ? relativeTime(metric.first_divergence_at) : "none");
  setText("#metric-warmup", String(metric?.warmup_remaining ?? "-"));
  drawHistory(name);
}

function drawHistory(metricName) {
  const ordered = [...history].reverse();
  const points = ordered
    .map((item) => {
      const metric = item.metrics?.[metricName] || (item.metric?.metric === metricName ? item.metric : null);
      return metric ? { score: Number(metric.score || 0), value: Number(metric.value || 0), state: metric.state, time: item.generated_at } : null;
    })
    .filter(Boolean);
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "#0a0a0f";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.strokeStyle = "rgba(255,255,255,.08)";
  for (let line = 1; line < 5; line += 1) {
    const y = canvas.height * line / 5;
    context.beginPath();
    context.moveTo(0, y);
    context.lineTo(canvas.width, y);
    context.stroke();
  }
  if (points.length < 2) {
    document.querySelector("#chart-summary").textContent = "Not enough persisted evidence for a trajectory.";
    return;
  }
  const values = points.map((point) => point.value);
  const minimum = Math.min(...values);
  const maximum = Math.max(...values);
  const range = Math.max(1e-6, maximum - minimum);
  points.forEach((point, index) => {
    if (!["warning", "critical"].includes(point.state)) return;
    const x = index / (points.length - 1) * canvas.width;
    context.fillStyle = point.state === "critical" ? "rgba(226,75,74,.16)" : "rgba(245,166,35,.12)";
    context.fillRect(x, 0, Math.max(2, canvas.width / points.length), canvas.height);
  });
  context.strokeStyle = "#aaa9a0";
  context.lineWidth = 1.5;
  context.beginPath();
  points.forEach((point, index) => {
    const x = index / (points.length - 1) * canvas.width;
    const y = canvas.height * 0.58 - ((point.value - minimum) / range - 0.5) * canvas.height * 0.42;
    if (index === 0) context.moveTo(x, y);
    else context.lineTo(x, y);
  });
  context.stroke();
  context.strokeStyle = "#f5a623";
  context.lineWidth = 2;
  context.beginPath();
  points.forEach((point, index) => {
    const x = index / (points.length - 1) * canvas.width;
    const y = canvas.height - point.score * canvas.height * 0.38 - 12;
    if (index === 0) context.moveTo(x, y);
    else context.lineTo(x, y);
  });
  context.stroke();
  document.querySelector("#chart-summary").textContent =
    `${points.length} observations. Grey: metric value normalised to its visible range. Amber: anomaly score.`;
}

async function load() {
  try {
    const [latestResponse, historyResponse] = await Promise.all([
      fetch(LATEST_URL, { cache: "no-store" }),
      fetch(HISTORY_URL, { cache: "no-store" }),
    ]);
    if (!latestResponse.ok) throw new Error(`latest returned ${latestResponse.status}`);
    latest = await latestResponse.json();
    history = historyResponse.ok ? (await historyResponse.json()).items || [] : [];
    sourceStatus.textContent = "recorded telemetry-shape evidence from specular-edge";
  } catch (error) {
    console.error(error);
    history = fallbackHistory();
    latest = history[0];
    sourceStatus.textContent = "live endpoint unavailable; rendering a labelled deterministic replay";
    sourceStatus.dataset.state = "warning";
  }
  renderLatest();
}

metricSelect.addEventListener("change", renderSelected);
load();
