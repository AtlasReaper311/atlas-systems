/**
 * ui.js :: floating control, inspector, and demo lab for sonification.
 *
 * The small widget is still useful as a live monitor, but the expanded
 * panel makes the mapping legible: each service row flashes when its
 * note plays, shows the telemetry behind that note, and can be muted
 * or soloed. Demo mode is local-only; it never writes telemetry.
 */

import { createEngine, DEFAULT_USER_GAIN } from "./engine.js?v=20260708-drumhit";
import { createPoller } from "./poller.js?v=20260708-drumhit";
import {
  CURATED_SERVICES,
  computeFrame,
} from "./mapping.js?v=20260708-drumhit";

const WIDGET_ID = "sonify-widget";

const SERVICE_LABELS = {
  "ramone-memory": "memory",
  "atlas-corpus": "corpus",
  "specular-telemetry": "telemetry",
  "atlas-api-index": "api index",
  "ramone-trigger": "trigger",
  "specular-edge": "edge",
};

const STATUS_LABELS = {
  healthy: "healthy",
  degraded: "degraded",
  down: "down",
  unknown: "unknown",
};

const STATUS_ORDER = ["healthy", "degraded", "down"];

const DEMO_BASE_LATENCY = {
  "ramone-memory": 130,
  "atlas-corpus": 150,
  "specular-telemetry": 95,
  "atlas-api-index": 35,
  "ramone-trigger": 115,
  "specular-edge": 75,
};

const DEMO_STATE_VALUES = {
  "ramone-memory": {
    degraded: { latency_ms: 340, uptime_pct: 92, error_rate: 0.45 },
    down: { latency_ms: 500, uptime_pct: 0, error_rate: 0.82 },
  },
  "atlas-corpus": {
    degraded: { latency_ms: 380, uptime_pct: 90.5, error_rate: 0.55 },
    down: { latency_ms: 500, uptime_pct: 0, error_rate: 0.86 },
  },
  "specular-telemetry": {
    degraded: { latency_ms: 300, uptime_pct: 93, error_rate: 0.35 },
    down: { latency_ms: 480, uptime_pct: 0, error_rate: 0.8 },
  },
  "atlas-api-index": {
    degraded: { latency_ms: 460, uptime_pct: 91, error_rate: 0.5 },
    down: { latency_ms: 500, uptime_pct: 0, error_rate: 0.84 },
  },
  "ramone-trigger": {
    degraded: { latency_ms: 360, uptime_pct: 89.5, error_rate: 0.62 },
    down: { latency_ms: 500, uptime_pct: 0, error_rate: 0.88 },
  },
  "specular-edge": {
    degraded: { latency_ms: 280, uptime_pct: 94, error_rate: 0.3 },
    down: { latency_ms: 490, uptime_pct: 0, error_rate: 0.78 },
  },
};

const DEMOS = {
  healthy: {
    label: "all healthy",
    estate: { overall_health: 1, active_incidents: 0 },
    overrides: {},
  },
  slowApi: {
    label: "slow api",
    estate: { overall_health: 0.9, active_incidents: 0 },
    overrides: {
      "atlas-api-index": { latency_ms: 460, status: "degraded" },
    },
  },
  corpusDegraded: {
    label: "corpus degraded",
    estate: { overall_health: 0.78, active_incidents: 0 },
    overrides: {
      "atlas-corpus": {
        status: "degraded",
        latency_ms: 310,
        uptime_pct: 91,
        error_rate: 0.45,
      },
    },
  },
  incident: {
    label: "incident",
    estate: { overall_health: 0.46, active_incidents: 1 },
    overrides: {
      "ramone-trigger": {
        status: "down",
        latency_ms: DEMO_STATE_VALUES["ramone-trigger"].down.latency_ms,
        uptime_pct: 0,
        error_rate: DEMO_STATE_VALUES["ramone-trigger"].down.error_rate,
      },
    },
  },
  recovery: {
    label: "fresh deploy",
    estate: { overall_health: 0.98, active_incidents: 0 },
    overrides: {
      "specular-edge": {
        status: "healthy",
        last_deploy_secs_ago: 120,
      },
    },
  },
};

