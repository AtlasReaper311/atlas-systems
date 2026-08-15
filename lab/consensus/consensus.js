import "../shared/shell.js";

import {
  MODE_EVENTUAL,
  MODE_QUORUM,
  NETWORK_CLEAN,
  NETWORK_ISOLATE_C,
  NETWORK_SLOW_B,
  advanceConsensus,
  agreementCount,
  beginWrite,
  canBeginWrite,
  committedAgreementCount,
  createConsensusState,
  messageProgress,
  networkLabel,
  nextWriteValue,
  nodePhase,
  setMode,
  setNetwork,
} from "./consensus-core.js";

const instrument = document.querySelector(".consensus-instrument");
const field = document.querySelector("#consensus-field");
const canvas = document.querySelector("#consensus-canvas");
const context = canvas.getContext("2d", { alpha: true });
const writeButton = document.querySelector("#consensus-write");
const resetButton = document.querySelector("#consensus-reset");
const nextValueOutput = document.querySelector("#consensus-next-value");
const commit = document.querySelector("#consensus-commit");
const commitValue = document.querySelector("#consensus-commit-value");
const commitVersion = document.querySelector("#consensus-commit-version");
const agreementCountOutput = document.querySelector("#consensus-agreement-count");
const proposal = document.querySelector("#consensus-proposal");
const proposalValue = document.querySelector("#consensus-proposal-value");
const proposalAcks = document.querySelector("#consensus-proposal-acks");
const writeStatus = document.querySelector("#consensus-write-status");
const acksOutput = document.querySelector("#consensus-acks");
const agreementOutput = document.querySelector("#consensus-agreement");
const networkOutput = document.querySelector("#consensus-network");
const policyOutput = document.querySelector("#consensus-policy");
const linkBOutput = document.querySelector("#consensus-link-b");
const linkCOutput = document.querySelector("#consensus-link-c");
const promptOutput = document.querySelector("#consensus-prompt");
const stateSummary = document.querySelector("#consensus-state-summary");
const modeButtons = [...document.querySelectorAll("[data-mode]")].filter((node) => node.matches("button"));
const networkButtons = [...document.querySelectorAll("button[data-network]")];
const replicaElements = Object.fromEntries(
  ["A", "B", "C"].map((id) => [id, document.querySelector(`[data-replica="${id}"]`)]),
);
const valueOutputs = Object.fromEntries(
  ["A", "B", "C"].map((id) => [id, document.querySelector(`[data-node-value="${id}"]`)]),
);
const versionOutputs = Object.fromEntries(
  ["A", "B", "C"].map((id) => [id, document.querySelector(`[data-node-version="${id}"]`)]),
);
const phaseOutputs = Object.fromEntries(
  ["A", "B", "C"].map((id) => [id, document.querySelector(`[data-node-phase="${id}"]`)]),
);

const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

let state = createConsensusState();
let lastTimestamp = 0;
let lastAnnouncedKey = "";
let frameHandle = 0;

function upperPhase(phase) {
  const labels = {
    synced: "SYNCED",
    proposal: "PROPOSAL",
    acked: "ACKED",
    stale: "STALE",
    delayed: "DELAYED",
    isolated: "ISOLATED",
  };
  return labels[phase] || phase.toUpperCase();
}

function writeLabel() {
  if (!state.write) return "READY";
  if (state.write.status === "pending") return "WAITING 2 / 3";
  if (state.write.status === "propagating") return "COMMITTED / SYNCING";
  return "SETTLED";
}

function promptForState() {
  if (state.network === NETWORK_ISOLATE_C) {
    if (state.mode === MODE_QUORUM) {
      return "Write with C isolated. A + B still form quorum; heal the link afterward and watch C jump directly to the newest committed version.";
    }
    return "Write with C isolated. Eventual accepts at A immediately, so availability is high while C keeps an older version until the partition heals.";
  }
  if (state.network === NETWORK_SLOW_B) {
    if (state.mode === MODE_QUORUM) {
      return "Write with B delayed. C can satisfy the second quorum acknowledgement first, so commit completes while B is still visibly behind.";
    }
    return "Write with B delayed. The centre accepts instantly, C follows, and B remains a separate old-state island for another two seconds.";
  }
  if (state.mode === MODE_EVENTUAL) {
    return "Press Write Next. The committed centre changes immediately at A, then the two followers visibly chase it across the network.";
  }
  return "Isolate C, then write. Quorum still commits through A + B, while C remains visibly stale until you heal the link.";
}

