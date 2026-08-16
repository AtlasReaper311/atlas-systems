export const MODE_QUORUM = "quorum";
export const MODE_EVENTUAL = "eventual";

export const NETWORK_CLEAN = "clean";
export const NETWORK_SLOW_B = "slow-b";
export const NETWORK_ISOLATE_C = "isolate-c";

export const NODE_IDS = Object.freeze(["A", "B", "C"]);
export const VALUE_SEQUENCE = Object.freeze([
  "0x2A",
  "0x7C",
  "0xB1",
  "0x39",
  "0xE4",
  "0x65",
  "0xD0",
  "0x18",
]);

const DELAYS = Object.freeze({
  clean: Object.freeze({ B: 680, C: 940 }),
  "slow-b": Object.freeze({ B: 2860, C: 820 }),
  "isolate-c": Object.freeze({ B: 680, C: null }),
});
const ACK_DELAY = 260;
const LOG_LIMIT = 6;

function assertMode(mode) {
  if (![MODE_QUORUM, MODE_EVENTUAL].includes(mode)) {
    throw new TypeError(`Unsupported consensus mode: ${mode}`);
  }
}

function assertNetwork(network) {
  if (![NETWORK_CLEAN, NETWORK_SLOW_B, NETWORK_ISOLATE_C].includes(network)) {
    throw new TypeError(`Unsupported network profile: ${network}`);
  }
}

function copyLog(log) {
  return log.map((entry) => ({ ...entry }));
}

function copyNode(node) {
  return { ...node, log: copyLog(node.log) };
}

function copyState(state) {
  return {
    ...state,
    nodes: Object.fromEntries(NODE_IDS.map((id) => [id, copyNode(state.nodes[id])])),
    inflight: state.inflight.map((message) => ({ ...message })),
    write: state.write ? { ...state.write, acks: [...state.write.acks] } : null,
    events: state.events.map((event) => ({ ...event })),
  };
}

function appendEvent(state, type, detail = {}) {
  state.events.push({ id: state.nextEventId, at: state.now, type, ...detail });
  state.nextEventId += 1;
  if (state.events.length > 32) state.events.splice(0, state.events.length - 32);
}

function appendLog(node, version, value, status) {
  const existing = node.log.find((entry) => entry.version === version);
  if (existing) {
    existing.value = value;
    existing.status = status;
  } else {
    node.log.push({ version, value, status });
    if (node.log.length > LOG_LIMIT) node.log.splice(0, node.log.length - LOG_LIMIT);
  }
}

function updateLogStatus(state, version, status) {
  for (const id of NODE_IDS) {
    const entry = state.nodes[id].log.find((item) => item.version === version);
    if (entry) entry.status = status;
  }
}

function delayFor(state, target) {
  return DELAYS[state.network][target];
}

function queueMessage(state, { kind, from, to, version, value, delay }) {
  if (delay === null) return false;
  const duplicate = state.inflight.some((message) => (
    message.kind === kind
    && message.from === from
    && message.to === to
    && message.version === version
  ));
  if (duplicate) return false;

  state.inflight.push({
    id: state.nextMessageId,
    kind,
    from,
    to,
    version,
    value,
    sentAt: state.now,
    deliverAt: state.now + delay,
  });
  state.nextMessageId += 1;
  appendEvent(state, `${kind}-sent`, { from, to, version, delay });
  return true;
}

function queueProposal(state, target, version, value, kind = "proposal") {
  const delay = delayFor(state, target);
  return queueMessage(state, { kind, from: "A", to: target, version, value, delay });
}

function queueAck(state, from, version, value) {
  const networkDelay = delayFor(state, from);
  if (networkDelay === null) return false;
  const returnDelay = Math.max(ACK_DELAY, Math.round(networkDelay * 0.34));
  return queueMessage(state, {
    kind: "ack",
    from,
    to: "A",
    version,
    value,
    delay: returnDelay,
  });
}

function writeAckCount(state) {
  return state.write ? state.write.acks.length : 3;
}

function allReplicasAt(state, version, value) {
  return NODE_IDS.every((id) => (
    state.nodes[id].version === version && state.nodes[id].value === value
  ));
}

function commitQuorum(state) {
  if (!state.write || state.write.committedAt !== null) return;
  if (state.write.acks.length < 2) return;
  state.committedVersion = state.write.version;
  state.committedValue = state.write.value;
  state.committedAt = state.now;
  state.write.committedAt = state.now;
  state.write.status = "committed";
  updateLogStatus(state, state.write.version, "committed");
  appendEvent(state, "commit-locked", {
    version: state.write.version,
    value: state.write.value,
    acknowledgements: state.write.acks.length,
  });
}