const STYLE = `
.sn-w {
  position: fixed;
  right: 16px;
  bottom: 16px;
  z-index: 300;
  display: grid;
  gap: 8px;
  width: min(560px, calc(100vw - 32px));
  max-width: 232px;
  padding: 10px 12px;
  background: var(--bg-1, #111118);
  border: 1px solid var(--border, rgba(255, 255, 255, 0.08));
  border-radius: 6px;
  box-shadow: 0 16px 48px rgba(0, 0, 0, 0.35);
  font-family: var(--mono, "IBM Plex Mono", monospace);
  font-size: 12px;
  line-height: 1.45;
  color: var(--text, #e8e8e0);
  transition: box-shadow 60ms ease-out;
}
.sn-w[data-open="1"] { max-width: 560px; }
.sn-w * { box-sizing: border-box; }
.sn-w[data-inc-hit="1"] {
  box-shadow: 0 0 0 2px #e24b4a, 0 16px 48px rgba(0, 0, 0, 0.35);
}
.sn-head { display: flex; align-items: center; gap: 8px; }
.sn-toggle,
.sn-icon,
.sn-chip,
.sn-mini {
  background: transparent;
  border: 1px solid var(--border, rgba(255, 255, 255, 0.12));
  border-radius: 4px;
  color: var(--text, #e8e8e0);
  font: inherit;
  font-size: 11px;
  padding: 3px 8px;
  cursor: pointer;
}
.sn-toggle {
  flex: none;
  border-color: var(--accent, #f5a623);
  color: var(--accent, #f5a623);
  letter-spacing: 0.06em;
  padding-inline: 10px;
}
.sn-icon { width: 26px; padding-inline: 0; color: var(--text-dim, #aaa9a0); }
.sn-toggle:hover,
.sn-icon:hover,
.sn-chip:hover,
.sn-mini:hover { background: rgba(245, 166, 35, 0.12); }
.sn-toggle:focus-visible,
.sn-icon:focus-visible,
.sn-chip:focus-visible,
.sn-mini:focus-visible {
  outline: 1px solid var(--accent, #f5a623);
  outline-offset: 2px;
}
.sn-toggle:disabled { opacity: 0.5; cursor: wait; }
.sn-readout {
  margin-left: auto;
  color: var(--text-dim, #aaa9a0);
  letter-spacing: 0.04em;
  white-space: nowrap;
}
.sn-health { color: var(--text, #e8e8e0); }
.sn-inc[data-alert="1"] { color: #e24b4a; }
.sn-inc[data-hit="1"] { color: #fff; text-shadow: 0 0 6px rgba(226, 75, 74, 0.9); }
.sn-dots { display: flex; gap: 6px; }
.sn-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--text-faint, #555560);
}
.sn-dot[data-status="healthy"] { background: #4ade80; }
.sn-dot[data-status="degraded"] { background: var(--accent, #f5a623); }
.sn-dot[data-status="down"] { background: #e24b4a; }
.sn-dot[data-hit="1"] { outline: 1px solid #fff; outline-offset: 2px; }
.sn-vol {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--text-faint, #555560);
  font-size: 11px;
  letter-spacing: 0.06em;
}
.sn-vol input { flex: 1 1 auto; min-width: 0; accent-color: var(--accent, #f5a623); }
.sn-panel { display: none; gap: 10px; border-top: 1px solid var(--border, rgba(255,255,255,.08)); padding-top: 10px; }
.sn-w[data-open="1"] .sn-panel { display: grid; }
.sn-mode,
.sn-demo { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
.sn-label { color: var(--text-faint, #555560); letter-spacing: 0.06em; text-transform: uppercase; font-size: 10px; }
.sn-chip[aria-pressed="true"],
.sn-mini[aria-pressed="true"] {
  border-color: var(--accent, #f5a623);
  color: var(--accent, #f5a623);
}
.sn-chip[data-variant="hit"] {
  border-color: #e24b4a;
  color: #e24b4a;
}
.sn-grid { display: grid; gap: 5px; }
.sn-grid-head {
  display: grid;
  grid-template-columns: 10px minmax(95px, 1fr) 58px 58px 44px 52px;
  gap: 7px;
  color: var(--text-faint, #555560);
  font-size: 10px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}
.sn-row {
  display: grid;
  grid-template-columns: 10px minmax(95px, 1fr) 58px 58px 44px 52px;
  gap: 7px;
  align-items: center;
  min-height: 27px;
  padding: 4px 0;
  border-bottom: 1px solid rgba(255,255,255,.05);
}
.sn-row[data-hit="1"] { background: rgba(245,166,35,.1); }
.sn-row[data-muted="1"] { opacity: .42; }
.sn-row-dot {
  width: 10px;
  height: 10px;
  border: 0;
  border-radius: 50%;
  padding: 0;
  background: var(--text-faint, #555560);
  cursor: pointer;
}
.sn-row-dot:hover { outline: 1px solid var(--accent, #f5a623); outline-offset: 2px; }
.sn-row-dot:focus-visible { outline: 1px solid var(--accent, #f5a623); outline-offset: 2px; }
.sn-row-dot[data-status="healthy"] { background: #4ade80; }
.sn-row-dot[data-status="degraded"] { background: var(--accent, #f5a623); }
.sn-row-dot[data-status="down"] { background: #e24b4a; }
.sn-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sn-metric { color: var(--text-dim, #aaa9a0); white-space: nowrap; }
.sn-actions { display: flex; gap: 4px; justify-content: flex-end; }
.sn-mini { padding: 2px 5px; font-size: 10px; color: var(--text-dim, #aaa9a0); }
.sn-explain {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 5px 12px;
  color: var(--text-dim, #aaa9a0);
  font-size: 11px;
}
.sn-explain b { color: var(--text, #e8e8e0); font-weight: 500; }
.sn-summary { color: var(--text-dim, #aaa9a0); font-size: 11px; }
.sn-summary b { color: var(--text, #e8e8e0); font-weight: 500; }
.sn-w[data-stale="1"] .sn-readout,
.sn-w[data-stale="1"] .sn-dots { opacity: 0.45; }
@media (max-width: 680px) {
  .sn-w { right: 12px; bottom: 72px; width: calc(100vw - 24px); }
  .sn-grid-head,
  .sn-row { grid-template-columns: 10px minmax(80px, 1fr) 48px 48px 36px 48px; gap: 5px; }
  .sn-explain { grid-template-columns: 1fr; }
}
`;

