export const RELAY_IDS = Object.freeze(["r1", "r2", "r3", "r4"]);
export const RELAY_POSITIONS = Object.freeze(["open", "a", "b"]);
export const OUTPUT_IDS = Object.freeze(["beacon", "archive", "actuator"]);

const OUTPUT_TEMPLATE = Object.freeze({ beacon: 0, archive: 0, actuator: 0 });
const DEFAULT_EDGE_CAPACITY = 1;

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
    name: "Ignition",
    brief: "Wake the beacon from the upper source bus. The lower feeder is physically isolated.",
    rule: "ONE FEED / DIRECT ROUTE",
    hazard: "NONE",
    topology: "R1 ONLY",
    target: Object.freeze({ beacon: 1, archive: 0, actuator: 0 }),
    sourceFeeders: Object.freeze(["r1"]),
    lockedRelays: Object.freeze({ r2: "open" }),
    blockedEdges: Object.freeze([]),
    forbiddenOutputs: Object.freeze([]),
    initialRelays: Object.freeze({ r1: "open", r2: "open", r3: "open", r4: "open" }),
    hint: "R1 / A is the clean direct branch to the beacon.",
  }),
  Object.freeze({
    id: "split",
    index: "02",
    name: "Dual bus",
    brief: "Power beacon and archive together. Keep the two feeds separate or the shared R3 trace will trip overcurrent protection.",
    rule: "TWO FEEDS / NO CONVERGENCE",
    hazard: "R3 OVERCURRENT",
    topology: "DUAL SOURCE",
    target: Object.freeze({ beacon: 1, archive: 1, actuator: 0 }),
    sourceFeeders: Object.freeze(["r1", "r2"]),
    lockedRelays: Object.freeze({}),
    blockedEdges: Object.freeze([]),
    forbiddenOutputs: Object.freeze([]),
    initialRelays: Object.freeze({ r1: "b", r2: "b", r3: "a", r4: "open" }),
    hint: "The direct A branches never share a downstream trace.",
  }),
  Object.freeze({
    id: "failsafe",
    index: "03",
    name: "Bypass",
    brief: "The primary beacon trace is isolated. Restore the beacon through the full R1 → R3 → R4 bypass chain.",
    rule: "BROKEN PRIMARY / REROUTE",
    hazard: "R4 / B → GROUND",
    topology: "LONG BYPASS",
    target: Object.freeze({ beacon: 1, archive: 0, actuator: 0 }),
    sourceFeeders: Object.freeze(["r1"]),
    lockedRelays: Object.freeze({ r2: "open" }),
    blockedEdges: Object.freeze(["r1-beacon"]),
    forbiddenOutputs: Object.freeze([]),
    initialRelays: Object.freeze({ r1: "a", r2: "open", r3: "open", r4: "open" }),
    hint: "Divert at R1, continue through R3, then take R4 / A back to the beacon.",
  }),
  Object.freeze({
    id: "balance",
    index: "04",
    name: "Interlock",
    brief: "Hold beacon and actuator together. Archive is protected: energising it opens the fuse immediately.",
    rule: "TWO OUTPUTS / PROTECTED LOAD",
    hazard: "ARCHIVE INTERLOCK",
    topology: "SPLIT + SHARED BUS",
    target: Object.freeze({ beacon: 1, archive: 0, actuator: 1 }),
    sourceFeeders: Object.freeze(["r1", "r2"]),
    lockedRelays: Object.freeze({}),
    blockedEdges: Object.freeze([]),
    forbiddenOutputs: Object.freeze(["archive"]),
    initialRelays: Object.freeze({ r1: "open", r2: "open", r3: "open", r4: "open" }),
    hint: "Keep R1 on its direct beacon path and send only R2 through R3 to the actuator.",
  }),
]);

