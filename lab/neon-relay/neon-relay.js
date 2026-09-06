import "../shared/shell.js";
import "../../static/js/interaction-target-contract.js";
import {
  OUTPUT_IDS,
  PRESETS,
  PRESET_BY_ID,
  RELAY_IDS,
  TRACE_IDS,
  cutPower,
  cycleRelay,
  energizeCircuit,
  createCircuitState,
  resetFuse,
  resetPatch,
  selectPreset,
  stateSummary,
} from "./neon-relay-core.js";

const relayButtons = new Map(RELAY_IDS.map((id) => [id, document.querySelector(`[data-relay="${id}"]`)]));
const traceGroups = new Map(TRACE_IDS.map((id) => [id, document.querySelector(`[data-trace="${id}"]`)]));
const outputGroups = new Map(OUTPUT_IDS.map((id) => [id, document.querySelector(`[data-output="${id}"]`)]));
const presetButtons = new Map(PRESETS.map(({ id }) => [id, document.querySelector(`[data-preset="${id}"]`)]));

const boardShell = document.querySelector("#nr-board-shell");
const board = document.querySelector("#nr-board");
const source = document.querySelector(".nr-source");
const sourceVoltage = document.querySelector(".nr-source__voltage");
const challengeName = document.querySelector("#nr-challenge-name");
const challengeNumber = document.querySelector("#nr-challenge-number");
const brief = document.querySelector("#nr-brief");
const target = document.querySelector("#nr-target");
const ruleReadout = document.querySelector("#nr-rule");
const hazardReadout = document.querySelector("#nr-hazard");
const topologyReadout = document.querySelector("#nr-topology");
const phaseReadout = document.querySelector("#nr-phase");
const voltageReadout = document.querySelector("#nr-voltage");
const drawReadout = document.querySelector("#nr-draw");
const stabilityReadout = document.querySelector("#nr-stability");
const scopeState = document.querySelector("#nr-scope-state");
const scopeCanvas = document.querySelector("#nr-scope");
const messageState = document.querySelector("#nr-message-state");
const message = document.querySelector("#nr-message");
const powerButton = document.querySelector("#nr-power");
const fuseResetButton = document.querySelector("#nr-fuse-reset");
const resetButton = document.querySelector("#nr-reset");
const nextButton = document.querySelector("#nr-next");
const hintButton = document.querySelector("#nr-hint-toggle");
const hintCopy = document.querySelector("#nr-hint-copy");
const trip = document.querySelector("#nr-trip");
const tripReason = document.querySelector("#nr-trip-reason");
const summary = document.querySelector("#nr-state-summary");
const progress = document.querySelector("#nr-progress");
const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");

const ROUTE_LABELS = Object.freeze({
  r1: Object.freeze({ open: "OPEN", a: "A / BEACON", b: "B / R3" }),
  r2: Object.freeze({ open: "OPEN", a: "A / ARCHIVE", b: "B / R3" }),
  r3: Object.freeze({ open: "OPEN", a: "A / ACTUATOR", b: "B / R4" }),
  r4: Object.freeze({ open: "OPEN", a: "A / BEACON", b: "B / GROUND" }),
});

let state = createCircuitState();
let scopeFrame = 0;
let scopeStart = performance.now();
let lastScopeTime = 0;
let hintVisible = false;
const solvedChallenges = new Set();

function phaseLabel(value) {
  return value.toUpperCase();
}

function targetLabel(id) {
  return id.charAt(0).toUpperCase() + id.slice(1);
}

function currentPresetIndex() {
  return PRESETS.findIndex(({ id }) => id === state.presetId);
}

