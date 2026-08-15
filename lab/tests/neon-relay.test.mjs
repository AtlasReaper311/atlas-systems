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

test("baseline circuit state is deterministic and cold", () => {
  const first = createCircuitState();
  const second = createCircuitState();
  assert.deepEqual(first, second);
  assert.equal(first.presetId, "prime");
  assert.equal(first.phase, "cold");
  assert.equal(first.powered, false);
  assert.equal(first.fuseOpen, false);
  assert.deepEqual(first.relays, { r1: "open", r2: "open", r3: "open", r4: "open" });
});

test("Prime locks with one direct beacon feed", () => {
  let state = createCircuitState("prime");
  state = setRelay(state, "r1", "a");
  state = energizeCircuit(state);
  assert.equal(state.phase, "locked");
  assert.deepEqual(state.evaluation.outputs, { beacon: 1, archive: 0, actuator: 0 });
  assert.deepEqual(state.evaluation.activeTraceIds, ["source-r1", "r1-beacon"]);
  assert.equal(state.evaluation.sourceDraw, 1);
  assert.equal(state.evaluation.tripped, false);
});

test("Split Phase intentionally starts on a two-feed convergence that trips", () => {
  const initial = createCircuitState("split");
  const powered = energizeCircuit(initial);
  assert.equal(powered.phase, "tripped");
  assert.equal(powered.fuseOpen, true);
  assert.equal(powered.evaluation.overload, true);
  assert.equal(powered.evaluation.short, false);
  assert.ok(powered.evaluation.overloadedTraceIds.includes("r3-actuator"));
  assert.match(powered.evaluation.fault, /OVERCURRENT/);
});

test("fuse reset retains relay positions and safe reroute can then lock Split Phase", () => {
  let state = energizeCircuit(createCircuitState("split"));
  state = setRelay(state, "r1", "a");
  state = setRelay(state, "r2", "a");
  assert.equal(state.fuseOpen, true);
  assert.match(state.message, /Fuse remains open/);
  state = resetFuse(state);
  assert.deepEqual(state.relays, { r1: "a", r2: "a", r3: "a", r4: "open" });
  state = energizeCircuit(state);
  assert.equal(state.phase, "locked");
  assert.deepEqual(state.evaluation.outputs, { beacon: 1, archive: 1, actuator: 0 });
});

test("Failsafe exposes the isolated direct trace and can be rerouted through R3", () => {
  let state = createCircuitState("failsafe");
  state = energizeCircuit(state);
  assert.equal(state.phase, "live");
  assert.ok(state.evaluation.blockedTraceIds.includes("r1-beacon"));
  assert.deepEqual(state.evaluation.outputs, { beacon: 0, archive: 0, actuator: 0 });
  state = setRelay(state, "r1", "b");
  state = setRelay(state, "r3", "a");
  assert.equal(state.phase, "locked");
  assert.deepEqual(state.evaluation.outputs, { beacon: 0, archive: 0, actuator: 1 });
});

test("Balance requires separate beacon and actuator feeds", () => {
  let state = createCircuitState("balance");
  state = setRelay(state, "r1", "a");
  state = setRelay(state, "r2", "b");
  state = setRelay(state, "r3", "a");
  state = energizeCircuit(state);
  assert.equal(state.phase, "locked");
  assert.deepEqual(state.evaluation.outputs, { beacon: 1, archive: 0, actuator: 1 });
  assert.equal(state.evaluation.peakLoad, 1);
});

test("R4 position B is a deliberate short-to-ground trip", () => {
  const result = evaluateCircuit("prime", { r1: "b", r2: "open", r3: "b", r4: "b" });
  assert.equal(result.short, true);
  assert.equal(result.tripped, true);
  assert.equal(result.fault, "SHORT TO GROUND");
  assert.ok(result.activeTraceIds.includes("r4-dump"));
});

test("relay cycling is bounded and reversible", () => {
  let state = createCircuitState();
  state = cycleRelay(state, "r1");
  assert.equal(state.relays.r1, "a");
  state = cycleRelay(state, "r1");
  assert.equal(state.relays.r1, "b");
  state = cycleRelay(state, "r1");
  assert.equal(state.relays.r1, "open");
  state = cycleRelay(state, "r1", -1);
  assert.equal(state.relays.r1, "b");
});

test("all four patches replay deterministically", () => {
  for (const preset of PRESETS) {
    const first = evaluateCircuit(preset.id, preset.initialRelays);
    const second = evaluateCircuit(preset.id, preset.initialRelays);
    assert.deepEqual(first, second, `${preset.id} should evaluate identically`);
    assert.match(stateSummary(createCircuitState(preset.id)), new RegExp(`Patch ${preset.index}`));
  }
});

test("page exposes the synthetic circuit, protection, and patch contract", () => {
  assert.match(html, /ATLAS \/ NEON RELAY \/ CIRCUIT 01/);
  assert.match(html, /SIMULATED CIRCUIT/);
  assert.match(html, /Deterministic synthetic signal model\. No production Atlas Systems data connected\./);
  assert.match(html, /data-relay="r1"/);
  assert.match(html, /data-relay="r4"/);
  assert.match(html, /data-preset="prime"/);
  assert.match(html, /data-preset="balance"/);
  assert.match(html, /id="nr-power"/);
  assert.match(html, /id="nr-fuse-reset"/);
  assert.match(html, /id="nr-reset"/);
  assert.match(html, /R4 \/ B is a deliberate short-to-ground path/);
  assert.doesNotMatch(html, /production telemetry/i);
});

test("browser layer preserves keyboard, hidden-tab, reduced-motion, and deterministic scope behavior", () => {
  assert.match(source, /prefers-reduced-motion: reduce/);
  assert.match(source, /document\.hidden/);
  assert.match(source, /event\.key\.toLowerCase\(\) === "r"/);
  assert.match(source, /requestAnimationFrame/);
  assert.match(source, /Math\.sin/);
  assert.doesNotMatch(source, /Math\.random/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(css, /@media \(max-width: 680px\)/);
  assert.match(css, /overflow-x: hidden/);
  assert.match(css, /@keyframes nr-flow/);
});
