export const MODE_QUORUM = "quorum";
export const MODE_EVENTUAL = "eventual";
export const NETWORK_CLEAN = "clean";
export const NETWORK_SLOW_B = "slow-b";
export const NETWORK_ISOLATE_C = "isolate-c";
export const NODE_IDS = Object.freeze(["A", "B", "C"]);
export const VALUE_SEQUENCE = Object.freeze(["0x2A", "0x7C", "0x18", "0xD0", "0x65", "0xE4", "0x39"]);

const LINK_DELAYS = Object.freeze({
  clean: Object.freeze({ B: 520, C: 760 }),
  "slow-b": Object.freeze({ B: 2500, C: 620 }),
  "isolate-c": Object.freeze({ B: 520, C: null }),
});
const ACK_FACTOR = 0.42;
const COMMIT_PROPAGATION = 260;
const HISTORY_LIMIT = 6;
const LOG_LIMIT = 6;

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}
function assertMode(mode) {
  if (![MODE_QUORUM, MODE_EVENTUAL].includes(mode)) throw new TypeError(`Unsupported mode: ${mode}`);
}
function assertNetwork(network) {
  if (![NETWORK_CLEAN, NETWORK_SLOW_B, NETWORK_ISOLATE_C].includes(network)) throw new TypeError(`Unsupported network: ${network}`);
}
function appendLog(node, version, value, status) {
  const found = node.log.find((entry) => entry.version === version);
  if (found) Object.assign(found, { value, status });
  else node.log.push({ version, value, status });
  if (node.log.length > LOG_LIMIT) node.log.splice(0, node.log.length - LOG_LIMIT);
}
function addEvent(state, txn, type, detail = {}) {
  const event = { id: state.nextEventId++, at: state.now, type, version: txn?.version ?? null, ...detail };
  state.events.push(event);
  if (txn) txn.events.push(event.id);
  if (state.events.length > 120) state.events.splice(0, state.events.length - 120);
  return event;
}
function schedule(state, txn, type, at, detail = {}) {
  state.queue.push({ id: state.nextMessageId++, txnVersion: txn.version, type, at, ...detail });
  state.queue.sort((a, b) => a.at - b.at || a.id - b.id);
}
function txnByVersion(state, version) {
  return state.transactions.find((txn) => txn.version === version) || null;
}
function delayTo(state, nodeId) {
  return LINK_DELAYS[state.network][nodeId];
}
function allAt(state, version) {
  return NODE_IDS.every((id) => state.nodes[id].version >= version);
}
function allApplied(state, version) {
  return NODE_IDS.every((id) => state.nodes[id].appliedVersion >= version);
}
function updateConvergence(state, txn) {
  if (!txn || txn.convergedAt !== null) return;
  const converged = state.mode === MODE_EVENTUAL ? allAt(state, txn.version) : allApplied(state, txn.version);
  if (!converged) return;
  txn.convergedAt = state.now;
  txn.status = "converged";
  state.convergedVersion = txn.version;
  state.convergedValue = txn.value;
  for (const id of NODE_IDS) {
    const entry = state.nodes[id].log.find((item) => item.version === txn.version);
    if (entry) entry.status = "converged";
  }
  addEvent(state, txn, "converged", { value: txn.value });
}
function commit(state, txn) {
  if (txn.committedAt !== null) return;
  txn.committedAt = state.now;
  txn.status = "committed";
  state.committedVersion = txn.version;
  state.committedValue = txn.value;
  state.nodes.A.appliedVersion = txn.version;
  for (const id of txn.acks) {
    const entry = state.nodes[id].log.find((item) => item.version === txn.version);
    if (entry) entry.status = "committed";
  }
  addEvent(state, txn, "commit", { acknowledgements: [...txn.acks] });
  for (const id of ["B", "C"]) {
    const delay = delayTo(state, id);
    if (delay !== null && state.nodes[id].version >= txn.version) {
      schedule(state, txn, "apply", state.now + COMMIT_PROPAGATION, { node: id });
    }
  }
}
function processScheduled(state, item) {
  const txn = txnByVersion(state, item.txnVersion);
  if (!txn) return;

  if (item.type === "proposal-arrive" || item.type === "catchup-arrive") {
    const node = state.nodes[item.node];
    if (item.version >= node.version) {
      node.version = item.version;
      node.value = item.value;
      appendLog(node, item.version, item.value, state.mode === MODE_QUORUM ? "pending" : "accepted");
      addEvent(state, txn, item.type === "catchup-arrive" ? "catchup-arrive" : "append", { node: item.node, value: item.value });
      if (state.mode === MODE_QUORUM && txn.committedAt !== null) {
        schedule(state, txn, "apply", state.now + COMMIT_PROPAGATION, { node: item.node });
      }
    }
    const delay = delayTo(state, item.node);
    if (delay !== null) {
      schedule(state, txn, "ack-arrive", state.now + Math.max(220, Math.round(delay * ACK_FACTOR)), { node: item.node });
      addEvent(state, txn, "ack-send", { node: item.node });
    }
    if (state.mode === MODE_EVENTUAL) updateConvergence(state, txn);
    return;
  }

  if (item.type === "ack-arrive") {
    if (!txn.acks.includes(item.node)) txn.acks.push(item.node);
    addEvent(state, txn, "ack-arrive", { node: item.node, acknowledgements: [...txn.acks] });
    if (state.mode === MODE_QUORUM && txn.acks.length >= 2) commit(state, txn);
    return;
  }

  if (item.type === "apply") {
    const entry = state.nodes[item.node].log.find((candidate) => candidate.version === txn.version);
    if (entry) entry.status = txn.committedAt !== null ? "committed" : entry.status;
    state.nodes[item.node].appliedVersion = Math.max(state.nodes[item.node].appliedVersion, txn.version);
    addEvent(state, txn, "apply", { node: item.node });
    updateConvergence(state, txn);
  }
}