function renderChallenge() {
  const preset = PRESET_BY_ID[state.presetId];
  for (const [id, button] of presetButtons) {
    if (!button) continue;
    button.setAttribute("aria-pressed", String(id === state.presetId));
    button.dataset.solved = String(solvedChallenges.has(id));
  }
  challengeNumber.textContent = preset.index;
  challengeName.textContent = preset.name.toUpperCase();
  brief.textContent = preset.brief;
  ruleReadout.textContent = preset.rule;
  hazardReadout.textContent = preset.hazard;
  topologyReadout.textContent = preset.topology;
  boardShell.dataset.challenge = preset.id;
  board.dataset.sourceCount = String(preset.sourceFeeders.length);

  for (const id of OUTPUT_IDS) {
    const targetItem = target.querySelector(`[data-target-output="${id}"]`);
    if (targetItem) {
      targetItem.dataset.required = String(preset.target[id] > 0);
      targetItem.dataset.forbidden = String(preset.forbiddenOutputs.includes(id));
      targetItem.querySelector("b").textContent = String(preset.target[id]);
    }
    const output = outputGroups.get(id);
    if (output) output.dataset.interlock = String(preset.forbiddenOutputs.includes(id));
  }

  hintCopy.textContent = preset.hint;
  hintCopy.hidden = !hintVisible;
  hintButton.setAttribute("aria-expanded", String(hintVisible));
  hintButton.textContent = hintVisible ? "HIDE HINT" : "SHOW HINT";
  progress.textContent = `${solvedChallenges.size} / ${PRESETS.length} SOLVED`;
}

function renderRelays() {
  const preset = PRESET_BY_ID[state.presetId];
  for (const [id, button] of relayButtons) {
    if (!button) continue;
    const position = state.relays[id];
    const route = ROUTE_LABELS[id][position];
    const locked = Object.hasOwn(preset.lockedRelays, id);
    button.dataset.position = position;
    button.dataset.locked = String(locked);
    button.disabled = locked;
    button.querySelector("[data-relay-route]").textContent = locked ? "ISOLATED" : route;
    button.setAttribute(
      "aria-label",
      locked
        ? `Relay ${id.toUpperCase()} is isolated for this challenge.`
        : `Relay ${id.toUpperCase()}. ${position === "open" ? "Open" : `Position ${position.toUpperCase()}, ${route.slice(4)}`}. Select to cycle route.`,
    );
  }
}

function traceAvailability(traceId) {
  const preset = PRESET_BY_ID[state.presetId];
  if (preset.blockedEdges.includes(traceId)) return "blocked";
  if (traceId === "source-r1" && !preset.sourceFeeders.includes("r1")) return "isolated";
  if (traceId === "source-r2" && !preset.sourceFeeders.includes("r2")) return "isolated";
  return "available";
}

function traceState(traceId) {
  const evaluation = state.evaluation;
  const availability = traceAvailability(traceId);
  const load = evaluation.traceLoads[traceId] || 0;
  const overloaded = evaluation.overloadedTraceIds.includes(traceId);
  const isDumpFault = evaluation.short && traceId === "r4-dump" && load > 0;

  if (availability === "isolated") return "isolated";
  if (state.phase === "tripped") {
    if (isDumpFault) return "fault";
    if (overloaded) return "overload";
    if (load > 0) return "fault";
    if (availability === "blocked") return "blocked";
    return "off";
  }
  if (availability === "blocked") return "blocked";
  if (state.powered && load > 0) return "active";
  return "off";
}

function renderTraces() {
  for (const [id, group] of traceGroups) {
    if (!group) continue;
    group.dataset.state = traceState(id);
    group.dataset.availability = traceAvailability(id);
    group.dataset.load = String(state.evaluation.traceLoads[id] || 0);
  }
}

