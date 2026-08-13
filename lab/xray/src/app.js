/**
 * Interface wiring.
 *
 * Holds no simulation logic of its own. It reads the configuration out of the
 * URL, hands it to the engine, hands the resulting hops to the playback layer,
 * and renders whatever comes back.
 */

import { simulateRequest, LAYERS, LAYER_SWITCHES, DEFAULT_BUDGET_MS, normaliseConfig } from "./engine.js";
import { installEstateSearch } from "./estate-search.js";
import { STATUS_ENDPOINT, STATUS_LABELS, parseEstateStatus } from "./estate-status.js";
import { createPlayback, OUTCOME_STATE } from "./playback.js";
import { PRESETS } from "./presets.js";
import { encodeState, decodeState } from "./permalink.js";

const SWITCH_LABELS = {
  jitter: "Latency variance",
  rateLimit: "Rate limit",
  retries: "Retries",
  timeoutMs: "Timeout",
  serviceError: "Service error",
  cacheHit: "Cache hit",
  staleCache: "Stale entry",
};

const PASSIVE_NOTE = {
  browser: "No switches. The browser sends the request and renders whatever comes back.",
  database: "No switches. The database is only reached when the cache misses, and it always answers.",
};

const $ = (id) => document.getElementById(id);

const el = {
  presetRow: $("preset-row"),
  layerTabs: $("layer-tabs"),
  run: $("run"),
  replay: $("replay"),
  copyLink: $("copy-link"),
  copyTrace: $("copy-trace"),
  stageHint: $("stage-hint"),
  copyHint: $("copy-hint"),
  budgetElapsed: $("budget-elapsed"),
  budgetTotal: $("budget-total"),
  budgetFill: $("budget-fill"),
  status: $("m-status"),
  latency: $("m-latency"),
  downstream: $("m-downstream"),
  attempts: $("m-attempts"),
  terminal: $("m-terminal"),
  pattern: $("m-pattern"),
  explanation: $("explanation"),
  inspectorLayer: $("inspector-layer"),
  inspectorConfig: $("inspector-config"),
  inspectorOutcome: $("inspector-outcome"),
  hopBody: $("hop-body"),
  pin: $("pin"),
  unpin: $("unpin"),
  compareGrid: $("compare-grid"),
  packet: $("packet"),
  estateStatus: document.querySelector("[data-atlas-status]"),
};

const inputs = {
  cacheHit: $("sw-cachehit"),
  staleCache: $("sw-stale"),
  rateLimit: $("sw-ratelimit"),
  retries: $("sw-retries"),
  timeoutMs: $("sw-timeout"),
  serviceError: $("sw-serviceerror"),
  jitter: $("sw-jitter"),
};

const initial = decodeState(globalThis.location.search);

const state = {
  config: initial.config,
  pinned: initial.compareConfig,
  trace: null,
  selectedLayer: "api",
  running: false,
};

const playback = createPlayback({
  svg: document.querySelector(".pipeline"),
  packet: el.packet,
  onHop: handleHop,
  onProgress: handleProgress,
  onComplete: handleComplete,
});

/* ---------- small animation helpers ---------- */

/** Counts a number up to its target instead of snapping to it. */
function createTicker(node, render) {
  let current = 0;
  let frame = 0;
  return {
    set(target, { immediate = false } = {}) {
      cancelAnimationFrame(frame);
      if (immediate) {
        current = target;
        node.textContent = render(Math.round(current));
        return;
      }
      const from = current;
      const started = performance.now();
      const duration = 320;
      const step = (now) => {
        const progress = Math.min(1, (now - started) / duration);
        current = from + (target - from) * progress;
        node.textContent = render(Math.round(current));
        if (progress < 1) frame = requestAnimationFrame(step);
      };
      frame = requestAnimationFrame(step);
    },
  };
}

const elapsedTicker = createTicker(el.budgetElapsed, (value) => String(value));
const latencyTicker = createTicker(el.latency, (value) => `${value}ms`);
const downstreamTicker = createTicker(el.downstream, (value) => String(value));

let typewriterFrame = 0;

function typewrite(node, text) {
  cancelAnimationFrame(typewriterFrame);
  const reduced = globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  if (reduced || !text) {
    node.textContent = text;
    return;
  }
  const perCharacter = Math.max(4, Math.min(14, 1800 / text.length));
  const started = performance.now();
  node.textContent = "";
  const step = (now) => {
    const shown = Math.min(text.length, Math.floor((now - started) / perCharacter));
    node.textContent = text.slice(0, shown);
    if (shown < text.length) typewriterFrame = requestAnimationFrame(step);
  };
  typewriterFrame = requestAnimationFrame(step);
}

