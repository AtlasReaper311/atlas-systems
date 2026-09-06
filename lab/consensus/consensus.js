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
  replicaLag,
  resetConsensus,
  setMode,
  setNetwork,
  stateSummary,
} from "./consensus-core.js";

const SVG_NS = "http://www.w3.org/2000/svg";
const NODE_IDS = ["A", "B", "C"];
const instrument = document.querySelector("#consensus-instrument");
const writeButton = document.querySelector("#consensus-write");
const resetButton = document.querySelector("#consensus-reset");
const summary = document.querySelector("#consensus-state-summary");
const core = document.querySelector("#consensus-core");
const packetLayer = document.querySelector("#consensus-packet-layer");
const pathB = document.querySelector("#consensus-link-path-b");
const pathC = document.querySelector("#consensus-link-path-c");
const history = document.querySelector("#consensus-history");
const partitionBadge = document.querySelector("#consensus-partition-badge");
const inspector = document.querySelector("#consensus-node-inspector");
const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
const modeButtons = [...document.querySelectorAll("button[data-mode]")];
const networkButtons = [...document.querySelectorAll("button[data-network]")];
const nodeButtons = Object.fromEntries(NODE_IDS.map((id) => [id, document.querySelector(`button[data-node="${id}"]`)]));
const protocolStages = [...document.querySelectorAll(".consensus-protocol__rail li")];

let state = createConsensusState();
let selectedNode = null;
let lastFrame = performance.now();
let animationFrame = 0;
let lastRenderedBucket = -1;
let lastPulsedCommit = 0;

function clamp(value, min, max) { return Math.min(max, Math.max(min, value)); }
function fmt(ms) { return `${String(Math.round(ms)).padStart(4, "0")} ms`; }
function latestTxn() { return state.transactions[0] || null; }
function eventsFor(txn) { return txn ? txn.events.map((id) => state.events.find((event) => event.id === id)).filter(Boolean) : []; }
function hasEvent(txn, type, node = null) { return eventsFor(txn).some((event) => event.type === type && (node === null || event.node === node)); }
function countEvents(txn, type) { return eventsFor(txn).filter((event) => event.type === type).length; }
function latestEvent(txn, type, node = null) {
  const events = eventsFor(txn);
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];
    if (event.type === type && (node === null || event.node === node)) return event;
  }
  return null;
}

function phaseLabel() {
  const txn = latestTxn();
  if (!txn) return "READY";
  if (txn.convergedAt !== null) return "CONVERGED";
  if (state.network === NETWORK_ISOLATE_C && state.nodes.C.version < state.nodes.A.version) return txn.committedAt !== null ? "COMMITTED / PARTITIONED" : "PROPOSING / PARTITIONED";
  if (txn.committedAt !== null && state.convergedVersion < txn.version) return state.mode === MODE_EVENTUAL ? "ACCEPTED / PROPAGATING" : "COMMITTED / APPLYING";
  if (txn.acks.length >= 2) return "QUORUM";
  return "PROPOSING";
}
function linkLabel(id) {
  if (state.network === NETWORK_ISOLATE_C && id === "C") return "ISOLATED";
  if (state.network === NETWORK_SLOW_B && id === "B") return "2500 ms";
  return id === "B" ? "520 ms" : "760 ms";
}
function nodeState(id) {
  const txn = latestTxn();
  if (id === "C" && state.network === NETWORK_ISOLATE_C) return "ISOLATED";
  const lag = replicaLag(state, id);
  if (lag > 0) return `STALE +${lag}`;
  if (!txn) return "SYNCED";
  if (txn.convergedAt !== null) return "SYNCED";
  if (txn.acks.includes(id)) return id === "A" && txn.committedAt === null ? "PROPOSED" : "ACKED";
  if (state.nodes[id].version >= txn.version) return "APPENDED";
  return "WAITING";
}
function nodeLinkLabel(id) { return id === "A" ? "LEADER" : linkLabel(id); }