function renderOutputs() {
  const preset = PRESET_BY_ID[state.presetId];
  for (const [id, group] of outputGroups) {
    if (!group) continue;
    const count = state.evaluation.outputs[id];
    const targetCount = preset.target[id];
    const active = state.powered && count > 0;
    const interlocked = preset.forbiddenOutputs.includes(id);
    const trippedHere = state.evaluation.interlockedOutputs.includes(id);
    group.dataset.state = trippedHere ? "interlock" : active ? (count > 1 ? "overload" : "on") : "off";
    group.dataset.match = String(count === targetCount);
    group.dataset.interlock = String(interlocked);
    const countLabel = group.querySelector(".nr-output__count");
    if (countLabel) countLabel.textContent = interlocked ? "INTERLOCK" : `${count} ${count === 1 ? "FEED" : "FEEDS"}`;
    group.setAttribute("aria-label", `${targetLabel(id)} output. ${interlocked ? "Protected by interlock. " : ""}${active ? `${count} feed${count === 1 ? "" : "s"}` : "off"}. Target ${targetCount}.`);
  }
}

function renderMeasurements() {
  const evaluation = state.evaluation;
  const voltage = state.powered ? evaluation.voltage : 0;
  phaseReadout.textContent = phaseLabel(state.phase);
  voltageReadout.textContent = `${voltage.toFixed(1)} V`;
  sourceVoltage.textContent = `${voltage.toFixed(1)} V`;
  drawReadout.textContent = `${state.powered ? evaluation.sourceDraw : 0} / ${PRESET_BY_ID[state.presetId].sourceFeeders.length}`;
  stabilityReadout.textContent = `${state.phase === "tripped" ? 0 : evaluation.stability}%`;
  scopeState.textContent = phaseLabel(state.phase);
  source.dataset.sourceState = state.phase === "tripped" ? "tripped" : state.powered ? "on" : "off";
}

function renderMessage() {
  if (state.phase === "locked") solvedChallenges.add(state.presetId);
  messageState.textContent = state.phase === "locked"
    ? "CHALLENGE SOLVED"
    : state.phase === "tripped"
      ? "PROTECTION ACTIVE"
      : state.powered
        ? "CIRCUIT LIVE"
        : "READY TO TEST";
  message.textContent = state.message;
  powerButton.textContent = state.powered ? "CUT POWER" : "ENERGISE";
  powerButton.disabled = state.fuseOpen;
  fuseResetButton.disabled = !state.fuseOpen;
  trip.hidden = state.phase !== "tripped";
  if (state.phase === "tripped") tripReason.textContent = state.evaluation.fault || "PROTECTION OPEN";

  const index = currentPresetIndex();
  nextButton.hidden = state.phase !== "locked";
  if (state.phase === "locked") {
    nextButton.textContent = index < PRESETS.length - 1 ? `NEXT / ${PRESETS[index + 1].name.toUpperCase()}` : "REPLAY / IGNITION";
  }
}

function render() {
  boardShell.dataset.phase = state.phase;
  boardShell.dataset.fuse = state.fuseOpen ? "open" : "closed";
  boardShell.dataset.reducedMotion = String(motionQuery.matches);
  renderChallenge();
  renderRelays();
  renderTraces();
  renderOutputs();
  renderMeasurements();
  renderMessage();
  summary.textContent = stateSummary(state);
  progress.textContent = `${solvedChallenges.size} / ${PRESETS.length} SOLVED`;
}

function setPreset(presetId) {
  state = selectPreset(state, presetId);
  hintVisible = false;
  render();
  scopeStart = performance.now();
}

for (const [id, button] of presetButtons) button?.addEventListener("click", () => setPreset(id));
for (const [id, button] of relayButtons) {
  button?.addEventListener("click", (event) => {
    state = cycleRelay(state, id, event.shiftKey ? -1 : 1);
    render();
  });
}

powerButton.addEventListener("click", () => {
  state = state.powered ? cutPower(state) : energizeCircuit(state);
  render();
});
fuseResetButton.addEventListener("click", () => {
  state = resetFuse(state);
  render();
});
resetButton.addEventListener("click", () => {
  state = resetPatch(state);
  render();
  scopeStart = performance.now();
});
nextButton.addEventListener("click", () => {
  const index = currentPresetIndex();
  setPreset(PRESETS[(index + 1) % PRESETS.length].id);
});
hintButton.addEventListener("click", () => {
  hintVisible = !hintVisible;
  renderChallenge();
});

