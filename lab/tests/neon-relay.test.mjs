import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  PRESETS,
  createCircuitState,
  cycleRelay,
  energizeCircuit,
  evaluateCircuit,
  resetFuse,
  setRelay,
  stateSummary,
} from "../neon-relay/neon-relay-core.js";

const html = readFileSync(new URL("../neon-relay/index.html", import.meta.url), "utf8");
const source = readFileSync(new URL("../neon-relay/neon-relay.js", import.meta.url), "utf8");
const css = readFileSync(new URL("../neon-relay/neon-relay.css", import.meta.url), "utf8");

test("baseline is deterministic and Ignition isolates the lower feeder", () => {
  const first = createCircuitState();
  const second = createCircuitState();
  assert.deepEqual(first, second);
  assert.equal(first.presetId, "prime");
  assert.equal(first.phase, "cold");
  assert.equal(first.relays.r2, "open");
  assert.deepEqual(PRESETS[0].sourceFeeders, ["r1"]);
  assert.deepEqual(PRESETS[0].lockedRelays, { r2: "open" });
});

test("Ignition solves as a one-feed direct-route tutorial", () => {
  let state = createCircuitState("prime");
  state = setRelay(state, "r1", "a");
  state = energizeCircuit(state);
  assert.equal(state.phase, "locked");
  assert.deepEqual(state.evaluation.outputs, { beacon: 1, archive: 0, actuator: 0 });
  assert.deepEqual(state.evaluation.activeTraceIds, ["source-r1", "r1-beacon"]);
  assert.equal(state.evaluation.sourceDraw, 1);
});

test("locked relays cannot be changed", () => {
  let state = createCircuitState("prime");
  state = cycleRelay(state, "r2");
  assert.equal(state.relays.r2, "open");
  state = setRelay(state, "r2", "a");
  assert.equal(state.relays.r2, "open");
});

test("Dual Bus begins with a deliberate two-feed overcurrent trap", () => {
  const powered = energizeCircuit(createCircuitState("split"));
  assert.equal(powered.phase, "tripped");
  assert.equal(powered.fuseOpen, true);
  assert.equal(powered.evaluation.overload, true);
  assert.ok(powered.evaluation.overloadedTraceIds.includes("r3-actuator"));
  assert.match(powered.evaluation.fault, /OVERCURRENT/);
});

test("Dual Bus solves by separating the two feeds", () => {
  let state = energizeCircuit(createCircuitState("split"));
  state = setRelay(state, "r1", "a");
  state = setRelay(state, "r2", "a");
  state = resetFuse(state);
  state = energizeCircuit(state);
  assert.equal(state.phase, "locked");
  assert.deepEqual(state.evaluation.outputs, { beacon: 1, archive: 1, actuator: 0 });
  assert.equal(state.evaluation.peakLoad, 1);
});

test("Bypass starts on a blocked primary branch", () => {
  let state = createCircuitState("failsafe");
  state = energizeCircuit(state);
  assert.equal(state.phase, "live");
  assert.ok(state.evaluation.blockedTraceIds.includes("r1-beacon"));
  assert.deepEqual(state.evaluation.outputs, { beacon: 0, archive: 0, actuator: 0 });
});

test("Bypass requires the full R1 to R3 to R4 alternate path", () => {
  let state = createCircuitState("failsafe");
  state = setRelay(state, "r1", "b");
  state = setRelay(state, "r3", "b");
  state = setRelay(state, "r4", "a");
  state = energizeCircuit(state);
  assert.equal(state.phase, "locked");
  assert.deepEqual(state.evaluation.outputs, { beacon: 1, archive: 0, actuator: 0 });
  assert.ok(state.evaluation.activeTraceIds.includes("r3-r4"));
  assert.ok(state.evaluation.activeTraceIds.includes("r4-beacon"));
});

test("Interlock trips if archive is energised", () => {
  let state = createCircuitState("balance");
  state = setRelay(state, "r2", "a");
  state = energizeCircuit(state);
  assert.equal(state.phase, "tripped");
  assert.equal(state.evaluation.interlock, true);
  assert.deepEqual(state.evaluation.interlockedOutputs, ["archive"]);
  assert.equal(state.evaluation.fault, "OUTPUT INTERLOCK / ARCHIVE");
});

test("Interlock solves with beacon direct and actuator on the lower shared bus", () => {
  let state = createCircuitState("balance");
  state = setRelay(state, "r1", "a");
  state = setRelay(state, "r2", "b");
  state = setRelay(state, "r3", "a");
  state = energizeCircuit(state);
  assert.equal(state.phase, "locked");
  assert.deepEqual(state.evaluation.outputs, { beacon: 1, archive: 0, actuator: 1 });
  assert.equal(state.evaluation.interlock, false);
});

test("R4 / B remains a deliberate short-to-ground protection event", () => {
  const result = evaluateCircuit("failsafe", { r1: "b", r2: "open", r3: "b", r4: "b" });
  assert.equal(result.short, true);
  assert.equal(result.tripped, true);
  assert.equal(result.fault, "SHORT TO GROUND");
});

test("all four challenges replay deterministically", () => {
  for (const preset of PRESETS) {
    const first = evaluateCircuit(preset.id, preset.initialRelays);
    const second = evaluateCircuit(preset.id, preset.initialRelays);
    assert.deepEqual(first, second, `${preset.id} should evaluate identically`);
    assert.match(stateSummary(createCircuitState(preset.id)), new RegExp(`Challenge ${preset.index}`));
  }
});

test("page presents challenges rather than generic presets and hides assistive state visually", () => {
  assert.match(html, /ATLAS \/ NEON RELAY \/ SIGNAL PUZZLES/);
  assert.match(html, />IGNITION</);
  assert.match(html, />DUAL BUS</);
  assert.match(html, />BYPASS</);
  assert.match(html, />INTERLOCK</);
  assert.match(html, /id="nr-hint-toggle"/);
  assert.match(html, /id="nr-next"/);
  assert.match(html, /id="nr-state-summary"/);
  assert.match(css, /\.visually-hidden\{/);
  assert.match(css, /clip:rect\(0,0,0,0\)/);
});

test("browser layer renders challenge-specific topology and completion progression", () => {
  assert.match(source, /dataset\.locked/);
  assert.match(source, /forbiddenOutputs/);
  assert.match(source, /blockedEdges/);
  assert.match(source, /solvedChallenges/);
  assert.match(source, /NEXT \/ /);
  assert.match(source, /prefers-reduced-motion: reduce/);
  assert.match(source, /document\.hidden/);
  assert.match(source, /Math\.sin/);
  assert.doesNotMatch(source, /Math\.random/);
});