function refreshConvergence(state) {
  if (!state.write) return;
  const { version, value } = state.write;
  if (!allReplicasAt(state, version, value)) return;

  if (state.convergedVersion !== version) {
    state.convergedVersion = version;
    state.convergedValue = value;
    state.convergedAt = state.now;
    updateLogStatus(state, version, "converged");
    appendEvent(state, "cluster-converged", { version, value });
  }

  if (state.mode === MODE_EVENTUAL) {
    state.committedVersion = version;
    state.committedValue = value;
  }

  if (!state.inflight.some((message) => message.version === version)) {
    state.write.status = "settled";
    state.write.settledAt = state.now;
  }
}

function deliverProposal(state, message) {
  const node = state.nodes[message.to];
  if (message.version < node.version) return;
  node.version = message.version;
  node.value = message.value;
  node.updatedAt = state.now;
  appendLog(node, message.version, message.value, state.mode === MODE_QUORUM ? "pending" : "accepted");
  appendEvent(state, `${message.kind}-delivered`, { target: message.to, version: message.version });
  queueAck(state, message.to, message.version, message.value);
}

function deliverAck(state, message) {
  if (!state.write || message.version !== state.write.version) return;
  if (!state.write.acks.includes(message.from)) state.write.acks.push(message.from);
  appendEvent(state, "ack-delivered", { from: message.from, version: message.version });
  if (state.mode === MODE_QUORUM) commitQuorum(state);
}

function deliverMessage(state, message) {
  if (message.kind === "ack") deliverAck(state, message);
  else deliverProposal(state, message);
}

function reconcileReplica(state, id) {
  if (id === "A") return false;
  const leader = state.nodes.A;
  const node = state.nodes[id];
  if (node.version >= leader.version) return false;
  return queueProposal(state, id, leader.version, leader.value, "reconcile");
}

export function createConsensusState({ mode = MODE_QUORUM, network = NETWORK_CLEAN } = {}) {
  assertMode(mode);
  assertNetwork(network);
  const initialValue = VALUE_SEQUENCE[0];
  const initialEntry = { version: 0, value: initialValue, status: "converged" };
  return {
    now: 0,
    mode,
    network,
    sequenceIndex: 0,
    acceptedVersion: 0,
    acceptedValue: initialValue,
    committedVersion: 0,
    committedValue: initialValue,
    committedAt: 0,
    convergedVersion: 0,
    convergedValue: initialValue,
    convergedAt: 0,
    nodes: {
      A: { id: "A", role: "leader", version: 0, value: initialValue, updatedAt: 0, log: [{ ...initialEntry }] },
      B: { id: "B", role: "replica", version: 0, value: initialValue, updatedAt: 0, log: [{ ...initialEntry }] },
      C: { id: "C", role: "replica", version: 0, value: initialValue, updatedAt: 0, log: [{ ...initialEntry }] },
    },
    inflight: [],
    write: null,
    nextMessageId: 1,
    nextEventId: 1,
    events: [],
  };
}

export function nextWriteValue(state) {
  return VALUE_SEQUENCE[(state.sequenceIndex + 1) % VALUE_SEQUENCE.length];
}

export function canBeginWrite(state) {
  return !state.write || state.write.status === "settled";
}

export function beginWrite(state) {
  if (!canBeginWrite(state)) return state;
  const next = copyState(state);
  next.sequenceIndex = (next.sequenceIndex + 1) % VALUE_SEQUENCE.length;
  const version = next.nodes.A.version + 1;
  const value = VALUE_SEQUENCE[next.sequenceIndex];

  next.nodes.A.version = version;
  next.nodes.A.value = value;
  next.nodes.A.updatedAt = next.now;
  appendLog(next.nodes.A, version, value, next.mode === MODE_QUORUM ? "pending" : "accepted");

  next.acceptedVersion = version;
  next.acceptedValue = value;
  next.write = {
    version,
    value,
    mode: next.mode,
    startedAt: next.now,
    committedAt: null,
    settledAt: null,
    status: next.mode === MODE_EVENTUAL ? "accepted" : "proposing",
    acks: ["A"],
  };
  appendEvent(next, "write-started", { version, value, policy: next.mode });

  if (next.mode === MODE_EVENTUAL) {
    next.committedVersion = version;
    next.committedValue = value;
    next.committedAt = next.now;
    next.write.committedAt = next.now;
    appendEvent(next, "accepted-immediately", { version, value });
  }

  queueProposal(next, "B", version, value);
  queueProposal(next, "C", version, value);
  return next;
}