function updateControls() {
  for (const button of modeButtons) {
    const active = button.dataset.mode === state.mode;
    button.setAttribute("aria-pressed", String(active));
  }
  for (const button of networkButtons) {
    const active = button.dataset.network === state.network;
    button.setAttribute("aria-pressed", String(active));
  }

  writeButton.disabled = !canBeginWrite(state);
  nextValueOutput.textContent = nextWriteValue(state);
}

function updateReplica(id) {
  const node = state.nodes[id];
  const phase = nodePhase(state, id);
  const element = replicaElements[id];
  element.dataset.phase = phase;
  valueOutputs[id].textContent = node.value;
  versionOutputs[id].textContent = `v${node.version}`;
  phaseOutputs[id].textContent = upperPhase(phase);
}

function updateReadouts() {
  const latestVersion = state.nodes.A.version;
  const latestAgreement = agreementCount(state, latestVersion);
  const committedAgreement = committedAgreementCount(state);
  const isSplit = latestAgreement < 3;
  const isPending = state.write?.status === "pending";

  instrument.dataset.mode = state.mode;
  instrument.dataset.network = state.network;
  instrument.dataset.agreement = isSplit ? "split" : "full";
  instrument.dataset.write = isPending ? "pending" : state.write?.status || "idle";

  commitValue.textContent = state.committedValue;
  commitVersion.textContent = `VERSION ${state.committedVersion}`;
  agreementCountOutput.textContent = `${committedAgreement} / 3 AGREE`;
  commit.dataset.phase = isPending ? "pending" : committedAgreement < 3 ? "partial" : "full";

  if (isPending) {
    proposal.hidden = false;
    proposalValue.textContent = state.write.value;
    proposalAcks.textContent = `${latestAgreement} / 3`;
  } else {
    proposal.hidden = true;
  }

  writeStatus.textContent = writeLabel();
  acksOutput.textContent = `${latestAgreement} / 3`;
  agreementOutput.textContent = isSplit ? "SPLIT" : "FULL";
  networkOutput.textContent = networkLabel(state.network).toUpperCase();
  policyOutput.textContent = state.mode === MODE_QUORUM ? "QUORUM 2 / 3" : "EVENTUAL";
  promptOutput.textContent = promptForState();

  if (state.network === NETWORK_SLOW_B) {
    linkBOutput.textContent = "2.86 s";
    linkCOutput.textContent = "920 ms";
  } else if (state.network === NETWORK_ISOLATE_C) {
    linkBOutput.textContent = "760 ms";
    linkCOutput.textContent = "NO LINK";
  } else {
    linkBOutput.textContent = "760 ms";
    linkCOutput.textContent = "1.08 s";
  }
}

function announceState() {
  const key = [
    state.mode,
    state.network,
    state.committedVersion,
    state.nodes.A.version,
    state.nodes.B.version,
    state.nodes.C.version,
    state.write?.status || "idle",
  ].join(":");
  if (key === lastAnnouncedKey) return;
  lastAnnouncedKey = key;

  const phases = ["A", "B", "C"]
    .map((id) => `Replica ${id} ${state.nodes[id].value} version ${state.nodes[id].version}, ${upperPhase(nodePhase(state, id)).toLowerCase()}`)
    .join(". ");
  stateSummary.textContent = `Committed ${state.committedValue}, version ${state.committedVersion}. ${phases}. ${writeLabel().toLowerCase()}. Network ${networkLabel(state.network)}.`;
}

function renderDom() {
  updateControls();
  updateReplica("A");
  updateReplica("B");
  updateReplica("C");
  updateReadouts();
  announceState();
}

function measureCanvas() {
  const rect = field.getBoundingClientRect();
  const dpr = Math.min(2, Math.max(1, window.devicePixelRatio || 1));
  const width = Math.max(1, Math.round(rect.width * dpr));
  const height = Math.max(1, Math.round(rect.height * dpr));
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  context.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { width: rect.width, height: rect.height };
}

