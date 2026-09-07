import "../shared/shell.js";
import "../../static/js/interaction-target-contract.js";
import {
  FAULTABLE_NODES,
  FAULT_TYPES,
  NODE_IDS,
  RESILIENCE_KEYS,
  applyPropagationStep,
  beginFault,
  createBaselineState,
  propagationFor,
  settleFault,
  stateSummary,
  withResilience,
} from "./cascade-core.js";

const nodeElements = new Map(
  NODE_IDS.map((id) => [id, document.querySelector(`[data-node="${id}"]`)]),
);
const connectionElements = new Map(
  [...document.querySelectorAll("[data-connection]")]
    .map((element) => [element.dataset.connection, element]),
);

const topology = document.querySelector("#cascade-topology");
const connectionLayer = document.querySelector("#cascade-connections");
const faultMenu = document.querySelector("#cascade-fault-menu");
const faultMenuLabel = document.querySelector("#cascade-fault-menu-label");
const instruction = document.querySelector("#cascade-instruction");
const consequence = document.querySelector("#cascade-consequence");
const explanation = document.querySelector("#cascade-explanation");
const rootReadout = document.querySelector("#cascade-root-readout");
const outcomeReadout = document.querySelector("#cascade-outcome-readout");
const previousOutcome = document.querySelector("#cascade-previous-outcome");
const replayButton = document.querySelector("#cascade-replay");
const resetButton = document.querySelector("#cascade-reset");
const summary = document.querySelector("#cascade-state-summary");
const resilienceButtons = new Map(
  RESILIENCE_KEYS.map((key) => [key, document.querySelector(`[data-resilience="${key}"]`)]),
);
const faultButtons = [...document.querySelectorAll("[data-fault-type]")];

const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
const NORMAL_STEP_MS = 340;
let state = createBaselineState();
let selectedNode = null;
let previousSettledOutcome = null;
let runGeneration = 0;