/* ---------- rendering ---------- */

function renderPresets() {
  el.presetRow.replaceChildren(
    ...PRESETS.map((preset) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "btn preset-btn";
      button.dataset.preset = preset.id;
      const title = document.createElement("strong");
      title.textContent = preset.label;
      const blurb = document.createElement("span");
      blurb.textContent = preset.blurb;
      button.append(title, blurb);
      button.addEventListener("click", () => {
        applyConfig(preset.config);
        run();
      });
      return button;
    }),
  );
}

function renderLayerTabs() {
  el.layerTabs.replaceChildren(
    ...LAYERS.map((layer) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "layer-tab";
      button.dataset.layer = layer;
      button.setAttribute("aria-pressed", String(layer === state.selectedLayer));
      const name = document.createElement("span");
      name.textContent = layer;
      const chip = document.createElement("span");
      chip.className = "layer-chip";
      chip.dataset.role = "chip";
      button.append(name, chip);
      button.addEventListener("click", () => selectLayer(layer));
      return button;
    }),
  );
}

function markPresetMatch() {
  const current = JSON.stringify(normaliseConfig(state.config));
  for (const button of el.presetRow.querySelectorAll("[data-preset]")) {
    const preset = PRESETS.find((candidate) => candidate.id === button.dataset.preset);
    button.setAttribute("aria-pressed", String(JSON.stringify(normaliseConfig(preset.config)) === current));
  }
}

function syncInputs() {
  inputs.cacheHit.checked = state.config.cacheHit;
  inputs.staleCache.checked = state.config.staleCache;
  inputs.rateLimit.checked = state.config.rateLimit;
  inputs.serviceError.checked = state.config.serviceError;
  inputs.jitter.checked = state.config.jitter;
  inputs.retries.value = String(state.config.retries);
  inputs.timeoutMs.value = String(state.config.timeoutMs);
  inputs.staleCache.disabled = !state.config.cacheHit;
}

function syncUrl() {
  const query = encodeState({
    config: state.config,
    compare: Boolean(state.pinned),
    compareConfig: state.pinned,
    omitDefault: true,
  });
  const next = query ? `${globalThis.location.pathname}?${query}` : globalThis.location.pathname;
  globalThis.history.replaceState(null, "", next);
}

function setAtlasStatus(result) {
  if (!el.estateStatus) return;
  el.estateStatus.dataset.state = result.state;
  el.estateStatus.setAttribute("aria-label", `Atlas Systems status: ${result.label}`);
  el.estateStatus.title = result.detail;
  const dot = el.estateStatus.querySelector(".status-dot");
  if (dot) dot.dataset.state = result.state;
  const label = el.estateStatus.querySelector("[data-atlas-status-label]");
  if (label) label.textContent = result.label;
}

