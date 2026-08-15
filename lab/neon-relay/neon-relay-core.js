export const RELAY_IDS = Object.freeze(["r1", "r2", "r3", "r4"]);
export const RELAY_POSITIONS = Object.freeze(["open", "a", "b"]);
export const OUTPUT_IDS = Object.freeze(["beacon", "archive", "actuator"]);

const OUTPUT_TEMPLATE = Object.freeze({ beacon: 0, archive: 0, actuator: 0 });
const EDGE_CAPACITY = 1;

export const TRACE_IDS = Object.freeze([
  "source-r1",
  "source-r2",
  "r1-beacon",
  "r1-r3",
  "r2-archive",
  "r2-r3",
  "r3-actuator",
  "r3-r4",
  "r4-beacon",
  "r4-dump",
]);

export const PRESETS = Object.freeze([
  Object.freeze({
    id: "prime",
    index: "01",
    name: "Prime",
    brief: "Wake the beacon with one clean feed. Leave every other load dark.",
    target: Object.freeze({ beacon: 1, archive: 0, actuator: 0 }),
    blockedEdges: Object.freeze([]),
    initialRelays: Object.freeze({ r1: "open", r2: "open", r3: "open", r4: "open" }),
    hint: "R1 can reach the beacon directly. The second source leg is optional.",
  }),
  Object.freeze({
    id: "split",
    index: "02",
    name: "Split phase",
    brief: "Feed beacon and archive at the same time without converging the two source legs.",
    target: Object.freeze({ beacon: 1, archive: 1, actuator: 0 }),
    blockedEdges: Object.freeze([]),
    initialRelays: Object.freeze({ r1: "b", r2: "b", r3: "a", r4: "open" }),
    hint: "Two feeds are safe while they remain separate. A shared downstream trace only accepts one.",
  }),
  Object.freeze({
    id: "failsafe",
    index: "03",
    name: "Failsafe",
    brief: "The direct beacon trace is isolated. Deliver exactly one feed to the actuator through the relay chain.",
    target: Object.freeze({ beacon: 0, archive: 0, actuator: 1 }),
    blockedEdges: Object.freeze(["r1-beacon"]),
    initialRelays: Object.freeze({ r1: "a", r2: "open", r3: "open", r4: "open" }),
    hint: "The blocked branch is safe but useless. Divert one source leg into R3 instead.",
  }),
  Object.freeze({
    id: "balance",
    index: "04",
    name: "Balance",
    brief: "Hold beacon and actuator together. Keep archive dark and avoid a two-feed collision at R3.",
    target: Object.freeze({ beacon: 1, archive: 0, actuator: 1 }),
    blockedEdges: Object.freeze([]),
    initialRelays: Object.freeze({ r1: "b", r2: "b", r3: "a", r4: "open" }),
    hint: "One source can take the direct beacon path while the other continues through R3.",
  }),
]);

export const PRESET_BY_ID = Object.freeze(
  Object.fromEntries(PRESETS.map((preset) => [preset.id, preset])),
);

function cloneRelays(relays) {
  return Object.fromEntries(RELAY_IDS.map((id) => [id, relays[id] || "open"]));
}

function emptyTraceLoads() {
  return Object.fromEntries(TRACE_IDS.map((id) => [id, 0]));
}

function pushTrace(path, traceLoads, traceId, preset) {
  traceLoads[traceId] += 1;
  path.push(traceId);
  return preset.blockedEdges.includes(traceId);
}

function routeFeed({ feeder, relays, preset, traceLoads }) {
  const path = [];
  const blocked = [];
  const outputs = { ...OUTPUT_TEMPLATE };
  let short = false;

  const sourceTrace = feeder === "r1" ? "source-r1" : "source-r2";
  const feederPosition = relays[feeder];
  if (feederPosition === "open") {
    return { feeder, path, blocked, outputs, short };
  }

  if (pushTrace(path, traceLoads, sourceTrace, preset)) {
    blocked.push(sourceTrace);
    return { feeder, path, blocked, outputs, short };
  }

  if (feeder === "r1") {
    if (feederPosition === "a") {
      if (pushTrace(path, traceLoads, "r1-beacon", preset)) blocked.push("r1-beacon");
      else outputs.beacon += 1;
      return { feeder, path, blocked, outputs, short };
    }
    if (pushTrace(path, traceLoads, "r1-r3", preset)) {
      blocked.push("r1-r3");
      return { feeder, path, blocked, outputs, short };
    }
  } else {
    if (feederPosition === "a") {
      if (pushTrace(path, traceLoads, "r2-archive", preset)) blocked.push("r2-archive");
      else outputs.archive += 1;
      return { feeder, path, blocked, outputs, short };
    }
    if (pushTrace(path, traceLoads, "r2-r3", preset)) {
      blocked.push("r2-r3");
      return { feeder, path, blocked, outputs, short };
    }
  }

  const r3Position = relays.r3;
  if (r3Position === "open") return { feeder, path, blocked, outputs, short };
  if (r3Position === "a") {
    if (pushTrace(path, traceLoads, "r3-actuator", preset)) blocked.push("r3-actuator");
    else outputs.actuator += 1;
    return { feeder, path, blocked, outputs, short };
  }

  if (pushTrace(path, traceLoads, "r3-r4", preset)) {
    blocked.push("r3-r4");
    return { feeder, path, blocked, outputs, short };
  }

  const r4Position = relays.r4;
  if (r4Position === "open") return { feeder, path, blocked, outputs, short };
  if (r4Position === "a") {
    if (pushTrace(path, traceLoads, "r4-beacon", preset)) blocked.push("r4-beacon");
    else outputs.beacon += 1;
    return { feeder, path, blocked, outputs, short };
  }

  if (pushTrace(path, traceLoads, "r4-dump", preset)) blocked.push("r4-dump");
  else short = true;
  return { feeder, path, blocked, outputs, short };
}

