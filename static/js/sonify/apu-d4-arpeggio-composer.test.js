import assert from "node:assert/strict";
import test from "node:test";

import {
  APU_ARPEGGIO_COMPOSER_D4_BUILD_ID,
  APU_D4_PASSAGE_PHRASES,
  APU_D4_PROTECTED_EXPLORER_HANDOFF,
  arpeggioPassageCountForCycleRole,
  arpeggioPlanForPhrase,
  shouldCreateArpeggioSpace,
} from "./apu-arpeggio-composer-d4.js";
import {
  ornamentInstructionsForPhrase,
  shouldOmitForPhase,
} from "./apu-performance-conductor.js";
import {
  shouldOmitForPhase as baselineShouldOmitForPhase,
} from "./apu-performance-conductor-d1a-baseline.js";

const STATES = Object.freeze(["healthy", "warning", "critical", "unknown"]);
const CYCLES = Object.freeze([
  Object.freeze({ number: 0, role: "statement" }),
  Object.freeze({ number: 1, role: "development" }),
  Object.freeze({ number: 2, role: "contrast" }),
  Object.freeze({ number: 3, role: "reprise" }),
]);

function performancePlan(state, phraseIndex, overrides = {}) {
  return {
    silenceBudget: 0.2,
    density: 0.75,
    ornaments: [{ name: "shimmer", size: "medium", bar: phraseIndex * 2 }],
    phase: [11, 12].includes(phraseIndex % 16) ? "rupture" : "groove",
    state,
    phraseIndex,
    bars: phraseIndex * 2,
    ...overrides,
  };
}

function directionChanges(values) {
  const directions = [];
  for (let index = 1; index < values.length; index += 1) {
    const difference = values[index] - values[index - 1];
    if (difference === 0) continue;
    directions.push(Math.sign(difference));
  }
  let changes = 0;
  for (let index = 1; index < directions.length; index += 1) {
    if (directions[index] !== directions[index - 1]) changes += 1;
  }
  return changes;
}

test("every cycle schedules exactly seven additive arp passages", () => {
  for (const { number, role } of CYCLES) {
    assert.equal(arpeggioPassageCountForCycleRole(role), 7);
    for (const state of STATES) {
      const active = [];
      for (let cyclePhrase = 0; cyclePhrase < 16; cyclePhrase += 1) {
        const phraseIndex = number * 16 + cyclePhrase;
        const plan = arpeggioPlanForPhrase(performancePlan(state, phraseIndex));
        assert.equal(plan.buildId, APU_ARPEGGIO_COMPOSER_D4_BUILD_ID);
        if (plan.active) active.push(cyclePhrase);
      }
      assert.deepEqual(active, APU_D4_PASSAGE_PHRASES[role], `${state}/${role}`);
      assert.ok(!active.includes(11));
      assert.ok(!active.includes(12));
    }
  }
});

test("Explorer keeps the exact protected hand-off on primary in every cycle", () => {
  for (const { number } of CYCLES) {
    const phraseIndex = number * 16 + APU_D4_PROTECTED_EXPLORER_HANDOFF.cyclePhrase;
    const input = performancePlan("healthy", phraseIndex);
    const plan = arpeggioPlanForPhrase(input);
    assert.equal(plan.active, true);
    assert.equal(plan.protectedEvent, true);
    assert.equal(plan.role, "answer");
    assert.deepEqual(
      plan.instructions.map((instruction) => instruction.offsetSteps),
      APU_D4_PROTECTED_EXPLORER_HANDOFF.steps,
    );
    assert.deepEqual(
      plan.instructions.map((instruction) => instruction.midiOffset),
      APU_D4_PROTECTED_EXPLORER_HANDOFF.offsets,
    );
    assert.deepEqual(
      plan.instructions.map((instruction) => instruction.velocity),
      APU_D4_PROTECTED_EXPLORER_HANDOFF.velocities,
    );
    assert.ok(plan.instructions.every((instruction) => (
      instruction.duration === APU_D4_PROTECTED_EXPLORER_HANDOFF.duration
      && instruction.voice === "primary"
      && instruction.protectedEvent
      && instruction.additive
      && !instruction.protectedColourLayer
    )));

    const audible = ornamentInstructionsForPhrase(input)
      .filter((instruction) => instruction.protectedEvent);
    assert.equal(audible.length, 3);
    assert.ok(audible.every((instruction) => instruction.voice === "primary"));
  }
});