export function setMode(state, mode) {
  assertMode(mode);
  if (state.mode === mode) return state;
  if (!canBeginWrite(state)) return state;
  const next = copyState(state);
  next.mode = mode;
  appendEvent(next, "mode-changed", { mode });
  return next;
}

export function setNetwork(state, network) {
  assertNetwork(network);
  if (state.network === network) return state;
  const next = copyState(state);
  const previous = next.network;
  next.network = network;
  appendEvent(next, "network-changed", { from: previous, network });

  // Network profile changes invalidate undelivered proposal/reconcile traffic.
  // ACKs already on their way to the leader remain valid observations.
  next.inflight = next.inflight.filter((message) => message.kind === "ack");
  reconcileReplica(next, "B");
  reconcileReplica(next, "C");
  return next;
}

export function advanceConsensus(state, elapsedMs) {
  if (!Number.isFinite(elapsedMs) || elapsedMs < 0) {
    throw new TypeError("elapsedMs must be a finite non-negative number");
  }
  if (elapsedMs === 0) return state;

  const next = copyState(state);
  next.now += elapsedMs;
  const delivered = next.inflight
    .filter((message) => message.deliverAt <= next.now)
    .sort((left, right) => left.deliverAt - right.deliverAt || left.id - right.id);

  if (delivered.length > 0) {
    const ids = new Set(delivered.map((message) => message.id));
    next.inflight = next.inflight.filter((message) => !ids.has(message.id));
    for (const message of delivered) deliverMessage(next, message);
  }

  if (next.mode === MODE_QUORUM) commitQuorum(next);
  refreshConvergence(next);
  return next;
}

export function agreementCount(state, version = state.nodes.A.version) {
  return NODE_IDS.reduce((count, id) => count + (state.nodes[id].version === version ? 1 : 0), 0);
}

export function acknowledgementCount(state) {
  return writeAckCount(state);
}

export function committedAgreementCount(state) {
  return NODE_IDS.reduce((count, id) => count + (
    state.nodes[id].version === state.committedVersion
    && state.nodes[id].value === state.committedValue ? 1 : 0
  ), 0);
}

export function messageProgress(state, message) {
  const span = Math.max(1, message.deliverAt - message.sentAt);
  return Math.min(1, Math.max(0, (state.now - message.sentAt) / span));
}

export function nodePhase(state, id) {
  if (!NODE_IDS.includes(id)) throw new TypeError(`Unknown replica: ${id}`);
  const node = state.nodes[id];
  const leaderVersion = state.nodes.A.version;

  if (id === "C" && state.network === NETWORK_ISOLATE_C) return "isolated";
  if (id === "B" && state.network === NETWORK_SLOW_B && node.version < leaderVersion) return "delayed";
  if (node.version < leaderVersion) return "stale";
  if (state.write && node.version === state.write.version) {
    if (id === "A" && state.write.status === "proposing") return "proposal";
    if (state.write.acks.includes(id)) return "acked";
    if (id !== "A") return "accepted";
  }
  return "synced";
}

export function logWindow(state, id, size = 5) {
  if (!NODE_IDS.includes(id)) throw new TypeError(`Unknown replica: ${id}`);
  const node = state.nodes[id];
  const latestVersion = state.nodes.A.version;
  const first = Math.max(0, latestVersion - size + 1);
  const entries = [];
  for (let version = first; version <= latestVersion; version += 1) {
    const found = node.log.find((entry) => entry.version === version);
    entries.push(found ? { ...found } : { version, value: null, status: "missing" });
  }
  return entries;
}

export function networkLabel(network) {
  if (network === NETWORK_SLOW_B) return "B +2.18s";
  if (network === NETWORK_ISOLATE_C) return "C isolated";
  return "clean links";
}

export function localReplicaView(state, id) {
  if (!NODE_IDS.includes(id)) throw new TypeError(`Unknown replica: ${id}`);
  const node = state.nodes[id];
  return {
    localValue: node.value,
    localVersion: node.version,
    committedValue: state.committedValue,
    committedVersion: state.committedVersion,
    lag: Math.max(0, state.nodes.A.version - node.version),
    phase: nodePhase(state, id),
  };
}