function renderControls() {
  instrument.dataset.mode = state.mode;
  instrument.dataset.network = state.network;
  instrument.dataset.phase = phaseLabel().toLowerCase().replaceAll(" / ", "-").replaceAll(" ", "-");
  modeButtons.forEach((button) => button.setAttribute("aria-pressed", String(button.dataset.mode === state.mode)));
  networkButtons.forEach((button) => button.setAttribute("aria-pressed", String(button.dataset.network === state.network)));
  writeButton.disabled = !canBeginWrite(state);
  document.querySelector("#consensus-next-value").textContent = nextWriteValue(state);
  document.querySelector("#consensus-clock").textContent = fmt(state.now);
  document.querySelector("#consensus-phase").textContent = phaseLabel();
  document.querySelector("#consensus-link-b").textContent = linkLabel("B");
  document.querySelector("#consensus-link-c").textContent = linkLabel("C");
  document.querySelector("#consensus-truth").textContent = `v${state.convergedVersion} / ${state.convergedVersion === state.acceptedVersion ? "CONVERGED" : "DIVERGED"}`;
  partitionBadge.hidden = state.network !== NETWORK_ISOLATE_C;
}

function renderNodes() {
  for (const id of NODE_IDS) {
    const node = state.nodes[id];
    const button = nodeButtons[id];
    button.querySelector(`[data-node-value="${id}"]`).textContent = node.value;
    button.querySelector(`[data-node-version="${id}"]`).textContent = `v${node.version}`;
    const stateText = nodeState(id);
    button.querySelector(`[data-node-state="${id}"]`).textContent = stateText;
    button.dataset.state = stateText.toLowerCase().replaceAll(" ", "-").replaceAll("+", "");
    button.setAttribute("aria-label", `Replica ${id}, ${node.role}. Local value ${node.value}, version ${node.version}. ${stateText}.`);
    const log = button.querySelector(`[data-node-log="${id}"]`);
    log.replaceChildren(...node.log.slice(-5).map((entry) => {
      const mark = document.createElement("i");
      mark.dataset.status = entry.status;
      mark.title = `v${entry.version} ${entry.value} ${entry.status}`;
      return mark;
    }));
  }
}

function renderCore() {
  const txn = latestTxn();
  const count = quorumCount(state);
  core.dataset.acks = String(count);
  core.dataset.state = !txn || txn.convergedAt !== null ? "converged" : txn.committedAt !== null ? "committed" : "pending";
  document.querySelector("#consensus-core-value").textContent = state.committedValue;
  document.querySelector("#consensus-core-version").textContent = `VERSION ${state.committedVersion}`;
  document.querySelector("#consensus-core-quorum").textContent = `${count} / 3 ${txn && txn.committedAt === null ? "ACK" : "AGREE"}`;
  document.querySelector("#consensus-core-accepted").textContent = state.acceptedValue;
  document.querySelector("#consensus-core-accepted-version").textContent = `v${state.acceptedVersion}`;
  document.querySelector("#consensus-core-converged").textContent = state.convergedValue;
  document.querySelector("#consensus-core-converged-version").textContent = `v${state.convergedVersion}`;
  if (state.committedVersion > lastPulsedCommit) {
    lastPulsedCommit = state.committedVersion;
    if (!motionQuery.matches) {
      core.dataset.pulse = "true";
      window.setTimeout(() => { core.dataset.pulse = "false"; }, 560);
    }
  }
}

