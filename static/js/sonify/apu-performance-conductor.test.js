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

test("build id identifies density-aware conductor", () => assert.match(APU_PERFORMANCE_CONDUCTOR_BUILD_ID, /v4$/));

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

test("density adds real rhythmic events, not only velocity", () => {
  assert.deepEqual(supplementalRhythmForDensity(plan(0, 0.3), 2, 0), []);
  assert.equal(supplementalRhythmForDensity(plan(0, 0.7), 2, 0)[0].voice, "hat");
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

test("every state receives prominent additive D4 runs only at composed phrases", () => {
  for (const state of ["healthy", "warning", "critical", "unknown"]) {
    const rest = connectiveArpeggioInstructionsForPhrase(
      plan(0.2, 0.7, [], { state, phraseIndex: 2, bars: 4 }),
    );
    assert.deepEqual(rest, [], `${state}/rest`);

    const instructions = connectiveArpeggioInstructionsForPhrase(
      plan(0.2, 0.7, [], { state, phraseIndex: 1, bars: 2 }),
    );
    assert.ok(instructions.length >= 6 && instructions.length <= 13, state);
    assert.ok(Object.isFrozen(instructions));
    assert.ok(instructions.every((instruction) => Object.isFrozen(instruction)));
    assert.ok(instructions.every((instruction) => instruction.ornament === "d4-arpeggio"));
    assert.ok(instructions.every((instruction) => instruction.additive === true));
    assert.ok(instructions.every((instruction) => instruction.offsetSteps >= 0 && instruction.offsetSteps <= 15));
    assert.ok(instructions.every((instruction) => instruction.velocity >= 0.12 && instruction.velocity <= 0.3));
    for (let index = 1; index < instructions.length; index += 1) {
      assert.equal(instructions[index].offsetSteps - instructions[index - 1].offsetSteps, 1);
    }
  }
});

test("D4 runs vary deterministic contour and phrase position", () => {
  const first = connectiveArpeggioInstructionsForPhrase(
    plan(0.2, 0.7, [], { state: "healthy", phraseIndex: 1, bars: 2 }),
  );
  const second = connectiveArpeggioInstructionsForPhrase(
    plan(0.2, 0.7, [], { state: "healthy", phraseIndex: 6, bars: 12 }),
  );
  assert.notDeepEqual(first.map((event) => event.midiOffset), second.map((event) => event.midiOffset));
  assert.notDeepEqual(first.map((event) => event.offsetSteps), second.map((event) => event.offsetSteps));
  assert.deepEqual(
    second,
    connectiveArpeggioInstructionsForPhrase(
      plan(0.2, 0.7, [], { state: "healthy", phraseIndex: 6, bars: 12 }),
    ),
  );
});

test("authored non-arp ornaments remain audible beside additive D4 runs", () => {
  const names = ["ripple", "stab", "tick", "swell", "glitch", "flourish", "structural", "reprise"];
  for (const name of names) {
    const instructions = ornamentInstructionsForPhrase(
      plan(0, 1, [{ name, size: "test", bar: 2 }], { phraseIndex: 1, bars: 2 }),
    );
    assert.ok(instructions.some((instruction) => instruction.ornament === "d4-arpeggio"), name);
    assert.ok(instructions.some((instruction) => instruction.ornament === name), name);
    assert.ok(instructions.every((instruction) => instruction.offsetSteps >= 0 && instruction.offsetSteps < 32));
  }
});

test("legacy shimmer is replaced rather than double-stacked on D4 passages", () => {
  const instructions = ornamentInstructionsForPhrase(
    plan(0, 1, [{ name: "shimmer", size: "test", bar: 8 }], { phraseIndex: 4, bars: 8 }),
  );
  assert.ok(instructions.some((instruction) => instruction.ornament === "d4-arpeggio"));
  assert.ok(!instructions.some((instruction) => instruction.ornament === "shimmer"));
});
