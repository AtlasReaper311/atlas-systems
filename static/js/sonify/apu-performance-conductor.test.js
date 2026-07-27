import assert from "node:assert/strict";
import test from "node:test";

import {
  APU_PERFORMANCE_CONDUCTOR_BUILD_ID,
  connectiveArpeggioInstructionsForPhrase,
  ornamentInstructionsForPhrase,
  performanceCategories,
  shouldOmitForPhase,
  supplementalRhythmForDensity,
  velocityScaleForDensity,
} from "./apu-performance-conductor.js";

const plan = (silenceBudget, density, ornaments = [], overrides = {}) => ({
  silenceBudget,
  density,
  ornaments,
  phase: "groove",
  state: "healthy",
  phraseIndex: 0,
  bars: 0,
  ...overrides,
});

test("build id identifies the continuous-lead recovery candidate", () => {
  assert.match(APU_PERFORMANCE_CONDUCTOR_BUILD_ID, /continuous-lead-v4$/);
});

test("primary melody is never removed by phase silence", () => {
  for (const silenceBudget of [0, 0.25, 0.5, 0.75, 1]) {
    for (let step = 0; step < 128; step += 1) {
      assert.equal(
        shouldOmitForPhase({
          perfPlan: plan(silenceBudget, 0.1),
          category: "primary",
          stepIndex: step,
          phraseIndex: 4,
          seedHash: 17,
        }),
        false,
      );
    }
  }
});

test("secondary and supporting voices retain Pass C density behaviour", () => {
  let lowKept = 0;
  let highKept = 0;
  for (let step = 0; step < 256; step += 1) {
    if (!shouldOmitForPhase({ perfPlan: plan(0.2, 0.2), category: "secondary", stepIndex: step, phraseIndex: 3 })) lowKept += 1;
    if (!shouldOmitForPhase({ perfPlan: plan(0.2, 0.9), category: "secondary", stepIndex: step, phraseIndex: 3 })) highKept += 1;
  }
  assert.ok(highKept > lowKept);
});

test("connective arpeggio remains inspectable but is not auto-scheduled", () => {
  const perfPlan = plan(0.2, 0.7, [], { state: "healthy", phraseIndex: 2, bars: 4 });
  const diagnostic = connectiveArpeggioInstructionsForPhrase(perfPlan);
  const scheduled = ornamentInstructionsForPhrase(perfPlan);
  assert.equal(diagnostic.length, 3);
  assert.ok(diagnostic.every((instruction) => instruction.ornament === "connective-arp"));
  assert.equal(scheduled.some((instruction) => instruction.ornament === "connective-arp"), false);
  assert.ok(Object.isFrozen(scheduled));
});

test("authored structural ornaments remain scheduled", () => {
  const names = ["ripple", "stab", "tick", "swell", "glitch", "shimmer", "flourish", "structural", "reprise"];
  for (const name of names) {
    const instructions = ornamentInstructionsForPhrase(
      plan(0, 1, [{ name, size: "test", bar: 4 }], { phraseIndex: 2, bars: 4 }),
    );
    assert.ok(instructions.some((instruction) => instruction.ornament === name), name);
    assert.equal(instructions.some((instruction) => instruction.ornament === "connective-arp"), false, name);
    assert.ok(instructions.every((instruction) => instruction.offsetSteps >= 0 && instruction.offsetSteps < 32));
  }
});

test("remaining conductor helpers preserve bounded Pass C behaviour", () => {
  assert.ok(performanceCategories().includes("primary"));
  assert.ok(velocityScaleForDensity(plan(0, 1), "primary") <= 1);
  assert.ok(velocityScaleForDensity(plan(0, 0), "primary") >= 0.1);
  assert.deepEqual(supplementalRhythmForDensity(plan(0, 0.3), 2, 0), []);
  assert.equal(supplementalRhythmForDensity(plan(0, 0.7), 2, 0)[0].voice, "hat");
});