function centreOf(element) {
  const fieldRect = field.getBoundingClientRect();
  const rect = element.getBoundingClientRect();
  return {
    x: rect.left - fieldRect.left + rect.width / 2,
    y: rect.top - fieldRect.top + rect.height / 2,
  };
}

function quadraticPoint(start, end, bend, t) {
  const middle = {
    x: (start.x + end.x) / 2,
    y: (start.y + end.y) / 2,
  };
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const length = Math.max(1, Math.hypot(dx, dy));
  const control = {
    x: middle.x - (dy / length) * bend,
    y: middle.y + (dx / length) * bend,
  };
  const inverse = 1 - t;
  return {
    x: inverse * inverse * start.x + 2 * inverse * t * control.x + t * t * end.x,
    y: inverse * inverse * start.y + 2 * inverse * t * control.y + t * t * end.y,
    control,
  };
}

function strokeCurve(start, end, bend, options = {}) {
  const {
    color = "rgba(126, 231, 242, 0.20)",
    width = 1,
    dash = [],
    glow = 0,
    split = false,
  } = options;
  const sample = quadraticPoint(start, end, bend, 0.5);
  context.save();
  context.lineWidth = width;
  context.strokeStyle = color;
  context.setLineDash(dash);
  context.shadowColor = color;
  context.shadowBlur = glow;

  const drawRange = (fromT, toT) => {
    const startPoint = quadraticPoint(start, end, bend, fromT);
    const controlA = quadraticPoint(start, end, bend, (fromT + toT) / 2).control;
    const endPoint = quadraticPoint(start, end, bend, toT);
    context.beginPath();
    context.moveTo(startPoint.x, startPoint.y);
    context.quadraticCurveTo(controlA.x, controlA.y, endPoint.x, endPoint.y);
    context.stroke();
  };

  if (split) {
    drawRange(0, 0.43);
    drawRange(0.57, 1);
  } else {
    context.beginPath();
    context.moveTo(start.x, start.y);
    context.quadraticCurveTo(sample.control.x, sample.control.y, end.x, end.y);
    context.stroke();
  }
  context.restore();
}

function drawPartitionMark(start, end, bend) {
  const point = quadraticPoint(start, end, bend, 0.5);
  context.save();
  context.translate(point.x, point.y);
  context.strokeStyle = "rgba(226, 75, 74, 0.78)";
  context.lineWidth = 1.2;
  context.shadowColor = "rgba(226, 75, 74, 0.7)";
  context.shadowBlur = 10;
  context.beginPath();
  context.moveTo(-6, -6);
  context.lineTo(6, 6);
  context.moveTo(-6, 6);
  context.lineTo(6, -6);
  context.stroke();
  context.restore();
}

function drawPacket(message, start, end, bend) {
  const progress = messageProgress(state, message);
  const trailSteps = reducedMotion.matches ? 1 : 5;
  context.save();
  context.globalCompositeOperation = "lighter";
  for (let index = trailSteps - 1; index >= 0; index -= 1) {
    const trail = Math.max(0, progress - index * 0.026);
    const point = quadraticPoint(start, end, bend, trail);
    const alpha = 0.16 + ((trailSteps - index) / trailSteps) * 0.64;
    const radius = index === 0 ? 4.2 : 2.2;
    context.fillStyle = `rgba(126, 231, 242, ${alpha})`;
    context.shadowColor = "rgba(126, 231, 242, 0.9)";
    context.shadowBlur = index === 0 ? 18 : 9;
    context.beginPath();
    context.arc(point.x, point.y, radius, 0, Math.PI * 2);
    context.fill();
  }
  context.restore();
}

function drawHeartbeat(start, end, bend, offset) {
  if (reducedMotion.matches || state.inflight.length > 0) return;
  const t = ((state.now / 4200) + offset) % 1;
  const point = quadraticPoint(start, end, bend, t);
  context.save();
  context.fillStyle = "rgba(126, 231, 242, 0.24)";
  context.beginPath();
  context.arc(point.x, point.y, 1.7, 0, Math.PI * 2);
  context.fill();
  context.restore();
}