export function createConsensusState({ mode = MODE_QUORUM, network = NETWORK_CLEAN } = {}) {
  assertMode(mode);
  assertNetwork(network);
  const initialValue = VALUE_SEQUENCE[0];
  const initialLog = [{ version: 0, value: initialValue, status: "converged" }];
  return {
    now: 0,
    mode,
    network,
    sequenceIndex: 0,
    acceptedVersion: 0,
    acceptedValue: initialValue,
    committedVersion: 0,
    committedValue: initialValue,
    convergedVersion: 0,
    convergedValue: initialValue,
    nodes: {
      A: { id: "A", role: "leader", version: 0, value: initialValue, appliedVersion: 0, log: clone(initialLog) },
      B: { id: "B", role: "follower", version: 0, value: initialValue, appliedVersion: 0, log: clone(initialLog) },
      C: { id: "C", role: "follower", version: 0, value: initialValue, appliedVersion: 0, log: clone(initialLog) },
    },
    transactions: [],
    events: [],
    queue: [],
    nextEventId: 1,
    nextMessageId: 1,
  };
}

export function nextWriteValue(state) {
  return VALUE_SEQUENCE[(state.sequenceIndex + 1) % VALUE_SEQUENCE.length];
}

export function activeTransaction(state) {
  return state.transactions.find((txn) => !["converged", "stalled"].includes(txn.status)) || null;
}

export function canBeginWrite(state) {
  const active = activeTransaction(state);
  if (!active) return true;
  return active.committedAt !== null && state.mode === MODE_QUORUM;
}