function stageStates() {
  const txn = latestTxn();
  if (!txn) return Array(6).fill("idle");
  const followerAppends = countEvents(txn, "append") - 1;
  const applies = countEvents(txn, "apply");
  if (txn.convergedAt !== null) return Array(6).fill("done");
  if (state.mode === MODE_EVENTUAL) {
    const states = ["done", "active", "idle", "done", "idle", "idle"];
    if (followerAppends > 0) { states[1] = "done"; states[2] = "active"; }
    if (txn.acks.length > 1) { states[2] = "done"; states[4] = "active"; }
    if (state.nodes.B.version >= txn.version && state.nodes.C.version >= txn.version) { states[4] = "done"; states[5] = "active"; }
    return states;
  }
  const states = ["active", "idle", "idle", "idle", "idle", "idle"];
  if (followerAppends > 0 || hasEvent(txn, "partition-drop")) { states[0] = "done"; states[1] = "active"; }
  if (followerAppends > 0) { states[1] = "done"; states[2] = "active"; }
  if (txn.acks.length >= 2) { states[2] = "done"; states[3] = txn.committedAt !== null ? "done" : "active"; }
  if (txn.committedAt !== null) { states[3] = "done"; states[4] = "active"; }
  if (applies > 0) { states[4] = "done"; states[5] = "active"; }
  return states;
}
function renderProtocol() {
  const txn = latestTxn();
  const labels = state.mode === MODE_EVENTUAL
    ? [["ACCEPT", "Leader advances"], ["PROPAGATE", "Leader sends"], ["APPEND", "Follower stores"], ["ACK", "Receipt returns"], ["CATCH-UP", "Replicas close lag"], ["CONVERGE", "All replicas agree"]]
    : [["PROPOSE", "Leader sends"], ["APPEND", "Follower stores"], ["ACK", "Follower returns"], ["COMMIT", "Quorum safe"], ["APPLY", "Replica applies"], ["CONVERGE", "All replicas agree"]];
  const states = stageStates();
  protocolStages.forEach((item, index) => {
    item.dataset.state = states[index];
    item.querySelector("strong").textContent = labels[index][0];
    item.querySelector("b").textContent = labels[index][1];
  });
  document.querySelector("#consensus-protocol-write").textContent = txn ? `v${txn.version} / ${txn.value} / ${txn.status.toUpperCase()}` : "NO WRITE YET";
}

function sendStartFor(item) {
  const txn = state.transactions.find((candidate) => candidate.version === item.txnVersion);
  if (!txn) return state.now;
  if (item.type === "proposal-arrive") return latestEvent(txn, "proposal-send", item.node)?.at ?? txn.startedAt;
  if (item.type === "ack-arrive") return latestEvent(txn, "ack-send", item.node)?.at ?? txn.startedAt;
  if (item.type === "catchup-arrive") return latestEvent(txn, "catchup-send", item.node)?.at ?? txn.startedAt;
  return state.now;
}
function createSvgElement(tag) { return document.createElementNS(SVG_NS, tag); }
function renderPackets() {
  packetLayer.replaceChildren();
  const active = state.queue.filter((item) => ["proposal-arrive", "ack-arrive", "catchup-arrive"].includes(item.type));
  for (const item of active) {
    const path = item.node === "B" ? pathB : pathC;
    if (!path) continue;
    const start = sendStartFor(item);
    const duration = Math.max(1, item.at - start);
    let progress = clamp((state.now - start) / duration, 0, 1);
    const kind = item.type === "ack-arrive" ? "ack" : item.type === "catchup-arrive" ? "catchup" : "proposal";
    if (kind === "ack") progress = 1 - progress;
    const point = path.getPointAtLength(path.getTotalLength() * progress);
    const group = createSvgElement("g");
    group.dataset.kind = kind;
    const dot = createSvgElement("circle");
    dot.classList.add("consensus-packet-dot");
    dot.dataset.kind = kind;
    dot.setAttribute("cx", String(point.x)); dot.setAttribute("cy", String(point.y)); dot.setAttribute("r", "6");
    dot.setAttribute("filter", "url(#consensus-glow)");
    const text = createSvgElement("text");
    text.classList.add("consensus-packet-label");
    text.setAttribute("x", String(point.x + 10)); text.setAttribute("y", String(point.y - 10));
    text.textContent = kind === "ack" ? `ACK v${item.txnVersion}` : kind === "catchup" ? `CATCH-UP v${item.txnVersion}` : `PROPOSE v${item.txnVersion}`;
    group.append(dot, text); packetLayer.append(group);
  }
}