function drawCommitSpoke(nodePoint, commitPoint, phase) {
  const palette = {
    synced: "rgba(126, 231, 242, 0.10)",
    acked: "rgba(122, 168, 255, 0.16)",
    proposal: "rgba(245, 166, 35, 0.17)",
    stale: "rgba(170, 140, 255, 0.12)",
    delayed: "rgba(170, 140, 255, 0.15)",
    isolated: "rgba(226, 75, 74, 0.09)",
  };
  context.save();
  context.strokeStyle = palette[phase] || palette.synced;
  context.lineWidth = 1;
  context.setLineDash([2, 8]);
  context.beginPath();
  context.moveTo(nodePoint.x, nodePoint.y);
  context.lineTo(commitPoint.x, commitPoint.y);
  context.stroke();
  context.restore();
}

function drawNetwork() {
  const { width, height } = measureCanvas();
  context.clearRect(0, 0, width, height);

  const points = {
    A: centreOf(replicaElements.A),
    B: centreOf(replicaElements.B),
    C: centreOf(replicaElements.C),
    commit: centreOf(commit),
  };

  drawCommitSpoke(points.A, points.commit, nodePhase(state, "A"));
  drawCommitSpoke(points.B, points.commit, nodePhase(state, "B"));
  drawCommitSpoke(points.C, points.commit, nodePhase(state, "C"));

  strokeCurve(points.A, points.B, 34, {
    color: state.network === NETWORK_SLOW_B ? "rgba(170, 140, 255, 0.28)" : "rgba(126, 231, 242, 0.22)",
    width: 1.35,
    dash: state.network === NETWORK_SLOW_B ? [7, 10] : [],
    glow: state.network === NETWORK_SLOW_B ? 8 : 4,
  });

  const cIsolated = state.network === NETWORK_ISOLATE_C;
  strokeCurve(points.A, points.C, -34, {
    color: cIsolated ? "rgba(226, 75, 74, 0.28)" : "rgba(126, 231, 242, 0.22)",
    width: 1.35,
    dash: cIsolated ? [3, 8] : [],
    glow: cIsolated ? 7 : 4,
    split: cIsolated,
  });
  if (cIsolated) drawPartitionMark(points.A, points.C, -34);

  strokeCurve(points.B, points.C, 18, {
    color: "rgba(122, 168, 255, 0.09)",
    width: 0.85,
    dash: [2, 10],
  });

  for (const message of state.inflight) {
    const targetPoint = points[message.to];
    const bend = message.to === "B" ? 34 : -34;
    drawPacket(message, points.A, targetPoint, bend);
  }

  drawHeartbeat(points.A, points.B, 34, 0.1);
  if (!cIsolated) drawHeartbeat(points.A, points.C, -34, 0.55);
}

function render() {
  renderDom();
  drawNetwork();
}

function frame(timestamp) {
  frameHandle = requestAnimationFrame(frame);
  if (document.hidden) {
    lastTimestamp = 0;
    return;
  }

  if (!lastTimestamp) lastTimestamp = timestamp;
  const elapsed = Math.min(250, Math.max(0, timestamp - lastTimestamp));
  lastTimestamp = timestamp;
  if (elapsed > 0) state = advanceConsensus(state, elapsed);
  render();
}

for (const button of modeButtons) {
  button.addEventListener("click", () => {
    state = setMode(state, button.dataset.mode === MODE_EVENTUAL ? MODE_EVENTUAL : MODE_QUORUM);
    render();
  });
}

for (const button of networkButtons) {
  button.addEventListener("click", () => {
    const network = button.dataset.network;
    if (![NETWORK_CLEAN, NETWORK_SLOW_B, NETWORK_ISOLATE_C].includes(network)) return;
    state = setNetwork(state, network);
    render();
  });
}

writeButton.addEventListener("click", () => {
  state = beginWrite(state);
  render();
});

resetButton.addEventListener("click", () => {
  state = createConsensusState();
  lastTimestamp = 0;
  render();
  writeButton.focus();
});

window.addEventListener("resize", drawNetwork, { passive: true });
reducedMotion.addEventListener?.("change", drawNetwork);
document.addEventListener("visibilitychange", () => {
  lastTimestamp = 0;
  if (!document.hidden) render();
});

render();
frameHandle = requestAnimationFrame(frame);

window.addEventListener("pagehide", () => {
  cancelAnimationFrame(frameHandle);
}, { once: true });