function delay(ms) {
  if (motionQuery.matches || document.hidden || ms <= 0) return Promise.resolve();
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function stateLabel(value) {
  return value.toUpperCase();
}

function rootLabel(rootFault) {
  if (!rootFault) return "NONE";
  const type = rootFault.type === "latency" ? "+LATENCY" : rootFault.type.toUpperCase();
  return `${rootFault.node.toUpperCase()} / ${type}`;
}

function lineStateFor(connection) {
  return state.connections[connection] || "healthy";
}

function renderConnections() {
  for (const [name, element] of connectionElements) {
    element.dataset.state = lineStateFor(name);
  }
}

function renderNodes() {
  for (const [id, element] of nodeElements) {
    if (!element) continue;
    const value = state.nodes[id];
    element.dataset.state = value;
    element.setAttribute("aria-label", `${element.dataset.label}. ${stateLabel(value)}.${FAULTABLE_NODES.includes(id) ? " Select to introduce a fault." : ""}`);
    const stateElement = element.querySelector("[data-node-state]");
    if (stateElement) stateElement.textContent = stateLabel(value);
    const activity = element.querySelector("[data-node-activity]");
    if (activity) activity.dataset.state = value;
  }
}

function renderResilience() {
  for (const [key, button] of resilienceButtons) {
    if (!button) continue;
    const enabled = state.resilience[key];
    button.setAttribute("aria-pressed", String(enabled));
    button.dataset.enabled = String(enabled);
    const value = button.querySelector("[data-toggle-state]");
    if (value) value.textContent = enabled ? "ON" : "OFF";
  }
}

function renderOutcome() {
  instruction.textContent = state.instruction;
  consequence.textContent = state.consequence;
  explanation.textContent = state.explanation;
  rootReadout.textContent = rootLabel(state.rootFault);
  outcomeReadout.textContent = stateLabel(state.nodes.edge);
  replayButton.disabled = !state.rootFault || state.phase === "propagating";
  resetButton.disabled = state.phase === "baseline" && RESILIENCE_KEYS.every((key) => !state.resilience[key]);

  if (previousSettledOutcome && state.phase === "settled") {
    previousOutcome.hidden = false;
    previousOutcome.querySelector("strong").textContent = previousSettledOutcome;
  } else {
    previousOutcome.hidden = true;
  }

  topology.dataset.phase = state.phase;
  summary.textContent = stateSummary(state);
}

function render() {
  renderNodes();
  renderConnections();
  renderResilience();
  renderOutcome();
}

function nodeCenter(element) {
  const topologyRect = topology.getBoundingClientRect();
  const rect = element.getBoundingClientRect();
  return {
    x: rect.left - topologyRect.left + rect.width / 2,
    y: rect.top - topologyRect.top + rect.height / 2,
  };
}

function layoutConnections() {
  if (!topology || !connectionLayer) return;
  const rect = topology.getBoundingClientRect();
  connectionLayer.setAttribute("viewBox", `0 0 ${Math.max(1, rect.width)} ${Math.max(1, rect.height)}`);
  const pairs = {
    "edge-api": ["edge", "api"],
    "api-core": ["api", "core"],
    "core-cache": ["core", "cache"],
    "core-database": ["core", "database"],
    "core-queue": ["core", "queue"],
    "queue-worker": ["queue", "worker"],
  };

  for (const [name, [from, to]] of Object.entries(pairs)) {
    const path = connectionElements.get(name);
    const fromElement = nodeElements.get(from);
    const toElement = nodeElements.get(to);
    if (!path || !fromElement || !toElement) continue;
    const start = nodeCenter(fromElement);
    const end = nodeCenter(toElement);
    const horizontal = Math.abs(end.x - start.x) >= Math.abs(end.y - start.y);
    if (horizontal) {
      const bend = (start.x + end.x) / 2;
      path.setAttribute("d", `M ${start.x} ${start.y} C ${bend} ${start.y}, ${bend} ${end.y}, ${end.x} ${end.y}`);
    } else {
      const bend = (start.y + end.y) / 2;
      path.setAttribute("d", `M ${start.x} ${start.y} C ${start.x} ${bend}, ${end.x} ${bend}, ${end.x} ${end.y}`);
    }
  }
}

function closeFaultMenu({ restoreFocus = false } = {}) {
  if (faultMenu.hidden) return;
  faultMenu.hidden = true;
  const previous = selectedNode;
  selectedNode = null;
  topology.dataset.menuOpen = "false";
  if (restoreFocus && previous) nodeElements.get(previous)?.focus({ preventScroll: true });
}

function positionFaultMenu(element) {
  if (!element || faultMenu.hidden) return;
  const topologyRect = topology.getBoundingClientRect();
  const nodeRect = element.getBoundingClientRect();
  const menuRect = faultMenu.getBoundingClientRect();
  const preferredLeft = nodeRect.right - topologyRect.left + 12;
  const preferredTop = nodeRect.top - topologyRect.top + nodeRect.height / 2 - menuRect.height / 2;
  const left = Math.min(
    Math.max(12, preferredLeft),
    Math.max(12, topologyRect.width - menuRect.width - 12),
  );
  const top = Math.min(
    Math.max(12, preferredTop),
    Math.max(12, topologyRect.height - menuRect.height - 12),
  );
  faultMenu.style.setProperty("--menu-left", `${left}px`);
  faultMenu.style.setProperty("--menu-top", `${top}px`);
}

function openFaultMenu(nodeId) {
  if (!FAULTABLE_NODES.includes(nodeId) || state.phase === "propagating") return;
  selectedNode = nodeId;
  const element = nodeElements.get(nodeId);
  faultMenuLabel.textContent = `${element.dataset.label} fault`;
  faultMenu.hidden = false;
  topology.dataset.menuOpen = "true";
  positionFaultMenu(element);
  faultButtons[0]?.focus({ preventScroll: true });
}

async function runFault(rootFault, { replay = false } = {}) {
  runGeneration += 1;
  const generation = runGeneration;
  closeFaultMenu();

  if (replay && state.phase === "settled") {
    previousSettledOutcome = stateLabel(state.nodes.edge);
  } else if (!replay) {
    previousSettledOutcome = null;
  }

  state = beginFault(state, rootFault);
  render();

  const steps = propagationFor(rootFault, state.resilience);
  for (let index = 0; index < steps.length; index += 1) {
    await delay(index === 0 ? 90 : NORMAL_STEP_MS);
    if (generation !== runGeneration) return;
    state = applyPropagationStep(state, steps[index], index + 1);
    render();
  }
  if (generation !== runGeneration) return;
  state = settleFault(state);
  render();
}

function reset() {
  runGeneration += 1;
  closeFaultMenu();
  state = createBaselineState();
  previousSettledOutcome = null;
  render();
}

for (const [id, element] of nodeElements) {
  if (!element || !FAULTABLE_NODES.includes(id)) continue;
  element.addEventListener("click", () => openFaultMenu(id));
}

for (const button of faultButtons) {
  button.addEventListener("click", () => {
    const type = button.dataset.faultType;
    if (!selectedNode || !FAULT_TYPES.includes(type)) return;
    runFault({ node: selectedNode, type });
  });
}

faultMenu.querySelector("[data-close-menu]")?.addEventListener("click", () => {
  closeFaultMenu({ restoreFocus: true });
});

for (const [key, button] of resilienceButtons) {
  button?.addEventListener("click", () => {
    const wasEnabled = state.resilience[key];
    state = withResilience(state, key, !wasEnabled);
    if (state.phase === "settled" && state.rootFault) {
      state.instruction = "Replay the same fault to compare the outcome.";
      state.consequence = `${button.dataset.label} ${wasEnabled ? "disabled" : "enabled"}.`;
      state.explanation = "The root fault has not been replayed yet. Current node state still shows the previous run.";
    }
    render();
  });
}

replayButton.addEventListener("click", () => {
  if (state.rootFault && state.phase !== "propagating") runFault({ ...state.rootFault }, { replay: true });
});
resetButton.addEventListener("click", reset);

window.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !faultMenu.hidden) {
    event.preventDefault();
    closeFaultMenu({ restoreFocus: true });
    return;
  }
  if (event.key.toLowerCase() === "r" && !event.metaKey && !event.ctrlKey && !event.altKey) {
    const target = event.target;
    const editable = target instanceof HTMLInputElement
      || target instanceof HTMLTextAreaElement
      || target instanceof HTMLSelectElement
      || target?.isContentEditable;
    if (!editable) {
      event.preventDefault();
      reset();
    }
  }
});

document.addEventListener("click", (event) => {
  if (faultMenu.hidden) return;
  const target = event.target instanceof Node ? event.target : null;
  if (!target || faultMenu.contains(target)) return;
  if ([...nodeElements.values()].some((element) => element?.contains(target))) return;
  closeFaultMenu();
});

document.addEventListener("visibilitychange", () => {
  topology.dataset.documentHidden = String(document.hidden);
});

const resizeObserver = typeof ResizeObserver !== "undefined"
  ? new ResizeObserver(() => {
      window.requestAnimationFrame(() => {
        layoutConnections();
        if (selectedNode) positionFaultMenu(nodeElements.get(selectedNode));
      });
    })
  : null;
resizeObserver?.observe(topology);
window.addEventListener("resize", layoutConnections, { passive: true });
window.addEventListener("pagehide", () => resizeObserver?.disconnect(), { once: true });

motionQuery.addEventListener?.("change", () => {
  topology.dataset.reducedMotion = String(motionQuery.matches);
});
topology.dataset.reducedMotion = String(motionQuery.matches);

render();
window.requestAnimationFrame(layoutConnections);
