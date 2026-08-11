import assert from "node:assert/strict";
import test from "node:test";

import { createPerformanceDirector } from "./apu-performance-director-v4.js";
import { mixDirectiveFor, safetyEnvelope } from "./apu-mix-director.js";

const frame = (state) => Object.freeze({ scoreState: state });

/**
 * A short integration test proving that the phrase plans produced by the
 * performance director are always accepted by the mix director and that
 * every combined output respects the safety envelope. This is the shape
 * of the Pass C engine wiring: perf director → phase → mix directive.
 */

test("directors compose deterministically over a 40-phrase run", () => {
  const runOne = createPerformanceDirector({ seed: "integration-test" });
  const runTwo = createPerformanceDirector({ seed: "integration-test" });

  const sequence = [
    ...Array(4).fill("unknown"),
    ...Array(6).fill("healthy"),
    ...Array(6).fill("warning"),
    ...Array(4).fill("critical"),
    ...Array(6).fill("warning"),
    ...Array(8).fill("healthy"),
    ...Array(6).fill("unknown"),
  ];

  const resultsOne = [];
  const resultsTwo = [];

  for (const state of sequence) {
    runOne.observe(frame(state));
    const planOne = runOne.advancePhrase();
    resultsOne.push(mixDirectiveFor({ state: planOne.state, phase: planOne.phase }));

    runTwo.observe(frame(state));
    const planTwo = runTwo.advancePhrase();
    resultsTwo.push(mixDirectiveFor({ state: planTwo.state, phase: planTwo.phase }));
  }

  for (let i = 0; i < resultsOne.length; i += 1) {
    assert.deepEqual(resultsOne[i], resultsTwo[i], `phrase ${i} diverged between identical runs`);
  }
});

test("integrated run visits every phase at least once over 60 phrases", () => {
  const director = createPerformanceDirector({ seed: "coverage-test", initialState: "healthy" });
  const visited = new Set();

  // Move the estate through every state to force each authored transition
  const sequence = [
    ...Array(6).fill("healthy"),
    ...Array(3).fill("warning"),
    ...Array(4).fill("critical"),
    ...Array(3).fill("warning"),
    ...Array(6).fill("healthy"),
    ...Array(4).fill("unknown"),
    ...Array(6).fill("healthy"),
    ...Array(3).fill("critical"),
    ...Array(6).fill("healthy"),
    ...Array(4).fill("warning"),
    ...Array(4).fill("healthy"),
    ...Array(4).fill("unknown"),
    ...Array(4).fill("healthy"),
    ...Array(3).fill("warning"),
  ];

  for (const state of sequence) {
    director.observe(frame(state));
    visited.add(director.advancePhrase().phase);
  }

  for (const expected of ["intro", "groove", "pressure", "rupture", "recovery", "afterglow"]) {
    assert.ok(visited.has(expected), `expected phase ${expected} was never reached`);
  }
});

test("integrated run never breaches the safety envelope", () => {
  const director = createPerformanceDirector({ seed: "safety-test" });
  const env = safetyEnvelope();

  const sequence = [
    ...Array(4).fill("unknown"),
    ...Array(6).fill("healthy"),
    ...Array(4).fill("critical"),
    ...Array(6).fill("healthy"),
    ...Array(4).fill("warning"),
    ...Array(4).fill("critical"),
  ];

  for (const state of sequence) {
    director.observe(frame(state));
    const plan = director.advancePhrase();
    const mix = mixDirectiveFor({ state: plan.state, phase: plan.phase });

    for (const bus of Object.values(mix.buses)) {
      assert.ok(bus.gainMul >= env.gainMulMin && bus.gainMul <= env.gainMulMax);
      assert.ok(bus.highcutHz >= env.highcutMinHz && bus.highcutHz <= env.highcutMaxHz);
      assert.ok(bus.width >= env.widthMin && bus.width <= env.widthMax);
    }
    for (const rule of mix.ducking) {
      assert.ok(rule.depthDb >= env.duckDepthMinDb && rule.depthDb <= env.duckDepthMaxDb);
    }
  }
});
