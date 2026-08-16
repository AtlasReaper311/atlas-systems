import "../shared/shell.js";
import "../../static/js/interaction-target-contract.js";
import {
  MODE_EVENTUAL,
  MODE_QUORUM,
  NETWORK_CLEAN,
  NETWORK_ISOLATE_C,
  NETWORK_SLOW_B,
  advanceConsensus,
  beginWrite,
  canBeginWrite,
  createConsensusState,
  nextWriteValue,
  quorumCount,
  resetConsensus,
  setMode,
  setNetwork,
  stateSummary,
} from "./consensus-core.js";

const instrument = document.querySelector("#consensus-instrument");
const stream = document.querySelector("#consensus-stream");
const writeButton = document.querySelector("#consensus-write");
const resetButton = document.querySelector("#consensus-reset");
const partition = document.querySelector("#consensus-partition");
const summary = document.querySelector("#consensus-state-summary");
const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
const modeButtons = [...document.querySelectorAll("[data-mode]")].filter((el) => el.tagName === "BUTTON");
const networkButtons = [...document.querySelectorAll("[data-network]")].filter((el) => el.tagName === "BUTTON");
const laneValue = Object.fromEntries(["A", "B", "C"].map((id) => [id, document.querySelector(`[data-lane-value="${id}"]`)]));
const laneVersion = Object.fromEntries(["A", "B", "C"].map((id) => [id, document.querySelector(`[data-lane-version="${id}"]`)]));
const logTargets = Object.fromEntries(["A", "B", "C"].map((id) => [id, document.querySelector(`[data-log="${id}"]`)]));

let state = createConsensusState();
let lastFrame = performance.now();
let animationFrame = 0;

function eventById(id) { return state.events.find((event) => event.id === id); }
function fmt(ms) { return `${String(Math.round(ms)).padStart(4, "0")} ms`; }
function phaseLabel() {
  const txn = state.transactions[0];
  if (!txn) return "READY";
  if (txn.status === "converged") return "CONVERGED";
  if (txn.committedAt !== null && state.convergedVersion < txn.version) return "COMMITTED / CATCH-UP";
  if (txn.acks.length >= 2) return "QUORUM";
  return state.mode === MODE_EVENTUAL ? "ACCEPTED / PROPAGATING" : "PROPOSING";
}
function linkLabel(id) {
  if (state.network === NETWORK_ISOLATE_C && id === "C") return "ISOLATED";
  if (state.network === NETWORK_SLOW_B && id === "B") return "2500 ms";
  return id === "B" ? "520 ms" : "760 ms";
}

function renderLogs() {
  for (const id of ["A", "B", "C"]) {
    const node = state.nodes[id];
    laneValue[id].textContent = node.value;
    laneVersion[id].textContent = `v${node.version}`;
    logTargets[id].replaceChildren(...node.log.map((entry) => {
      const span = document.createElement("span");
      span.className = "consensus-log-entry";
      span.dataset.status = entry.status;
      span.textContent = `v${entry.version}`;
      span.title = `${entry.value} / ${entry.status}`;
      return span;
    }));
  }
}