test("regular passages are long continuous up, down or tornado runs", () => {
  const seenShapes = new Set();
  for (const state of STATES) {
    for (let phraseIndex = 0; phraseIndex < 64; phraseIndex += 1) {
      const plan = arpeggioPlanForPhrase(performancePlan(state, phraseIndex));
      if (!plan.active || plan.protectedEvent) continue;
      assert.equal(plan.role, "feature");
      assert.ok(plan.instructions.length >= 6, `${state}/${phraseIndex}`);
      assert.ok(plan.instructions.length <= 13, `${state}/${phraseIndex}`);
      assert.deepEqual(plan.spaceCategories, []);
      assert.ok(["up", "down", "tornado"].includes(plan.contour));
      seenShapes.add(plan.contour);

      const steps = plan.instructions.map((instruction) => instruction.offsetSteps);
      for (let index = 1; index < steps.length; index += 1) {
        assert.equal(steps[index] - steps[index - 1], 1, `${state}/${phraseIndex}/step-${index}`);
      }
      assert.ok(steps[0] >= 0);
      assert.ok(steps.at(-1) <= 15, `${state}/${phraseIndex}/harmonic-half`);
      assert.ok(plan.instructions.every((instruction) => (
        instruction.additive
        && instruction.harmonyHalf === 0
        && instruction.ornament === "d4-arpeggio"
      )));

      const offsets = plan.instructions.map((instruction) => instruction.midiOffset);
      if (plan.contour === "up") {
        assert.ok(offsets.slice(1).every((value, index) => value > offsets[index]));
        assert.equal(directionChanges(offsets), 0);
      } else if (plan.contour === "down") {
        assert.ok(offsets.slice(1).every((value, index) => value < offsets[index]));
        assert.equal(directionChanges(offsets), 0);
      } else {
        assert.equal(directionChanges(offsets), 1);
        assert.ok(Math.max(...offsets) > offsets[0]);
        assert.ok(Math.max(...offsets) > offsets.at(-1));
      }
    }
  }
  assert.deepEqual([...seenShapes].sort(), ["down", "tornado", "up"]);
});

test("D4 never creates gaps or changes score-layer omission", () => {
  for (const state of STATES) {
    const input = performancePlan(state, 6);
    const plan = arpeggioPlanForPhrase(input);
    assert.equal(plan.active, true);
    for (const category of ["primary", "secondary", "pad", "service", "bass", "rhythm", "accent"]) {
      for (let stepIndex = 0; stepIndex < 32; stepIndex += 1) {
        assert.equal(
          shouldCreateArpeggioSpace({ perfPlan: input, category, stepIndex }),
          false,
          `${state}/${category}/${stepIndex}/space`,
        );
        assert.equal(
          shouldOmitForPhase({ perfPlan: input, category, stepIndex, phraseIndex: 6 }),
          baselineShouldOmitForPhase({ perfPlan: input, category, stepIndex, phraseIndex: 6 }),
          `${state}/${category}/${stepIndex}/omission`,
        );
      }
    }
  }
});

test("performance scheduling removes duplicate legacy arps without touching other music", () => {
  for (const state of STATES) {
    const instructions = ornamentInstructionsForPhrase(performancePlan(state, 6));
    const d4 = instructions.filter((instruction) => instruction.ornament === "d4-arpeggio");
    assert.ok(d4.length >= 6, state);
    assert.ok(d4.every((instruction) => instruction.additive));
    assert.ok(!instructions.some((instruction) => instruction.ornament === "connective-arp"));
    assert.ok(!instructions.some((instruction) => instruction.ornament === "state-arp"));
    assert.ok(!instructions.some((instruction) => instruction.ornament === "shimmer"));
  }
});

test("Peak remains complete and arp-free", () => {
  for (const state of STATES) {
    for (const phraseIndex of [11, 12]) {
      const input = performancePlan(state, phraseIndex);
      const plan = arpeggioPlanForPhrase(input);
      assert.equal(plan.active, false);
      assert.deepEqual(plan.instructions, []);
      assert.ok(!ornamentInstructionsForPhrase(input)
        .some((instruction) => instruction.ornament === "d4-arpeggio"));
    }
  }
});

test("state registers remain bounded and later cycles vary deterministically", () => {
  const ceilings = Object.freeze({
    healthy: 24,
    warning: 15,
    critical: 19,
    unknown: 12,
  });

  for (const [state, ceiling] of Object.entries(ceilings)) {
    const signatures = new Set();
    for (let phraseIndex = 0; phraseIndex < 64; phraseIndex += 1) {
      const plan = arpeggioPlanForPhrase(performancePlan(state, phraseIndex));
      for (const instruction of plan.instructions) {
        assert.ok(instruction.midiOffset <= ceiling, `${state}/${phraseIndex}/${instruction.midiOffset}`);
      }
      if (plan.active && !plan.protectedEvent) {
        signatures.add(JSON.stringify(plan.instructions.map((instruction) => instruction.midiOffset)));
        assert.deepEqual(
          arpeggioPlanForPhrase(performancePlan(state, phraseIndex)),
          plan,
        );
      }
    }
    assert.ok(signatures.size >= 3, `${state}/variation`);
  }
});
