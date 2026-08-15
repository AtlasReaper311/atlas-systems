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

const CLEAN_DELAYS = Object.freeze({ B: 760, C: 1080 });
const SLOW_B_DELAYS = Object.freeze({ B: 2860, C: 920 });

function assertMode(mode) {
  if (mode !== MODE_QUORUM && mode !== MODE_EVENTUAL) {
    throw new TypeError(`Unsupported consensus mode: ${mode}`);
  }
}

function assertNetwork(network) {
  if (![NETWORK_CLEAN, NETWORK_SLOW_B, NETWORK_ISOLATE_C].includes(network)) {
    throw new TypeError(`Unsupported network profile: ${network}`);
  }
}

function copyNode(node) {
  return { ...node };
}

function copyMessage(message) {
  return { ...message };
}

function copyWrite(write) {
  return write ? { ...write } : null;
}

function copyState(state) {
  return {
    ...state,
    nodes: {
      A: copyNode(state.nodes.A),
      B: copyNode(state.nodes.B),
      C: copyNode(state.nodes.C),
    },
    inflight: state.inflight.map(copyMessage),
    write: copyWrite(state.write),
    events: state.events.map((event) => ({ ...event })),
  };
}

function appendEvent(state, type, detail = {}) {
  state.events.push({
    id: state.nextEventId,
    at: state.now,
    type,
    ...detail,
  });
  state.nextEventId += 1;
  if (state.events.length > 24) state.events.splice(0, state.events.length - 24);
}

function networkDelay(network, target) {
  if (target === "A") return 0;
  if (network === NETWORK_ISOLATE_C && target === "C") return null;
  if (network === NETWORK_SLOW_B) return SLOW_B_DELAYS[target];
  return CLEAN_DELAYS[target];
}

function latestLeaderSnapshot(state) {
  return {
    version: state.nodes.A.version,
    value: state.nodes.A.value,
  };
}

function hasMessageTo(state, target, version) {
  return state.inflight.some((message) => message.to === target && message.version === version);
}

function scheduleReplicaDelivery(state, target, snapshot = latestLeaderSnapshot(state)) {
  if (target === "A") return false;
  const delay = networkDelay(state.network, target);
  if (delay === null) return false;
  if (state.nodes[target].version >= snapshot.version) return false;
  if (hasMessageTo(state, target, snapshot.version)) return false;

  state.inflight.push({
    id: state.nextMessageId,
    from: "A",
    to: target,
    version: snapshot.version,
    value: snapshot.value,
    sentAt: state.now,
    deliverAt: state.now + delay,
  });
  state.nextMessageId += 1;
  appendEvent(state, "message-sent", { target, version: snapshot.version, delay });
  return true;
}

function possibleAckCount(state, version) {
  let count = 0;
  for (const id of NODE_IDS) {
    if (state.nodes[id].version >= version) count += 1;
  }
  return count;
}

function pendingMessagesForVersion(state, version) {
  return state.inflight.filter((message) => message.version === version).length;
}

function refreshWriteStatus(state) {
  if (!state.write) return;

  const write = state.write;
  const ackCount = possibleAckCount(state, write.version);

  if (write.status === "pending" && write.mode === MODE_QUORUM && ackCount >= 2) {
    state.committedVersion = write.version;
    state.committedValue = write.value;
    state.committedAt = state.now;
    write.committedAt = state.now;
    write.status = pendingMessagesForVersion(state, write.version) > 0 ? "propagating" : "settled";
    appendEvent(state, "write-committed", {
      version: write.version,
      value: write.value,
      policy: write.mode,
      acknowledgements: ackCount,
    });
  }

  if (
    (write.status === "propagating" || write.status === "committed")
    && pendingMessagesForVersion(state, write.version) === 0
  ) {
    write.status = "settled";
    write.settledAt = state.now;
    appendEvent(state, "write-settled", { version: write.version });
  }
}

function deliverMessage(state, message) {
  const node = state.nodes[message.to];
  if (message.version < node.version) return;

  node.version = message.version;
  node.value = message.value;
  node.updatedAt = state.now;
  appendEvent(state, "message-delivered", {
    target: message.to,
    version: message.version,
  });
}