function targetMatches(outputs, target) {
  return OUTPUT_IDS.every((id) => outputs[id] === target[id]);
}

function outputSummary(outputs) {
  return OUTPUT_IDS
    .filter((id) => outputs[id] > 0)
    .map((id) => `${id.toUpperCase()}×${outputs[id]}`)
    .join(" + ") || "NO LOAD";
}

export function evaluateCircuit(presetId, relayInput) {
  const preset = PRESET_BY_ID[presetId];
  if (!preset) throw new Error(`Unknown Neon Relay preset: ${presetId}`);
  const relays = cloneRelays(relayInput);
  const traceLoads = emptyTraceLoads();
  const routes = ["r1", "r2"].map((feeder) => routeFeed({ feeder, relays, preset, traceLoads }));
  const outputs = { ...OUTPUT_TEMPLATE };
  const blocked = new Set();
  let short = false;

  for (const route of routes) {
    for (const id of OUTPUT_IDS) outputs[id] += route.outputs[id];
    for (const traceId of route.blocked) blocked.add(traceId);
    short ||= route.short;
  }

  const overloadedTraces = TRACE_IDS.filter((traceId) => traceLoads[traceId] > EDGE_CAPACITY);
  const overload = overloadedTraces.length > 0;
  const tripped = short || overload;
  const solved = !tripped && targetMatches(outputs, preset.target);
  const sourceDraw = traceLoads["source-r1"] + traceLoads["source-r2"];
  const activeTraceIds = TRACE_IDS.filter((traceId) => traceLoads[traceId] > 0);
  const blockedTraceIds = [...blocked];
  const peakLoad = Math.max(0, ...Object.values(traceLoads));
  const voltage = tripped ? 0 : sourceDraw === 0 ? 0 : Math.max(9.6, 12 - Math.max(0, sourceDraw - 1) * 0.35);
  const stability = tripped ? 0 : solved ? 100 : sourceDraw === 0 ? 100 : 76;

  let fault = null;
  if (short) fault = "SHORT TO GROUND";
  else if (overload) fault = `OVERCURRENT / ${overloadedTraces[0].toUpperCase()}`;

  return Object.freeze({
    presetId,
    relays: Object.freeze(relays),
    traceLoads: Object.freeze(traceLoads),
    activeTraceIds: Object.freeze(activeTraceIds),
    blockedTraceIds: Object.freeze(blockedTraceIds),
    overloadedTraceIds: Object.freeze(overloadedTraces),
    outputs: Object.freeze(outputs),
    routes: Object.freeze(routes.map((route) => Object.freeze({
      ...route,
      path: Object.freeze([...route.path]),
      blocked: Object.freeze([...route.blocked]),
      outputs: Object.freeze({ ...route.outputs }),
    }))),
    sourceDraw,
    peakLoad,
    voltage,
    stability,
    short,
    overload,
    tripped,
    solved,
    fault,
    outputSummary: outputSummary(outputs),
  });
}

function phaseFromEvaluation(powered, evaluation) {
  if (!powered) return "cold";
  if (evaluation.tripped) return "tripped";
  if (evaluation.solved) return "locked";
  return "live";
}

function messageFor(phase, evaluation, preset) {
  if (phase === "cold") return "Circuit cold. Set the relays, then energise the board.";
  if (phase === "tripped") {
    if (evaluation.short) return "Fuse opened on a short-to-ground path. Cut power, reroute, and reset the fuse.";
    return "Fuse opened before a shared trace exceeded its one-feed capacity.";
  }
  if (phase === "locked") return `Pattern locked. ${evaluation.outputSummary} matches ${preset.name.toUpperCase()}.`;
  if (evaluation.sourceDraw === 0) return "Power is on, but both source relays are open.";
  if (evaluation.blockedTraceIds.length > 0) return "Current reached an isolated trace and stopped safely. The target is still dark.";
  return `${evaluation.outputSummary} is stable, but it does not match the target pattern yet.`;
}