function packet(route, label, kind = "proposal") {
  const el = document.createElement("div");
  el.className = "consensus-packet";
  el.dataset.route = route;
  el.dataset.kind = kind;
  const span = document.createElement("span");
  span.textContent = label;
  el.append(span);
  return el;
}
function eventCell(node, cls, text) {
  const el = document.createElement("div");
  el.className = `consensus-event consensus-event--${node.toLowerCase()} ${cls}`;
  el.textContent = text;
  return el;
}
function renderEvent(event) {
  switch (event.type) {
    case "write": return eventCell("A", "consensus-write-event", `WRITE v${event.version} / ${event.value}`);
    case "append": return eventCell(event.node, "consensus-append-event", `APPEND v${event.version} / ${event.value || ""}`);
    case "proposal-send": return packet(`A-${event.node}`, `PROPOSE v${event.version} → ${event.node}`);
    case "ack-send": return packet(`${event.node}-A`, `ACK v${event.version} ← ${event.node}`, "ack");
    case "ack-arrive": return eventCell("A", "consensus-append-event", `ACK ${event.node} / ${event.acknowledgements.length} OF 3`);
    case "commit": {
      const el = document.createElement("div");
      el.className = "consensus-commit-front";
      el.textContent = `COMMIT FRONT / v${event.version} / QUORUM ${event.acknowledgements.length} OF 3`;
      return el;
    }
    case "apply": return eventCell(event.node, "consensus-apply-event", `APPLY COMMIT v${event.version}`);
    case "accepted": return eventCell("A", "consensus-write-event", `LATEST ACCEPTED → v${event.version}`);
    case "partition-drop": {
      const el = document.createElement("div");
      el.className = "consensus-drop";
      el.textContent = `PROPOSE v${event.version} DROPPED / C ISOLATED`;
      return el;
    }
    case "heal": return eventCell("C", "consensus-apply-event", "LINK HEALED / CATCH-UP REQUESTED");
    case "catchup-send": return packet("A-C", `CATCH-UP v${event.fromVersion}→v${event.toVersion}`, "catchup");
    case "catchup-arrive": return eventCell("C", "consensus-append-event", `BACKFILL v${event.version}`);
    case "converged": {
      const el = document.createElement("div");
      el.className = "consensus-converged-front";
      el.textContent = `FULLY CONVERGED / v${event.version} / 3 OF 3`;
      return el;
    }
    default: return null;
  }
}
function renderTransactions() {
  const fragment = document.createDocumentFragment();
  for (const [index, txn] of state.transactions.entries()) {
    const group = document.createElement("section");
    group.className = "consensus-transaction";
    group.dataset.current = String(index === 0);
    const head = document.createElement("div");
    head.className = "consensus-transaction-head";
    head.innerHTML = `<strong>v${txn.version} / ${txn.value}</strong><span>${txn.mode.toUpperCase()} · ${txn.network.toUpperCase()} · ${txn.status.toUpperCase()}</span>`;
    group.append(head);
    const events = txn.events.map(eventById).filter(Boolean).sort((a, b) => a.at - b.at || a.id - b.id);
    for (const event of events) {
      const el = renderEvent(event);
      if (el) group.append(el);
    }
    fragment.append(group);
  }
  stream.replaceChildren(fragment);
}
function renderTruth() {
  document.querySelector("#consensus-accepted").textContent = state.acceptedValue;
  document.querySelector("#consensus-accepted-version").textContent = `v${state.acceptedVersion}`;
  document.querySelector("#consensus-committed").textContent = state.committedValue;
  document.querySelector("#consensus-committed-version").textContent = `v${state.committedVersion}`;
  document.querySelector("#consensus-converged").textContent = state.convergedValue;
  document.querySelector("#consensus-converged-version").textContent = `v${state.convergedVersion}`;
  const count = quorumCount(state);
  document.querySelector("#consensus-quorum").textContent = `${count} / 3`;
  document.querySelector("#consensus-quorum-bar").style.width = `${Math.min(100, (count / 3) * 100)}%`;
}
function renderControls() {
  instrument.dataset.mode = state.mode;
  instrument.dataset.network = state.network;
  for (const button of modeButtons) button.setAttribute("aria-pressed", String(button.dataset.mode === state.mode));
  for (const button of networkButtons) button.setAttribute("aria-pressed", String(button.dataset.network === state.network));
  writeButton.disabled = !canBeginWrite(state);
  document.querySelector("#consensus-next-value").textContent = nextWriteValue(state);
  partition.hidden = state.network !== NETWORK_ISOLATE_C;
  document.querySelector("#consensus-phase").textContent = phaseLabel();
  document.querySelector("#consensus-link-b").textContent = linkLabel("B");
  document.querySelector("#consensus-link-c").textContent = linkLabel("C");
  document.querySelector("#consensus-clock").textContent = fmt(state.now);
}
function render({ scroll = false } = {}) {
  renderControls();
  renderTruth();
  renderLogs();
  renderTransactions();
  summary.textContent = stateSummary(state);
  if (scroll && !motionQuery.matches) stream.scrollTo({ top: 0, behavior: "smooth" });
}

for (const button of modeButtons) button.addEventListener("click", () => {
  state = setMode(state, button.dataset.mode);
  render();
});
for (const button of networkButtons) button.addEventListener("click", () => {
  state = setNetwork(state, button.dataset.network);
  render({ scroll: true });
});
writeButton.addEventListener("click", () => {
  state = beginWrite(state);
  render({ scroll: true });
});
resetButton.addEventListener("click", () => {
  state = resetConsensus(state);
  render();
});
window.addEventListener("keydown", (event) => {
  if (event.key.toLowerCase() === "r" && !event.metaKey && !event.ctrlKey && !event.altKey && !(event.target?.matches?.("input,textarea,select") || event.target?.isContentEditable)) {
    event.preventDefault();
    state = resetConsensus(state);
    render();
  }
});

function tick(timestamp) {
  animationFrame = requestAnimationFrame(tick);
  if (document.hidden) {
    lastFrame = timestamp;
    return;
  }
  const delta = Math.min(90, Math.max(0, timestamp - lastFrame));
  lastFrame = timestamp;
  const before = state.events.at(-1)?.id || 0;
  state = advanceConsensus(state, motionQuery.matches ? Math.max(delta, 140) : delta);
  const after = state.events.at(-1)?.id || 0;
  if (after !== before || Math.floor(state.now / 100) !== Math.floor((state.now - delta) / 100)) render({ scroll: after !== before });
}
render();
animationFrame = requestAnimationFrame((timestamp) => {
  lastFrame = timestamp;
  tick(timestamp);
});
window.addEventListener("pagehide", () => cancelAnimationFrame(animationFrame), { once: true });