async function refreshAtlasStatus() {
  if (!el.estateStatus) return;
  const controller = new AbortController();
  const timer = globalThis.setTimeout(() => controller.abort(), 6000);
  try {
    const response = await fetch(STATUS_ENDPOINT, {
      cache: "no-store",
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    setAtlasStatus(parseEstateStatus(await response.json()));
  } catch {
    setAtlasStatus({
      state: "unknown",
      label: STATUS_LABELS.unknown,
      detail: "Status evidence could not be loaded.",
    });
  } finally {
    globalThis.clearTimeout(timer);
  }
}

function setChip(layer, hop) {
  const chip = el.layerTabs.querySelector(`[data-layer="${layer}"] [data-role="chip"]`);
  if (!chip) return;
  if (!hop) {
    chip.textContent = "";
    delete chip.dataset.state;
    return;
  }
  chip.textContent = hop.outcome.replace("_", " ");
  chip.dataset.state = OUTCOME_STATE[hop.outcome] ?? "active";
}

function clearChips() {
  for (const layer of LAYERS) setChip(layer, null);
}

function renderInspector() {
  const layer = state.selectedLayer;
  el.inspectorLayer.textContent = layer;

  const owned = LAYER_SWITCHES[layer] ?? [];
  const configRows = [];
  if (owned.length === 0) {
    configRows.push(emptyRow(PASSIVE_NOTE[layer] ?? "No switches."));
  } else {
    for (const key of owned) {
      configRows.push(...keyValue(SWITCH_LABELS[key], formatSwitch(key, state.config[key])));
    }
    if (layer === "cache" && !state.config.cacheHit) {
      configRows.push(emptyRow("Stale entry has no effect while the cache is missing."));
    }
  }
  el.inspectorConfig.replaceChildren(...configRows);

  const outcomeRows = [];
  const hops = (state.trace?.hops ?? []).filter((hop) => hop.layer === layer);
  if (hops.length === 0) {
    outcomeRows.push(emptyRow(state.trace ? "This layer was never reached in the last run." : "No run yet."));
  } else {
    for (const hop of hops) {
      outcomeRows.push(
        ...keyValue(
          `Attempt ${hop.attempt}`,
          `${hop.outcome.replace("_", " ")} · ${hop.latencyMs}ms`,
          OUTCOME_STATE[hop.outcome],
        ),
      );
    }
    outcomeRows.push(...keyValue("Note", hops[hops.length - 1].note));
  }
  el.inspectorOutcome.replaceChildren(...outcomeRows);
}

function keyValue(term, value, stateName) {
  const dt = document.createElement("dt");
  dt.textContent = term;
  const dd = document.createElement("dd");
  dd.textContent = value;
  if (stateName) dd.dataset.state = stateName;
  return [dt, dd];
}

function emptyRow(text) {
  const p = document.createElement("dd");
  p.className = "kv-empty";
  p.textContent = text;
  return p;
}

function formatSwitch(key, value) {
  if (key === "timeoutMs") return `${value}ms`;
  if (key === "retries") return String(value);
  return value ? "on" : "off";
}

function renderHopTable(hops) {
  el.hopBody.replaceChildren(
    ...hops.map((hop, index) => {
      const row = document.createElement("tr");
      const cells = [
        [String(index + 1), null],
        [hop.layer, null],
        [String(hop.attempt), null],
        [hop.outcome.replace("_", " "), OUTCOME_STATE[hop.outcome]],
        [`${hop.latencyMs}ms`, null],
        [hop.note, null],
      ];
      cells.forEach(([text, stateName], column) => {
        const cell = document.createElement("td");
        cell.textContent = text;
        if (stateName) cell.dataset.state = stateName;
        if (column === 5) cell.className = "note";
        row.append(cell);
      });
      return row;
    }),
  );
}

function renderCompare() {
  if (!state.pinned) {
    const note = document.createElement("p");
    note.className = "panel-note";
    note.textContent = "Nothing pinned yet.";
    el.compareGrid.replaceChildren(note);
    return;
  }
  const pinnedRun = simulateRequest(state.pinned);
  const currentRun = state.trace ?? simulateRequest(state.config);
  el.compareGrid.replaceChildren(
    compareCard("Pinned run", pinnedRun),
    compareCard("Current run", currentRun, pinnedRun),
  );
}

function compareCard(title, run, against) {
  const card = document.createElement("div");
  card.className = "compare-card";

  const heading = document.createElement("h3");
  heading.textContent = title;
  card.append(heading);

  const list = document.createElement("dl");
  list.className = "kv";
  list.append(
    ...keyValue("Status", run.summary.status, statusState(run.summary)),
    ...keyValue("Latency", `${run.summary.totalLatencyMs}ms`, run.summary.overBudget ? "fail" : null),
    ...keyValue("Downstream", String(run.summary.downstreamCalls)),
    ...keyValue("Attempts", String(run.summary.attempts)),
    ...keyValue("Pattern", run.summary.explanationId.replace(/-/g, " ")),
  );
  card.append(list);

  if (against) {
    const delta = run.summary.totalLatencyMs - against.summary.totalLatencyMs;
    const calls = run.summary.downstreamCalls - against.summary.downstreamCalls;
    const note = document.createElement("p");
    note.className = "compare-delta";
    note.textContent =
      `${delta === 0 ? "Same latency" : `${delta > 0 ? "+" : ""}${delta}ms latency`} and ` +
      `${calls === 0 ? "the same number of downstream calls" : `${calls > 0 ? "+" : ""}${calls} downstream calls`} ` +
      "against the pinned run.";
    card.append(note);
  }
  return card;
}

function statusState(summary) {
  if (summary.status === "ok") return summary.servedFrom === "stale-cache" ? "warn" : "ok";
  return "fail";
}

/* ---------- playback callbacks ---------- */

let downstreamSoFar = 0;

function handleHop(hop) {
  setChip(hop.layer, hop);
  if (hop.layer === "api" && (hop.outcome === "dispatched" || hop.outcome === "retrying")) {
    downstreamSoFar += 1;
    downstreamTicker.set(downstreamSoFar);
  }
}

function handleProgress(elapsedMs) {
  elapsedTicker.set(elapsedMs);
  const fraction = Math.min(1, elapsedMs / DEFAULT_BUDGET_MS);
  el.budgetFill.style.width = `${(fraction * 100).toFixed(1)}%`;
  el.budgetFill.classList.toggle("is-over", elapsedMs > DEFAULT_BUDGET_MS);
}

function handleComplete() {
  const { summary } = state.trace;
  state.running = false;
  el.run.disabled = false;
  el.stageHint.textContent = summary.overBudget
    ? `Over the ${summary.budgetMs}ms budget by ${summary.totalLatencyMs - summary.budgetMs}ms.`
    : "Run complete.";
  latencyTicker.set(summary.totalLatencyMs);
  typewrite(el.explanation, summary.explanation);
  renderInspector();
  renderCompare();
}

/* ---------- actions ---------- */

function applyConfig(config) {
  state.config = normaliseConfig(config);
  syncInputs();
  markPresetMatch();
  syncUrl();
  renderInspector();
}

function readInputs() {
  applyConfig({
    cacheHit: inputs.cacheHit.checked,
    staleCache: inputs.staleCache.checked,
    rateLimit: inputs.rateLimit.checked,
    retries: Number(inputs.retries.value),
    timeoutMs: Number(inputs.timeoutMs.value),
    serviceError: inputs.serviceError.checked,
    jitter: inputs.jitter.checked,
  });
}

function selectLayer(layer) {
  state.selectedLayer = layer;
  for (const button of el.layerTabs.querySelectorAll("[data-layer]")) {
    button.setAttribute("aria-pressed", String(button.dataset.layer === layer));
  }
  renderInspector();
}

function run() {
  playback.cancel();
  state.trace = simulateRequest(state.config);
  const { hops, summary } = state.trace;

  downstreamSoFar = 0;
  state.running = true;
  el.run.disabled = true;
  el.stageHint.textContent = "Running.";
  clearChips();
  el.budgetFill.style.width = "0%";
  el.budgetFill.classList.remove("is-over");
  elapsedTicker.set(0, { immediate: true });
  latencyTicker.set(0, { immediate: true });
  downstreamTicker.set(0, { immediate: true });
  el.explanation.textContent = "";

  el.status.textContent = summary.status;
  el.status.dataset.state = statusState(summary);
  el.attempts.textContent = String(summary.attempts);
  el.terminal.textContent = summary.terminalLayer;
  el.pattern.textContent = summary.explanationId.replace(/-/g, " ");

  renderHopTable(hops);
  playback.play(hops);
}

async function copy(text, hintNode, message) {
  try {
    await navigator.clipboard.writeText(text);
    hintNode.textContent = message;
  } catch {
    hintNode.textContent = "Clipboard unavailable. Copy from the address bar instead.";
  }
  setTimeout(() => {
    hintNode.textContent = "";
  }, 2600);
}

/* ---------- bootstrap ---------- */

renderPresets();
renderLayerTabs();
installEstateSearch();
void refreshAtlasStatus();
syncInputs();
markPresetMatch();
syncUrl();
el.budgetTotal.textContent = String(DEFAULT_BUDGET_MS);
selectLayer(state.selectedLayer);
renderCompare();

for (const input of Object.values(inputs)) {
  input.addEventListener("change", readInputs);
}

el.run.addEventListener("click", run);
el.replay.addEventListener("click", () => {
  if (state.trace) run();
});
el.copyLink.addEventListener("click", () => copy(globalThis.location.href, el.stageHint, "Permalink copied."));
el.copyTrace.addEventListener("click", () => {
  if (!state.trace) {
    el.copyHint.textContent = "Run a request first.";
    return;
  }
  copy(JSON.stringify(state.trace, null, 2), el.copyHint, "Trace copied as JSON.");
});
el.pin.addEventListener("click", () => {
  state.pinned = { ...state.config };
  syncUrl();
  renderCompare();
});
el.unpin.addEventListener("click", () => {
  state.pinned = null;
  syncUrl();
  renderCompare();
});

run();