function renderHistory() {
  if (!state.transactions.length) {
    const p = document.createElement("p");
    p.textContent = "Write a value to begin the cluster history.";
    history.replaceChildren(p);
    return;
  }
  history.replaceChildren(...state.transactions.slice(0, 4).map((txn) => {
    const card = document.createElement("article");
    card.className = "consensus-history-card";
    card.dataset.status = txn.status;
    const meta = document.createElement("span");
    const version = document.createElement("i"); version.textContent = `v${txn.version}`;
    const network = document.createElement("i"); network.textContent = txn.network.toUpperCase();
    meta.append(version, network);
    const value = document.createElement("strong"); value.textContent = txn.value;
    const status = document.createElement("b"); status.textContent = `${txn.mode.toUpperCase()} / ${txn.status.toUpperCase()} / ${txn.acks.length} OF 3 ACK`;
    card.append(meta, value, status);
    return card;
  }));
}

function renderInspector() {
  if (!selectedNode) { inspector.hidden = true; return; }
  const node = state.nodes[selectedNode];
  inspector.hidden = false;
  document.querySelector("#consensus-inspector-label").textContent = `REPLICA ${selectedNode}`;
  document.querySelector("#consensus-inspector-local").textContent = `${node.value} / v${node.version}`;
  document.querySelector("#consensus-inspector-applied").textContent = `v${node.appliedVersion}`;
  document.querySelector("#consensus-inspector-lag").textContent = String(replicaLag(state, selectedNode));
  document.querySelector("#consensus-inspector-link").textContent = nodeLinkLabel(selectedNode);
}
function renderHelp() {
  let text = state.mode === MODE_QUORUM
    ? "Quorum commits after the leader and one follower acknowledge. Full convergence happens only after every reachable replica catches up and applies the value."
    : "Eventual mode advances the latest accepted value immediately, then lets replicas converge independently. Accepted truth and fully converged truth can temporarily differ.";
  if (state.network === NETWORK_SLOW_B) text += " Replica B is deliberately slow, so C can outrun it.";
  if (state.network === NETWORK_ISOLATE_C) text += " Replica C is partitioned and remains stale until the link heals.";
  document.querySelector("#consensus-help").textContent = text;
}

function render() {
  renderControls(); renderNodes(); renderCore(); renderProtocol(); renderPackets(); renderHistory(); renderInspector(); renderHelp();
  summary.textContent = stateSummary(state);
}

modeButtons.forEach((button) => button.addEventListener("click", () => { state = setMode(state, button.dataset.mode); render(); }));
networkButtons.forEach((button) => button.addEventListener("click", () => { state = setNetwork(state, button.dataset.network); render(); }));
writeButton.addEventListener("click", () => { state = beginWrite(state); render(); });
resetButton.addEventListener("click", () => { state = resetConsensus(state); selectedNode = null; lastPulsedCommit = 0; render(); });
NODE_IDS.forEach((id) => nodeButtons[id].addEventListener("click", () => { selectedNode = selectedNode === id ? null : id; renderInspector(); }));
window.addEventListener("keydown", (event) => {
  const editable = event.target?.matches?.("input,textarea,select") || event.target?.isContentEditable;
  if (event.key.toLowerCase() === "r" && !event.metaKey && !event.ctrlKey && !event.altKey && !editable) {
    event.preventDefault(); state = resetConsensus(state); selectedNode = null; lastPulsedCommit = 0; render();
  }
  if (event.key === "Escape" && selectedNode) { selectedNode = null; renderInspector(); }
});

function tick(timestamp) {
  animationFrame = requestAnimationFrame(tick);
  if (document.hidden) { lastFrame = timestamp; return; }
  const delta = Math.min(90, Math.max(0, timestamp - lastFrame));
  lastFrame = timestamp;
  state = advanceConsensus(state, motionQuery.matches ? Math.max(delta, 140) : delta);
  const bucket = Math.floor(state.now / 70);
  if (bucket !== lastRenderedBucket) { lastRenderedBucket = bucket; render(); }
}
render();
animationFrame = requestAnimationFrame((timestamp) => { lastFrame = timestamp; tick(timestamp); });
window.addEventListener("pagehide", () => cancelAnimationFrame(animationFrame), { once: true });