function el(tag, className, attrs = {}) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  for (const [key, value] of Object.entries(attrs)) {
    node.setAttribute(key, value);
  }
  return node;
}

function fmtMs(value) {
  return Number.isFinite(value) ? `${Math.round(value)}ms` : "no ms";
}

function fmtPct(value) {
  return Number.isFinite(value) ? `${Math.round(value)}%` : "open";
}

function fmtPitch(voice) {
  return `d${voice.degree}`;
}

function cloneFrame(frame) {
  return {
    ...frame,
    scale: [...frame.scale],
    voices: frame.voices.map((voice) => ({ ...voice })),
  };
}

function applyMasks(frame, muted, soloed) {
  const next = cloneFrame(frame);
  const soloActive = soloed.size > 0;
  next.voices = next.voices.map((voice) => {
    const off = muted.has(voice.name) || (soloActive && !soloed.has(voice.name));
    return off ? { ...voice, audible: false, voiceGain: 0, velocity: 0 } : voice;
  });
  return next;
}

function baseService(name) {
  return {
    name,
    status: "healthy",
    latency_ms: null,
    uptime_pct: null,
    error_rate: null,
    last_deploy_secs_ago: null,
  };
}

function statusPatch(name, status, fallbackLatency) {
  if (status === "healthy") {
    return {
      status: "healthy",
      uptime_pct: null,
      error_rate: null,
      latency_ms: fallbackLatency,
    };
  }
  const values = DEMO_STATE_VALUES[name]?.[status];
  if (values) return { status, ...values };
  if (status === "degraded") {
    return {
      status: "degraded",
      latency_ms: Number.isFinite(fallbackLatency) ? Math.max(fallbackLatency, 320) : 340,
      uptime_pct: 91,
      error_rate: 0.55,
    };
  }
  return {
    status: "down",
    latency_ms: Number.isFinite(fallbackLatency) ? Math.max(fallbackLatency, 480) : 500,
    uptime_pct: 0,
    error_rate: 0.85,
  };
}