export function beginWrite(input) {
  if (!canBeginWrite(input)) return input;
  const state = clone(input);
  state.sequenceIndex = (state.sequenceIndex + 1) % VALUE_SEQUENCE.length;
  const version = state.nodes.A.version + 1;
  const value = VALUE_SEQUENCE[state.sequenceIndex];
  state.nodes.A.version = version;
  state.nodes.A.value = value;
  appendLog(state.nodes.A, version, value, state.mode === MODE_QUORUM ? "pending" : "accepted");
  state.acceptedVersion = version;
  state.acceptedValue = value;

  const txn = {
    version,
    value,
    mode: state.mode,
    network: state.network,
    startedAt: state.now,
    committedAt: state.mode === MODE_EVENTUAL ? state.now : null,
    convergedAt: null,
    status: state.mode === MODE_EVENTUAL ? "accepted" : "proposing",
    acks: ["A"],
    events: [],
  };
  state.transactions.unshift(txn);
  if (state.transactions.length > HISTORY_LIMIT) state.transactions.length = HISTORY_LIMIT;
  addEvent(state, txn, "write", { node: "A", value });
  addEvent(state, txn, "append", { node: "A", value });

  if (state.mode === MODE_EVENTUAL) {
    state.committedVersion = version;
    state.committedValue = value;
    addEvent(state, txn, "accepted", { node: "A", value });
  }

  for (const node of ["B", "C"]) {
    const delay = delayTo(state, node);
    if (delay === null) {
      addEvent(state, txn, "partition-drop", { node });
      continue;
    }
    addEvent(state, txn, "proposal-send", { node, delay });
    schedule(state, txn, "proposal-arrive", state.now + delay, { node, version, value });
  }
  return state;
}

export function advanceConsensus(input, milliseconds) {
  if (!Number.isFinite(milliseconds) || milliseconds < 0) throw new TypeError("Advance duration must be non-negative.");
  const state = clone(input);
  const target = state.now + milliseconds;
  while (state.queue.length && state.queue[0].at <= target) {
    const item = state.queue.shift();
    state.now = item.at;
    processScheduled(state, item);
  }
  state.now = target;
  for (const txn of state.transactions) updateConvergence(state, txn);
  return state;
}

export function setMode(input, mode) {
  assertMode(mode);
  const state = clone(input);
  state.mode = mode;
  return state;
}

export function setNetwork(input, network) {
  assertNetwork(network);
  const state = clone(input);
  const previous = state.network;
  state.network = network;
  if (previous === NETWORK_ISOLATE_C && network !== NETWORK_ISOLATE_C) {
    const node = state.nodes.C;
    if (node.version < state.nodes.A.version) {
      const txn = txnByVersion(state, state.nodes.A.version) || state.transactions[0];
      if (txn) {
        const delay = LINK_DELAYS[network].C;
        addEvent(state, txn, "heal", { node: "C" });
        addEvent(state, txn, "catchup-send", { node: "C", fromVersion: node.version, toVersion: state.nodes.A.version, delay });
        schedule(state, txn, "catchup-arrive", state.now + delay, { node: "C", version: state.nodes.A.version, value: state.nodes.A.value });
      }
    }
  }
  return state;
}

export function resetConsensus(state) {
  return createConsensusState({ mode: state.mode, network: state.network });
}

export function replicaLag(state, id) {
  return Math.max(0, state.nodes.A.version - state.nodes[id].version);
}

export function quorumCount(state) {
  const txn = state.transactions[0];
  return txn ? txn.acks.length : 3;
}

export function stateSummary(state) {
  const txn = state.transactions[0];
  const txnText = txn ? `Latest write v${txn.version} ${txn.value}, ${txn.status}, acknowledgements ${txn.acks.length}/3.` : "No write in progress.";
  return `Mode ${state.mode}. Network ${state.network}. Accepted v${state.acceptedVersion} ${state.acceptedValue}. Committed v${state.committedVersion} ${state.committedValue}. Converged v${state.convergedVersion} ${state.convergedValue}. ${txnText} Replica A v${state.nodes.A.version}, B v${state.nodes.B.version}, C v${state.nodes.C.version}.`;
}