export function createCircuitState(presetId = PRESETS[0].id) {
  const preset = PRESET_BY_ID[presetId];
  if (!preset) throw new Error(`Unknown Neon Relay preset: ${presetId}`);
  const relays = cloneRelays(preset.initialRelays);
  const evaluation = evaluateCircuit(presetId, relays);
  return Object.freeze({
    presetId,
    relays: Object.freeze(relays),
    powered: false,
    fuseOpen: false,
    phase: "cold",
    evaluation,
    message: messageFor("cold", evaluation, preset),
    revision: 0,
  });
}

function withEvaluation(state, changes) {
  const nextRelays = cloneRelays(changes.relays || state.relays);
  const powered = changes.powered ?? state.powered;
  const evaluation = evaluateCircuit(state.presetId, nextRelays);
  const fuseOpen = powered && evaluation.tripped ? true : (changes.fuseOpen ?? state.fuseOpen);
  const effectivePowered = fuseOpen ? false : powered;
  const phase = fuseOpen ? "tripped" : phaseFromEvaluation(effectivePowered, evaluation);
  const preset = PRESET_BY_ID[state.presetId];
  return Object.freeze({
    ...state,
    relays: Object.freeze(nextRelays),
    powered: effectivePowered,
    fuseOpen,
    phase,
    evaluation,
    message: fuseOpen && !evaluation.tripped
      ? "Fuse remains open. The route has changed; reset the fuse before re-energising."
      : messageFor(phase, evaluation, preset),
    revision: state.revision + 1,
  });
}

export function setRelay(state, relayId, position) {
  if (!RELAY_IDS.includes(relayId)) throw new Error(`Unknown Neon Relay relay: ${relayId}`);
  if (!RELAY_POSITIONS.includes(position)) throw new Error(`Unknown Neon Relay position: ${position}`);
  const relays = cloneRelays(state.relays);
  relays[relayId] = position;
  return withEvaluation(state, { relays });
}

export function cycleRelay(state, relayId, direction = 1) {
  if (!RELAY_IDS.includes(relayId)) throw new Error(`Unknown Neon Relay relay: ${relayId}`);
  const index = RELAY_POSITIONS.indexOf(state.relays[relayId]);
  const step = direction < 0 ? -1 : 1;
  const position = RELAY_POSITIONS[(index + step + RELAY_POSITIONS.length) % RELAY_POSITIONS.length];
  return setRelay(state, relayId, position);
}

export function energizeCircuit(state) {
  if (state.fuseOpen) return state;
  return withEvaluation(state, { powered: true, fuseOpen: false });
}

export function cutPower(state) {
  const evaluation = evaluateCircuit(state.presetId, state.relays);
  return Object.freeze({
    ...state,
    powered: false,
    phase: state.fuseOpen ? "tripped" : "cold",
    evaluation,
    message: state.fuseOpen
      ? "Fuse open. Reset it before energising the board again."
      : messageFor("cold", evaluation, PRESET_BY_ID[state.presetId]),
    revision: state.revision + 1,
  });
}

export function resetFuse(state) {
  const evaluation = evaluateCircuit(state.presetId, state.relays);
  return Object.freeze({
    ...state,
    powered: false,
    fuseOpen: false,
    phase: "cold",
    evaluation,
    message: "Fuse reset. Relay positions retained; inspect the route before re-energising.",
    revision: state.revision + 1,
  });
}

export function resetPatch(state) {
  const fresh = createCircuitState(state.presetId);
  return Object.freeze({ ...fresh, revision: state.revision + 1 });
}

export function selectPreset(state, presetId) {
  const fresh = createCircuitState(presetId);
  return Object.freeze({ ...fresh, revision: state.revision + 1 });
}

export function stateSummary(state) {
  const preset = PRESET_BY_ID[state.presetId];
  const relaySummary = RELAY_IDS.map((id) => `${id.toUpperCase()} ${state.relays[id].toUpperCase()}`).join(", ");
  const outputSummary = OUTPUT_IDS.map((id) => `${id} ${state.evaluation.outputs[id]}`).join(", ");
  const blocked = state.evaluation.blockedTraceIds.length
    ? ` Blocked traces: ${state.evaluation.blockedTraceIds.join(", ")}.`
    : "";
  const fault = state.evaluation.fault ? ` Fault: ${state.evaluation.fault}.` : "";
  return `Patch ${preset.index} ${preset.name}. Phase ${state.phase}. ${relaySummary}. Outputs: ${outputSummary}.${blocked}${fault} ${state.message}`;
}
