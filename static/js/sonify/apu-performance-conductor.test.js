import assert from "node:assert/strict";
import test from "node:test";

import {
  APU_PERFORMANCE_CONDUCTOR_BUILD_ID,
  ornamentInstructionsForPhrase,
  performanceCategories,
  shouldOmitForPhase,
  supplementalRhythmForDensity,
  velocityScaleForDensity,
} from "./apu-performance-conductor.js";

const plan = (silenceBudget, density, ornaments = []) => ({ silenceBudget, density, ornaments, phase: "groove" });

test("build id identifies density-aware conductor", () => assert.match(APU_PERFORMANCE_CONDUCTOR_BUILD_ID, /v3$/));

test("silence decisions are deterministic", () => {
  const args = { perfPlan: plan(0.4, 0.5), category: "primary", stepIndex: 12, phraseIndex: 2, seedHash: 7 };
  assert.equal(shouldOmitForPhase(args), shouldOmitForPhase(args));
});

test("higher density keeps at least as many events as lower density", () => {
  let lowKept = 0;
  let highKept = 0;
  for (let step = 0; step < 256; step += 1) {
    if (!shouldOmitForPhase({ perfPlan: plan(0.2, 0.2), category: "secondary", stepIndex: step, phraseIndex: 3 })) lowKept += 1;
    if (!shouldOmitForPhase({ perfPlan: plan(0.2, 0.9), category: "secondary", stepIndex: step, phraseIndex: 3 })) highKept += 1;
  }
  assert.ok(highKept > lowKept);
});

test("continuity anchors survive even the sparsest phase", () => {
  const sparse = plan(1, 0);
  for (const step of [0, 4, 8, 12, 16, 20, 24, 28]) {
    assert.equal(shouldOmitForPhase({ perfPlan: sparse, category: "rhythm", stepIndex: step, phraseIndex: 9 }), false);
  }
  for (const step of [0, 8, 16, 24]) {
    assert.equal(shouldOmitForPhase({ perfPlan: sparse, category: "bass", stepIndex: step, phraseIndex: 9 }), false);
  }
  for (const step of [0, 16]) {
    assert.equal(shouldOmitForPhase({ perfPlan: sparse, category: "pad", stepIndex: step, phraseIndex: 9 }), false);
  }
});

test("sparse phases still leave room away from continuity anchors", () => {
  const sparse = plan(1, 0);
  let omitted = 0;
  for (let step = 1; step < 32; step += 2) {
    if (shouldOmitForPhase({ perfPlan: sparse, category: "secondary", stepIndex: step, phraseIndex: 9 })) omitted += 1;
  }
  assert.ok(omitted > 0);
});

test("density adds real rhythmic events, not only velocity", () => {
  assert.deepEqual(supplementalRhythmForDensity(plan(0, 0.3), 2, 0), []);
  assert.equal(supplementalRhythmForDensity(plan(0, 0.5), 2, 0)[0].voice, "hat");
  assert.ok(supplementalRhythmForDensity(plan(0, 0.95), 12, 0).some((event) => event.voice === "noiseAccent"));
});

test("supplemental rhythm is bounded and phrase deterministic", () => {
  const first = supplementalRhythmForDensity(plan(0, 1), 12, 4);
  const second = supplementalRhythmForDensity(plan(0, 1), 12, 4);
  assert.deepEqual(first, second);
  for (const event of first) assert.ok(event.velocity <= 0.5);
});

test("velocity scaling never boosts above one", () => {
  for (const category of performanceCategories()) {
    assert.ok(velocityScaleForDensity(plan(0, 1), category) <= 1);
    assert.ok(velocityScaleForDensity(plan(0, 0), category) >= 0.1);
  }
});

test("all authored ornaments map to audible instructions", () => {
  const names = ["ripple", "stab", "tick", "swell", "glitch", "shimmer", "flourish", "structural", "reprise"];
  for (const name of names) {
    const instructions = ornamentInstructionsForPhrase(plan(0, 1, [{ name, size: "test", bar: 4 }]));
    assert.ok(instructions.length > 0, name);
    assert.ok(instructions.every((instruction) => instruction.offsetSteps >= 0 && instruction.offsetSteps < 32));
  }
});