export const PRESET_BY_ID = Object.freeze(Object.fromEntries(PRESETS.map((preset) => [preset.id, preset])));

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

  if (!preset.sourceFeeders.includes(feeder)) return { feeder, path, blocked, outputs, short, isolated: true };

  const sourceTrace = feeder === "r1" ? "source-r1" : "source-r2";
  const feederPosition = relays[feeder];
  if (feederPosition === "open") return { feeder, path, blocked, outputs, short, isolated: false };

  if (pushTrace(path, traceLoads, sourceTrace, preset)) {
    blocked.push(sourceTrace);
    return { feeder, path, blocked, outputs, short, isolated: false };
  }

  if (feeder === "r1") {
    if (feederPosition === "a") {
      if (pushTrace(path, traceLoads, "r1-beacon", preset)) blocked.push("r1-beacon");
      else outputs.beacon += 1;
      return { feeder, path, blocked, outputs, short, isolated: false };
    }
    if (pushTrace(path, traceLoads, "r1-r3", preset)) {
      blocked.push("r1-r3");
      return { feeder, path, blocked, outputs, short, isolated: false };
    }
  } else {
    if (feederPosition === "a") {
      if (pushTrace(path, traceLoads, "r2-archive", preset)) blocked.push("r2-archive");
      else outputs.archive += 1;
      return { feeder, path, blocked, outputs, short, isolated: false };
    }
    if (pushTrace(path, traceLoads, "r2-r3", preset)) {
      blocked.push("r2-r3");
      return { feeder, path, blocked, outputs, short, isolated: false };
    }
  }

  const r3Position = relays.r3;
  if (r3Position === "open") return { feeder, path, blocked, outputs, short, isolated: false };
  if (r3Position === "a") {
    if (pushTrace(path, traceLoads, "r3-actuator", preset)) blocked.push("r3-actuator");
    else outputs.actuator += 1;
    return { feeder, path, blocked, outputs, short, isolated: false };
  }

  if (pushTrace(path, traceLoads, "r3-r4", preset)) {
    blocked.push("r3-r4");
    return { feeder, path, blocked, outputs, short, isolated: false };
  }

  const r4Position = relays.r4;
  if (r4Position === "open") return { feeder, path, blocked, outputs, short, isolated: false };
  if (r4Position === "a") {
    if (pushTrace(path, traceLoads, "r4-beacon", preset)) blocked.push("r4-beacon");
    else outputs.beacon += 1;
    return { feeder, path, blocked, outputs, short, isolated: false };
  }

  if (pushTrace(path, traceLoads, "r4-dump", preset)) blocked.push("r4-dump");
  else short = true;
  return { feeder, path, blocked, outputs, short, isolated: false };
}

function targetMatches(outputs, target) {
  return OUTPUT_IDS.every((id) => outputs[id] === target[id]);
}

function outputSummary(outputs) {
  return OUTPUT_IDS.filter((id) => outputs[id] > 0).map((id) => `${id.toUpperCase()}×${outputs[id]}`).join(" + ") || "NO LOAD";
}

function edgeCapacity(preset, traceId) {
  return preset.edgeCapacities?.[traceId] ?? DEFAULT_EDGE_CAPACITY;
}