function deriveEstateFromServices(services) {
  const score = { healthy: 1, degraded: 0.45, down: 0 };
  const known = services.filter((service) => service.status !== "unknown");
  const base = known.length
    ? known.reduce((sum, service) => sum + score[service.status], 0) / known.length
    : 1;
  const degraded = services.some((service) => service.status === "degraded");
  const down = services.some((service) => service.status === "down");
  return {
    overall_health: down ? Math.min(base, 0.45) : degraded ? Math.min(base, 0.68) : base,
    active_incidents: services.filter((service) => service.status === "down").length,
  };
}

function buildDemoPayload(kind) {
  const demo = DEMOS[kind] || DEMOS.healthy;
  const services = CURATED_SERVICES.map((name, index) => {
    const latency = DEMO_BASE_LATENCY[name] ?? [130, 150, 95, 35, 115, 75][index];
    const base = {
      ...baseService(name),
      latency_ms: latency,
      ...demo.overrides[name],
    };
    const manual = manualStatuses.get(name);
    return manual ? { ...base, ...statusPatch(name, manual, base.latency_ms) } : base;
  });
  return {
    timestamp: new Date().toISOString(),
    estate: deriveEstateFromServices(services),
    services,
  };
}

const manualStatuses = new Map();

export function initSonify() {
  if (document.getElementById(WIDGET_ID)) return;

  const engine = createEngine();
  let mode = "live";
  let demoKind = "healthy";
  let lastLiveFrame = null;
  let currentDisplayFrame = null;
  let lastDemoIncidentCount = 0;
  const muted = new Set();
  const soloed = new Set();

  const root = el("section", "sn-w", {
    id: WIDGET_ID,
    role: "region",
    "aria-label": "Estate sonification",
    "data-open": "0",
  });
  const style = document.createElement("style");
  style.textContent = STYLE;

  const head = el("div", "sn-head");
  const toggle = el("button", "sn-toggle", {
    type: "button",
    "aria-pressed": "false",
    "aria-label": "Start estate sonification",
  });
  toggle.textContent = "start";
  const expand = el("button", "sn-icon", {
    type: "button",
    "aria-expanded": "false",
    title: "Open sonify inspector",
  });
  expand.textContent = "+";

  const readout = el("div", "sn-readout", { "aria-live": "polite" });
  const healthSpan = el("span", "sn-health");
  healthSpan.textContent = "health --%";
  const sep = document.createElement("span");
  sep.textContent = " . ";
  const incSpan = el("span", "sn-inc");
  incSpan.textContent = "inc -";
  readout.append(healthSpan, sep, incSpan);
  head.append(toggle, expand, readout);

  const dots = el("div", "sn-dots");
  const dotByName = new Map();
  for (const name of CURATED_SERVICES) {
    const dot = el("span", "sn-dot", {
      "data-status": "unknown",
      title: `${name}: unknown`,
      role: "img",
      "aria-label": `${name}: unknown`,
    });
    dots.append(dot);
    dotByName.set(name, dot);
  }

  const vol = el("label", "sn-vol");
  const volText = document.createElement("span");
  volText.textContent = "vol";
  const slider = el("input", "", {
    type: "range",
    min: "0",
    max: "100",
    step: "1",
    value: String(Math.round(DEFAULT_USER_GAIN * 100)),
    "aria-label": "Sonification volume",
  });
  vol.append(volText, slider);

  const panel = el("div", "sn-panel");
  const modeBar = el("div", "sn-mode");
  const modeLabel = el("span", "sn-label");
  modeLabel.textContent = "source";
  const liveBtn = el("button", "sn-chip", { type: "button", "aria-pressed": "true" });
  liveBtn.textContent = "live estate";
  const demoBtn = el("button", "sn-chip", { type: "button", "aria-pressed": "false" });
  demoBtn.textContent = "demo lab";
  modeBar.append(modeLabel, liveBtn, demoBtn);

  const demoBar = el("div", "sn-demo");
  const demoLabel = el("span", "sn-label");
  demoLabel.textContent = "try";
  demoBar.append(demoLabel);
  const demoButtons = new Map();
  for (const [key, demo] of Object.entries(DEMOS)) {
    const button = el("button", "sn-chip", {
      type: "button",
      "aria-pressed": key === demoKind ? "true" : "false",
    });
    button.textContent = demo.label;
    button.addEventListener("click", () => {
      manualStatuses.clear();
      demoKind = key;
      mode = "demo";
      refreshSourceButtons();
      renderCurrent();
      const nextIncidents = sourceFrame()?.activeIncidents ?? 0;
      if (nextIncidents > lastDemoIncidentCount) {
        engine.queueIncidentHits(nextIncidents - lastDemoIncidentCount);
      }
      lastDemoIncidentCount = nextIncidents;
    });
    demoButtons.set(key, button);
    demoBar.append(button);
  }

  // Direct audition control: plays one incident hit without touching
  // mode, demo state, or manual statuses. Isolates the drum sound from
  // the health-blend/colour changes every other trigger path also
  // causes, so it can be tuned by ear on its own. No-ops silently (via
  // engine.queueIncidentHits' own guard) if audio hasn't been started.
  const testHitBtn = el("button", "sn-chip", {
    type: "button",
    "data-variant": "hit",
  });
  testHitBtn.textContent = "test hit";
  testHitBtn.title = "Play one incident hit only, for tuning by ear (requires sonification started)";
  testHitBtn.addEventListener("click", () => {
    engine.queueIncidentHits(1);
  });
  demoBar.append(testHitBtn);

  const grid = el("div", "sn-grid");
  const gridHead = el("div", "sn-grid-head");
  for (const text of ["", "service", "ms", "pitch", "bright", "hear"]) {
    const span = document.createElement("span");
    span.textContent = text;
    gridHead.append(span);
  }
  grid.append(gridHead);
  const rows = new Map();
  for (const name of CURATED_SERVICES) {
    const row = el("div", "sn-row", { "data-service": name });
    const dot = el("button", "sn-row-dot", {
      type: "button",
      "data-status": "unknown",
      "aria-label": `Cycle ${name} status`,
      title: `Cycle ${name}: healthy, degraded, down`,
    });
    const serviceName = el("span", "sn-name");
    serviceName.textContent = SERVICE_LABELS[name] || name;
    const latency = el("span", "sn-metric");
    const pitch = el("span", "sn-metric");
    const bright = el("span", "sn-metric");
    const actions = el("span", "sn-actions");
    const solo = el("button", "sn-mini", { type: "button", "aria-pressed": "false" });
    solo.textContent = "S";
    solo.title = `Solo ${name}`;
    const mute = el("button", "sn-mini", { type: "button", "aria-pressed": "false" });
    mute.textContent = "M";
    mute.title = `Mute ${name}`;
    actions.append(solo, mute);
    row.append(dot, serviceName, latency, pitch, bright, actions);
    grid.append(row);
    rows.set(name, { row, dot, latency, pitch, bright, solo, mute });
    dot.addEventListener("click", () => {
      const frame = sourceFrame();
      const voice = frame?.voices.find((v) => v.name === name);
      const current = manualStatuses.get(name) || voice?.status || "healthy";
      const next = STATUS_ORDER[(STATUS_ORDER.indexOf(current) + 1) % STATUS_ORDER.length];
      manualStatuses.set(name, next);
      mode = "demo";
      demoKind = "healthy";
      refreshSourceButtons();
      renderCurrent();
      if (next === "down") engine.queueIncidentHits(1);
      lastDemoIncidentCount = sourceFrame()?.activeIncidents ?? 0;
    });
    solo.addEventListener("click", () => {
      if (soloed.has(name)) soloed.delete(name);
      else soloed.add(name);
      renderCurrent();
    });
    mute.addEventListener("click", () => {
      if (muted.has(name)) muted.delete(name);
      else muted.add(name);
      renderCurrent();
    });
  }

  const summary = el("div", "sn-summary");
  const explain = el("div", "sn-explain");
  for (const [label, value] of [
    ["latency", "pitch"],
    ["health", "mode + volume"],
    ["uptime/current state", "brightness"],
    ["errors", "note strength"],
    ["incidents", "drum hit"],
    ["deploy age", "vibrato"],
  ]) {
    const item = document.createElement("span");
    const key = document.createElement("b");
    key.textContent = label;
    item.append(key, document.createTextNode(` -> ${value}`));
    explain.append(item);
  }
  panel.append(modeBar, demoBar, grid, summary, explain);
  root.append(style, head, dots, vol, panel);
  document.body.append(root);

  function setToggleState(runningNow) {
    toggle.textContent = runningNow ? "mute" : "start";
    toggle.setAttribute("aria-pressed", String(runningNow));
    toggle.setAttribute(
      "aria-label",
      runningNow ? "Mute estate sonification" : "Start estate sonification",
    );
  }

  function refreshSourceButtons() {
    liveBtn.setAttribute("aria-pressed", String(mode === "live"));
    demoBtn.setAttribute("aria-pressed", String(mode === "demo"));
    for (const [key, button] of demoButtons) {
      button.setAttribute("aria-pressed", String(mode === "demo" && key === demoKind));
    }
  }

  function sourceFrame() {
    if (mode === "demo") return computeFrame(buildDemoPayload(demoKind));
    return lastLiveFrame;
  }

  function renderCurrent() {
    const frame = sourceFrame();
    if (!frame) return;
    currentDisplayFrame = frame;
    const audibleFrame = applyMasks(frame, muted, soloed);
    engine.applyFrame(audibleFrame);
    renderFrame(frame);
  }

  function renderFrame(frame) {
    healthSpan.textContent = `health ${Math.round(frame.overallHealth * 100)}%`;
    incSpan.textContent = `inc ${frame.activeIncidents}`;
    incSpan.setAttribute("data-alert", frame.activeIncidents > 0 ? "1" : "0");
    const modeName = frame.overallHealth > 0.75
      ? "Lydian / open"
      : frame.overallHealth < 0.5
        ? "Phrygian / alert"
        : "crossfade";
    summary.textContent = "";
    const summaryMood = document.createElement("b");
    summaryMood.textContent = modeName;
    summary.append(summaryMood, document.createTextNode(
      ` . ${mode === "demo" ? "demo" : "live"} . ${frame.voices.length} voices`,
    ));
    for (const voice of frame.voices) {
      const dot = dotByName.get(voice.name);
      const row = rows.get(voice.name);
      if (!row) continue;
      const hidden = muted.has(voice.name) || (soloed.size > 0 && !soloed.has(voice.name));
      dot?.setAttribute("data-status", voice.status);
      dot?.setAttribute("title", `${voice.name}: ${voice.status}`);
      dot?.setAttribute("aria-label", `${voice.name}: ${voice.status}`);
      row.dot.setAttribute("data-status", voice.status);
      row.dot.setAttribute(
        "aria-label",
        `${voice.name}: ${STATUS_LABELS[voice.status]}; click to cycle status`,
      );
      row.dot.setAttribute(
        "title",
        `${voice.name}: ${STATUS_LABELS[voice.status]}; click for green/yellow/red demo`,
      );
      row.row.setAttribute("data-muted", hidden ? "1" : "0");
      row.latency.textContent = fmtMs(voice.latency_ms);
      row.pitch.textContent = fmtPitch(voice);
      row.bright.textContent = fmtPct(voice.uptime_pct);
      row.solo.setAttribute("aria-pressed", String(soloed.has(voice.name)));
      row.mute.setAttribute("aria-pressed", String(muted.has(voice.name)));
      row.row.title = `${voice.name}: ${STATUS_LABELS[voice.status]}; latency controls pitch, brightness follows state, errors reduce strength`;
    }
  }

  function flashVoice(name) {
    const row = rows.get(name);
    const dot = dotByName.get(name);
    if (!row) return;
    row.row.setAttribute("data-hit", "1");
    dot?.setAttribute("data-hit", "1");
    window.setTimeout(() => {
      row.row.removeAttribute("data-hit");
      dot?.removeAttribute("data-hit");
    }, 220);
  }

  /**
   * Incident hits are estate-level, not tied to one service (they can
   * fire from a "down" status on any of several services, or from a
   * live poll where the payload's active_incidents count rose), so
   * this flashes the whole widget rather than a specific row. Visible
   * whether the panel is expanded or collapsed, since the incident
   * chip in the collapsed header (`inc N`) is always on screen.
   */
  function flashIncident() {
    root.setAttribute("data-inc-hit", "1");
    incSpan.setAttribute("data-hit", "1");
    window.setTimeout(() => {
      root.removeAttribute("data-inc-hit");
      incSpan.removeAttribute("data-hit");
    }, 260);
  }

  toggle.addEventListener("click", async () => {
    toggle.disabled = true;
    try {
      if (engine.isRunning()) {
        engine.pause();
        setToggleState(false);
      } else {
        await engine.start();
        setToggleState(true);
      }
    } catch (err) {
      console.error("sonify: audio failed to start", err);
      toggle.textContent = "audio n/a";
      toggle.setAttribute("aria-label", "Audio unavailable; see console");
    } finally {
      toggle.disabled = false;
    }
  });

  expand.addEventListener("click", () => {
    const open = root.getAttribute("data-open") !== "1";
    root.setAttribute("data-open", open ? "1" : "0");
    expand.setAttribute("aria-expanded", String(open));
    expand.textContent = open ? "-" : "+";
  });

  liveBtn.addEventListener("click", () => {
    mode = "live";
    refreshSourceButtons();
    renderCurrent();
  });
  demoBtn.addEventListener("click", () => {
    mode = "demo";
    refreshSourceButtons();
    renderCurrent();
    lastDemoIncidentCount = sourceFrame()?.activeIncidents ?? 0;
  });

  slider.addEventListener("input", () => {
    engine.setUserVolume(Number(slider.value) / 100);
  });

  engine.setVoiceTickHandler((name) => flashVoice(name));
  engine.setIncidentHitHandler(() => flashIncident());

  const poller = createPoller({
    onFrame(frame, { newIncidents }) {
      lastLiveFrame = frame;
      if (mode === "live") {
        renderCurrent();
        if (newIncidents > 0) engine.queueIncidentHits(newIncidents);
      }
    },
    onStatus({ failing }) {
      root.setAttribute("data-stale", failing ? "1" : "0");
    },
  });

  refreshSourceButtons();
  poller.start();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initSonify, { once: true });
} else {
  initSonify();
}
