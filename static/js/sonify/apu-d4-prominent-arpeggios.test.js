import assert from "node:assert/strict";
import test from "node:test";

import {
  APU_ARPEGGIO_COMPOSER_D4_BUILD_ID,
  APU_D4_CYCLE_ROLES,
  APU_D4_FEATURE_PHRASES,
  d4ArpeggioPlanForPhrase,
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
    if (difference !== 0) directions.push(Math.sign(difference));
  }
  let changes = 0;
  for (let index = 1; index < directions.length; index += 1) {
    if (directions[index] !== directions[index - 1]) changes += 1;
  }
  return changes;
}

test("every cycle has exactly seven major D4 feature runs", () => {
  assert.deepEqual(APU_D4_CYCLE_ROLES, ["statement", "development", "contrast", "reprise"]);
  for (const { number, role } of CYCLES) {
    for (const state of STATES) {
      const active = [];
      for (let cyclePhrase = 0; cyclePhrase < 16; cyclePhrase += 1) {
        const phraseIndex = number * 16 + cyclePhrase;
        const plan = d4ArpeggioPlanForPhrase(performancePlan(state, phraseIndex));
        assert.equal(plan.buildId, APU_ARPEGGIO_COMPOSER_D4_BUILD_ID);
        assert.equal(plan.cycleRole, role);
        if (plan.active) active.push(cyclePhrase);
      }
      assert.deepEqual(active, APU_D4_FEATURE_PHRASES, `${state}/${role}`);
      assert.ok(!active.includes(11));
      assert.ok(!active.includes(12));
    }
  }
});

test("every major run has sixteen notes with body and same-pitch edge layers", () => {
  const seenContours = new Set();
  for (const state of STATES) {
    for (let phraseIndex = 0; phraseIndex < 64; phraseIndex += 1) {
      const plan = d4ArpeggioPlanForPhrase(performancePlan(state, phraseIndex));
      if (!plan.active) continue;

      assert.equal(plan.noteCount, 16, `${state}/${phraseIndex}`);
      assert.equal(plan.layerCount, 2);
      assert.equal(plan.startStep, 0);
      assert.equal(plan.endStep, 15);
      assert.equal(plan.instructions.length, 32);
      assert.ok(["up", "down", "tornado"].includes(plan.contour));
      seenContours.add(plan.contour);

      const body = plan.instructions.filter((instruction) => instruction.arpLayer === "body");
      const edge = plan.instructions.filter((instruction) => instruction.arpLayer === "edge");
      assert.equal(body.length, 16);
      assert.equal(edge.length, 16);
      assert.deepEqual(body.map((instruction) => instruction.offsetSteps), Array.from({ length: 16 }, (_, index) => index));
      assert.deepEqual(edge.map((instruction) => instruction.offsetSteps), body.map((instruction) => instruction.offsetSteps));
      assert.deepEqual(edge.map((instruction) => instruction.midiOffset), body.map((instruction) => instruction.midiOffset));
      assert.deepEqual(edge.map((instruction) => instruction.noteIndex), body.map((instruction) => instruction.noteIndex));

      assert.ok(body.every((instruction) => (
        instruction.voice === "primary"
        && instruction.duration === "16n"
        && instruction.velocity >= 0.50
        && instruction.velocity <= 0.60
      )));
      assert.ok(edge.every((instruction) => (
        instruction.voice === "accent"
        && instruction.duration === "32n"
        && instruction.velocity >= 0.36
        && instruction.velocity <= 0.44
      )));
      assert.ok(plan.instructions.every((instruction) => (
        instruction.ornament === "d4-feature-arp"
        && instruction.additive === true
        && instruction.featureArpeggio === true
      )));

      const offsets = body.map((instruction) => instruction.midiOffset);
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
  assert.deepEqual([...seenContours].sort(), ["down", "tornado", "up"]);
});

test("state contour vocabularies are distinct and deterministic", () => {
  const signatures = new Set();
  for (const state of STATES) {
    const input = performancePlan(state, 6);
    const first = d4ArpeggioPlanForPhrase(input);
    const second = d4ArpeggioPlanForPhrase(input);
    assert.deepEqual(first, second);
    signatures.add(JSON.stringify(
      first.instructions
        .filter((instruction) => instruction.arpLayer === "body")
        .map((instruction) => instruction.midiOffset),
    ));
  }
  assert.equal(signatures.size, 4);
});

test("Explorer feature run preserves the exact later D3 shimmer", () => {
  const instructions = ornamentInstructionsForPhrase(performancePlan("healthy", 4));
  const d4 = instructions.filter((instruction) => instruction.ornament === "d4-feature-arp");
  const shimmer = instructions.filter((instruction) => (
    instruction.signatureGesture === "explorer-descending-shimmer"
  ));

  assert.equal(d4.length, 32);
  assert.equal(new Set(d4.map((instruction) => instruction.noteIndex)).size, 16);
  assert.ok(d4.every((instruction) => instruction.offsetSteps <= 15));
  assert.equal(shimmer.length, 3);
  assert.deepEqual(shimmer.map((instruction) => instruction.offsetSteps), [28, 29, 30]);
  assert.deepEqual(shimmer.map((instruction) => instruction.midiOffset), [24, 19, 12]);
  assert.deepEqual(shimmer.map((instruction) => instruction.velocity), [0.28, 0.24, 0.22]);
  assert.ok(shimmer.every((instruction) => instruction.duration === "32n"));
  assert.ok(!instructions.some((instruction) => instruction.ornament === "connective-arp"));
  assert.ok(!instructions.some((instruction) => instruction.ornament === "state-arp"));
  assert.ok(!instructions.some((instruction) => instruction.ornament === "shimmer"));
});

test("major runs replace only older arp ornaments, never score layers", () => {
  for (const state of STATES) {
    const input = performancePlan(state, 6);
    const instructions = ornamentInstructionsForPhrase(input);
    assert.equal(instructions.filter((instruction) => instruction.ornament === "d4-feature-arp").length, 32);
    assert.ok(!instructions.some((instruction) => instruction.ornament === "connective-arp"));
    assert.ok(!instructions.some((instruction) => instruction.ornament === "state-arp"));

    for (const category of ["primary", "secondary", "pad", "service", "bass", "rhythm", "accent"]) {
      for (let stepIndex = 0; stepIndex < 32; stepIndex += 1) {
        assert.equal(
          shouldOmitForPhase({ perfPlan: input, category, stepIndex, phraseIndex: 6 }),
          baselineShouldOmitForPhase({ perfPlan: input, category, stepIndex, phraseIndex: 6 }),
          `${state}/${category}/${stepIndex}`,
        );
      }
    }
  }
});

test("non-feature phrases retain D3 connective and state arps", () => {
  for (const state of STATES) {
    const instructions = ornamentInstructionsForPhrase(performancePlan(state, 2));
    assert.ok(instructions.some((instruction) => instruction.ornament === "connective-arp"));
    assert.ok(instructions.some((instruction) => instruction.ornament === "state-arp"));
    assert.ok(!instructions.some((instruction) => instruction.ornament === "d4-feature-arp"));
  }
});

test("Peak remains exactly D3 with no major D4 run", () => {
  for (const state of STATES) {
    for (const phraseIndex of [11, 12]) {
      const plan = d4ArpeggioPlanForPhrase(performancePlan(state, phraseIndex));
      assert.equal(plan.active, false);
      assert.deepEqual(plan.instructions, []);
      const instructions = ornamentInstructionsForPhrase(performancePlan(state, phraseIndex));
      assert.ok(!instructions.some((instruction) => instruction.ornament === "d4-feature-arp"));
    }
  }
});