export function evaluateCircuit(presetId, relayInput) {
  const preset = PRESET_BY_ID[presetId];
  if (!preset) throw new Error(`Unknown Neon Relay challenge: ${presetId}`);
  const relays = cloneRelays(relayInput);
  for (const [relayId, position] of Object.entries(preset.lockedRelays)) relays[relayId] = position;

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

  const overloadedTraces = TRACE_IDS.filter((traceId) => traceLoads[traceId] > edgeCapacity(preset, traceId));
  const overload = overloadedTraces.length > 0;
  const interlockedOutputs = preset.forbiddenOutputs.filter((outputId) => outputs[outputId] > 0);
  const interlock = interlockedOutputs.length > 0;
  const tripped = short || overload || interlock;
  const solved = !tripped && targetMatches(outputs, preset.target);
  const sourceDraw = preset.sourceFeeders.reduce((sum, feeder) => sum + traceLoads[`source-${feeder}`], 0);
  const activeTraceIds = TRACE_IDS.filter((traceId) => traceLoads[traceId] > 0);
  const blockedTraceIds = [...blocked];
  const peakLoad = Math.max(0, ...Object.values(traceLoads));
  const voltage = tripped ? 0 : sourceDraw === 0 ? 0 : Math.max(9.6, 12 - Math.max(0, sourceDraw - 1) * 0.35);
  const stability = tripped ? 0 : solved ? 100 : sourceDraw === 0 ? 100 : 78;

  let fault = null;
  if (short) fault = "SHORT TO GROUND";
  else if (overload) fault = `OVERCURRENT / ${overloadedTraces[0].toUpperCase()}`;
  else if (interlock) fault = `OUTPUT INTERLOCK / ${interlockedOutputs[0].toUpperCase()}`;

  return Object.freeze({
    presetId,
    relays: Object.freeze(relays),
    traceLoads: Object.freeze(traceLoads),
    activeTraceIds: Object.freeze(activeTraceIds),
    blockedTraceIds: Object.freeze(blockedTraceIds),
    overloadedTraceIds: Object.freeze(overloadedTraces),
    interlockedOutputs: Object.freeze(interlockedOutputs),
    outputs: Object.freeze(outputs),
    routes: Object.freeze(routes.map((route) => Object.freeze({ ...route, path: Object.freeze([...route.path]), blocked: Object.freeze([...route.blocked]), outputs: Object.freeze({ ...route.outputs }) }))),
    sourceDraw,
    peakLoad,
    voltage,
    stability,
    short,
    overload,
    interlock,
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
  if (phase === "cold") return "Circuit cold. Configure the relay route, then energise when you are ready to test it.";
  if (phase === "tripped") {
    if (evaluation.short) return "Protection opened on a short-to-ground path. Reroute before resetting the fuse.";
    if (evaluation.interlock) return `${evaluation.interlockedOutputs[0].toUpperCase()} is protected in this challenge. Its interlock opened the fuse.`;
    return "Protection opened before a shared trace exceeded its one-feed capacity.";
  }
  if (phase === "locked") return `Challenge solved. ${evaluation.outputSummary} matches ${preset.name.toUpperCase()}.`;
  if (evaluation.sourceDraw === 0) return "Power is on, but no armed source feed has a closed route.";
  if (evaluation.blockedTraceIds.length > 0) return "Current reached an isolated trace and stopped safely. Find the alternate route.";
  return `${evaluation.outputSummary} is electrically stable, but the requested pattern is not complete.`;
}

export function createCircuitState(presetId = PRESETS[0].id) {
  const preset = PRESET_BY_ID[presetId];
  if (!preset) throw new Error(`Unknown Neon Relay challenge: ${presetId}`);
  const relays = cloneRelays(preset.initialRelays);
  for (const [relayId, position] of Object.entries(preset.lockedRelays)) relays[relayId] = position;
  const evaluation = evaluateCircuit(presetId, relays);
  return Object.freeze({ presetId, relays: Object.freeze(relays), powered: false, fuseOpen: false, phase: "cold", evaluation, message: messageFor("cold", evaluation, preset), revision: 0 });
}

function withEvaluation(state, changes) {
  const preset = PRESET_BY_ID[state.presetId];
  const nextRelays = cloneRelays(changes.relays || state.relays);
  for (const [relayId, position] of Object.entries(preset.lockedRelays)) nextRelays[relayId] = position;
  const powered = changes.powered ?? state.powered;
  const evaluation = evaluateCircuit(state.presetId, nextRelays);
  const fuseOpen = powered && evaluation.tripped ? true : (changes.fuseOpen ?? state.fuseOpen);
  const effectivePowered = fuseOpen ? false : powered;
  const phase = fuseOpen ? "tripped" : phaseFromEvaluation(effectivePowered, evaluation);
  return Object.freeze({
    ...state,
    relays: Object.freeze(nextRelays),
    powered: effectivePowered,
    fuseOpen,
    phase,
    evaluation,
    message: fuseOpen && !evaluation.tripped ? "Fuse remains open. The route changed, but protection must be reset before another test." : messageFor(phase, evaluation, preset),
    revision: state.revision + 1,
  });
}

export function setRelay(state, relayId, position) {
  if (!RELAY_IDS.includes(relayId)) throw new Error(`Unknown Neon Relay relay: ${relayId}`);
  if (!RELAY_POSITIONS.includes(position)) throw new Error(`Unknown Neon Relay position: ${position}`);
  const preset = PRESET_BY_ID[state.presetId];
  if (Object.hasOwn(preset.lockedRelays, relayId)) return state;
  const relays = cloneRelays(state.relays);
  relays[relayId] = position;
  return withEvaluation(state, { relays });
}

export function cycleRelay(state, relayId, direction = 1) {
  if (!RELAY_IDS.includes(relayId)) throw new Error(`Unknown Neon Relay relay: ${relayId}`);
  const preset = PRESET_BY_ID[state.presetId];
  if (Object.hasOwn(preset.lockedRelays, relayId)) return state;
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
  return Object.freeze({ ...state, powered: false, phase: state.fuseOpen ? "tripped" : "cold", evaluation, message: state.fuseOpen ? "Fuse open. Reset protection before energising the board again." : messageFor("cold", evaluation, PRESET_BY_ID[state.presetId]), revision: state.revision + 1 });
}

export function resetFuse(state) {
  const evaluation = evaluateCircuit(state.presetId, state.relays);
  return Object.freeze({ ...state, powered: false, fuseOpen: false, phase: "cold", evaluation, message: "Fuse reset. Relay positions retained; inspect the route before re-energising.", revision: state.revision + 1 });
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
  const blocked = state.evaluation.blockedTraceIds.length ? ` Blocked traces: ${state.evaluation.blockedTraceIds.join(", ")}.` : "";
  const fault = state.evaluation.fault ? ` Fault: ${state.evaluation.fault}.` : "";
  return `Challenge ${preset.index} ${preset.name}. Phase ${state.phase}. ${relaySummary}. Outputs: ${outputSummary}.${blocked}${fault} ${state.message}`;
}
