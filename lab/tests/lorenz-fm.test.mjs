import assert from "node:assert/strict";
import test from "node:test";

import {
  LorenzAttractor,
  mapLorenzState,
} from "../signal/lorenz-fm/lorenz-attractor.js";

test("the fixed-step Lorenz trajectory is deterministic", () => {
  const first = new LorenzAttractor();
  const second = new LorenzAttractor();
  first.step(2400);
  second.step(2400);
  assert.deepEqual(first.state, second.state);
  assert.equal(first.elapsed, second.elapsed);
});

test("reset restores the declared initial state and elapsed time", () => {
  const attractor = new LorenzAttractor({ state: [0.2, -0.1, 0.3] });
  attractor.step(32);
  assert.notDeepEqual(attractor.state, [0.2, -0.1, 0.3]);
  assert.deepEqual(attractor.reset(), [0.2, -0.1, 0.3]);
  assert.equal(attractor.elapsed, 0);
});

test("long trajectories remain finite", () => {
  const attractor = new LorenzAttractor();
  for (let block = 0; block < 40; block += 1) {
    const state = attractor.step(1000);
    assert.ok(state.every(Number.isFinite));
  }
});

test("audio mappings stay inside declared safety bounds", () => {
  const mapped = mapLorenzState([1e6, -1e6, 1e6], { fmDepth: 999 });
  assert.ok(mapped.carrier >= 55 && mapped.carrier <= 220);
  assert.ok(mapped.modulator >= 18 && mapped.modulator <= 180);
  assert.ok(mapped.cutoff >= 140 && mapped.cutoff <= 4200);
  assert.ok(mapped.pan >= -0.85 && mapped.pan <= 0.85);
  assert.equal(mapped.fmDepth, 180);
});

test("snapshots cannot mutate attractor state", () => {
  const attractor = new LorenzAttractor();
  const snapshot = attractor.snapshot();
  assert.ok(Object.isFrozen(snapshot));
  assert.ok(Object.isFrozen(snapshot.state));
  assert.throws(() => snapshot.state.push(1), TypeError);
  assert.deepEqual(attractor.state, [0.1, 0, 0]);
});