window.addEventListener("keydown", (event) => {
  const targetElement = event.target;
  const editable = targetElement instanceof HTMLInputElement || targetElement instanceof HTMLTextAreaElement || targetElement instanceof HTMLSelectElement || targetElement?.isContentEditable;
  if (editable || event.metaKey || event.ctrlKey || event.altKey) return;

  if (event.key.toLowerCase() === "r") {
    event.preventDefault();
    state = resetPatch(state);
    render();
    scopeStart = performance.now();
    return;
  }

  const challengeIndex = Number.parseInt(event.key, 10);
  if (challengeIndex >= 1 && challengeIndex <= PRESETS.length) {
    event.preventDefault();
    setPreset(PRESETS[challengeIndex - 1].id);
  }
});

function drawScope(timestamp) {
  scopeFrame = window.requestAnimationFrame(drawScope);
  if (!scopeCanvas || document.hidden) return;
  if (motionQuery.matches && timestamp - lastScopeTime < 500) return;
  if (!motionQuery.matches && timestamp - lastScopeTime < 34) return;
  lastScopeTime = timestamp;

  const context = scopeCanvas.getContext("2d");
  if (!context) return;
  const width = scopeCanvas.width;
  const height = scopeCanvas.height;
  context.clearRect(0, 0, width, height);

  context.strokeStyle = "rgba(120,232,255,0.075)";
  context.lineWidth = 1;
  for (let x = 0; x <= width; x += 36) {
    context.beginPath(); context.moveTo(x, 0); context.lineTo(x, height); context.stroke();
  }
  for (let y = 0; y <= height; y += 26) {
    context.beginPath(); context.moveTo(0, y); context.lineTo(width, y); context.stroke();
  }

  const evaluation = state.evaluation;
  const powered = state.powered;
  const tripped = state.phase === "tripped";
  const elapsed = (timestamp - scopeStart) / 1000;
  const amplitude = tripped ? 34 : powered ? 11 + evaluation.sourceDraw * 7 : 1.5;
  const frequency = tripped ? 0.13 : state.phase === "locked" ? 0.045 : 0.06;
  const offset = motionQuery.matches ? 0 : elapsed * (tripped ? 11 : 4.4);
  context.strokeStyle = tripped ? "rgba(255,102,117,0.94)" : powered ? "rgba(120,232,255,0.94)" : "rgba(170,169,160,0.3)";
  context.lineWidth = tripped ? 2.2 : 1.5;
  context.beginPath();
  for (let x = 0; x <= width; x += 3) {
    const normalized = x / width;
    const harmonic = Math.sin((x + offset * 22) * frequency) * amplitude;
    const carrier = powered ? Math.sin((x + offset * 16) * frequency * 3.1) * amplitude * 0.18 : 0;
    const tripSpike = tripped ? Math.sin((x + offset * 44) * 0.51) * (1 - normalized) * 10 : 0;
    const y = height / 2 + harmonic + carrier + tripSpike;
    if (x === 0) context.moveTo(x, y); else context.lineTo(x, y);
  }
  context.stroke();

  if (state.phase === "locked") {
    context.fillStyle = "rgba(101,240,181,0.82)";
    context.fillRect(width - 30, 8, 20, 3);
  }
}

motionQuery.addEventListener?.("change", () => {
  boardShell.dataset.reducedMotion = String(motionQuery.matches);
  scopeStart = performance.now();
});
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) scopeStart = performance.now();
});
window.addEventListener("pagehide", () => {
  if (scopeFrame) window.cancelAnimationFrame(scopeFrame);
}, { once: true });

render();
scopeFrame = window.requestAnimationFrame(drawScope);