export function createConsensusState({
  mode = MODE_QUORUM,
  network = NETWORK_CLEAN,
} = {}) {
  assertMode(mode);
  assertNetwork(network);

  const initialValue = VALUE_SEQUENCE[0];
  return {
    now: 0,
    mode,
    network,
    sequenceIndex: 0,
    committedVersion: 0,
    committedValue: initialValue,
    committedAt: 0,
    nodes: {
      A: { id: "A", role: "leader", version: 0, value: initialValue, updatedAt: 0 },
      B: { id: "B", role: "replica", version: 0, value: initialValue, updatedAt: 0 },
      C: { id: "C", role: "replica", version: 0, value: initialValue, updatedAt: 0 },
    },
    inflight: [],
    write: null,
    nextMessageId: 1,
    nextEventId: 1,
    events: [],
  };
}

export function nextWriteValue(state) {
  const nextIndex = (state.sequenceIndex + 1) % VALUE_SEQUENCE.length;
  return VALUE_SEQUENCE[nextIndex];
}

export function canBeginWrite(state) {
  if (!state.write) return true;
  return state.write.status === "settled";
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
  next.write = {
    version,
    value,
    mode: next.mode,
    startedAt: next.now,
    committedAt: null,
    settledAt: null,
    status: next.mode === MODE_EVENTUAL ? "propagating" : "pending",
  };

  appendEvent(next, "write-started", { version, value, policy: next.mode });

  if (next.mode === MODE_EVENTUAL) {
    next.committedVersion = version;
    next.committedValue = value;
    next.committedAt = next.now;
    next.write.committedAt = next.now;
    appendEvent(next, "write-committed", {
      version,
      value,
      policy: next.mode,
      acknowledgements: 1,
    });
  }

  scheduleReplicaDelivery(next, "B", { version, value });
  scheduleReplicaDelivery(next, "C", { version, value });
  refreshWriteStatus(next);
  return next;
}

export function setMode(state, mode) {
  assertMode(mode);
  if (state.mode === mode) return state;
  const next = copyState(state);
  next.mode = mode;
  appendEvent(next, "mode-changed", { mode });
  return next;
}

export function setNetwork(state, network) {
  assertNetwork(network);
  if (state.network === network) return state;

  const next = copyState(state);
  next.network = network;
  appendEvent(next, "network-changed", { network });

  // Network changes act on messages that have not arrived yet. Rebuild those
  // deliveries from the present moment so the visual and state model stay in
  // lock-step with the selected profile.
  const latest = latestLeaderSnapshot(next);
  next.inflight = next.inflight.filter((message) => message.version > latest.version);

  scheduleReplicaDelivery(next, "B", latest);
  scheduleReplicaDelivery(next, "C", latest);
  refreshWriteStatus(next);
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
    const deliveredIds = new Set(delivered.map((message) => message.id));
    next.inflight = next.inflight.filter((message) => !deliveredIds.has(message.id));
    for (const message of delivered) deliverMessage(next, message);
  }

  refreshWriteStatus(next);
  return next;
}

export function agreementCount(state, version = state.nodes.A.version) {
  return NODE_IDS.reduce(
    (count, id) => count + (state.nodes[id].version === version ? 1 : 0),
    0,
  );
}

export function committedAgreementCount(state) {
  return NODE_IDS.reduce(
    (count, id) => count + (
      state.nodes[id].version === state.committedVersion
      && state.nodes[id].value === state.committedValue
        ? 1
        : 0
    ),
    0,
  );
}

export function distinctReplicaVersions(state) {
  return new Set(NODE_IDS.map((id) => state.nodes[id].version)).size;
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

  if (state.write && state.write.version === node.version && state.write.status === "pending") {
    return id === "A" ? "proposal" : "acked";
  }

  if (node.version === leaderVersion) return "synced";
  return "stale";
}

export function networkLabel(network) {
  if (network === NETWORK_SLOW_B) return "B +2.1s";
  if (network === NETWORK_ISOLATE_C) return "C isolated";
  return "clean links";
}
