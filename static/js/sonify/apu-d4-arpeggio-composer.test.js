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

const STATES = Object.freeze(["healthy", "warning", "critical", "unknown"]);
const CYCLES = Object.freeze([
  Object.freeze({ number: 0, role: "statement", colourVoice: null }),
  Object.freeze({ number: 1, role: "development", colourVoice: "secondary" }),
  Object.freeze({ number: 2, role: "contrast", colourVoice: "accent" }),
  Object.freeze({ number: 3, role: "reprise", colourVoice: "secondary" }),
]);

function performancePlan(state, phraseIndex, overrides = {}) {
  return {
    silenceBudget: 0,
    density: 0.75,
    ornaments: [{ name: "shimmer", size: "medium", bar: phraseIndex * 2 }],
    phase: [11, 12].includes(phraseIndex % 16) ? "rupture" : "groove",
    state,
    phraseIndex,
    bars: phraseIndex * 2,
    ...overrides,
  };
}

test("every cycle schedules seven meaningful passages while Peak stays clear", () => {
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

test("Explorer keeps the exact primary Theme A to Variation hand-off in every cycle", () => {
  for (const { number, colourVoice } of CYCLES) {
    const phraseIndex = number * 16 + APU_D4_PROTECTED_EXPLORER_HANDOFF.cyclePhrase;
    const input = performancePlan("healthy", phraseIndex);
    const plan = arpeggioPlanForPhrase(input);
    assert.equal(plan.active, true);
    assert.equal(plan.protectedEvent, true);
    assert.equal(plan.role, "answer");

    const core = plan.instructions.filter((instruction) => instruction.protectedEvent);
    assert.equal(core.length, 3);
    assert.deepEqual(core.map((instruction) => instruction.offsetSteps), APU_D4_PROTECTED_EXPLORER_HANDOFF.steps);
    assert.deepEqual(core.map((instruction) => instruction.midiOffset), APU_D4_PROTECTED_EXPLORER_HANDOFF.offsets);
    assert.deepEqual(core.map((instruction) => instruction.velocity), APU_D4_PROTECTED_EXPLORER_HANDOFF.velocities);
    assert.ok(core.every((instruction) => instruction.duration === APU_D4_PROTECTED_EXPLORER_HANDOFF.duration));
    assert.ok(core.every((instruction) => instruction.voice === "primary"));

    const colour = plan.instructions.filter((instruction) => instruction.protectedColourLayer);
    assert.equal(colour.length, colourVoice ? 3 : 0);
    if (colourVoice) {
      assert.ok(colour.every((instruction) => instruction.voice === colourVoice));
      assert.deepEqual(colour.map((instruction) => instruction.offsetSteps), APU_D4_PROTECTED_EXPLORER_HANDOFF.steps);
      assert.deepEqual(colour.map((instruction) => instruction.midiOffset), APU_D4_PROTECTED_EXPLORER_HANDOFF.offsets);
      assert.ok(colour.every((instruction, index) => instruction.velocity < core[index].velocity));
    }

    const audible = ornamentInstructionsForPhrase(input);
    const audibleCore = audible.filter((instruction) => instruction.protectedEvent);
    assert.equal(audibleCore.length, 3);
    assert.ok(audibleCore.every((instruction) => instruction.voice === "primary"));
    assert.ok(audibleCore.every((instruction) => instruction.audibleTimbreVoice === "primary"));
    const audibleColour = audible.filter((instruction) => instruction.protectedColourLayer);
    assert.equal(audibleColour.length, colourVoice ? 3 : 0);
    if (colourVoice) assert.ok(audibleColour.every((instruction) => instruction.audibleTimbreVoice === colourVoice));
  }
});

test("performance scheduling replaces legacy arps without duplicating shimmer", () => {
  const phraseIndex = 4;
  const instructions = ornamentInstructionsForPhrase(performancePlan("healthy", phraseIndex));
  const protectedArp = instructions.filter((instruction) => instruction.protectedEvent);
  assert.equal(protectedArp.length, 3);
  assert.deepEqual(protectedArp.map((instruction) => instruction.midiOffset), [24, 19, 12]);
  assert.ok(!instructions.some((instruction) => instruction.ornament === "connective-arp"));
  assert.ok(!instructions.some((instruction) => instruction.ornament === "state-arp"));
  assert.ok(!instructions.some((instruction) => instruction.ornament === "shimmer"));
});

test("foreground arps become the bounded melodic foreground through orchestration space", () => {
  const expectedVoices = Object.freeze({
    healthy: "secondary",
    warning: "accent",
    critical: "accent",
    unknown: "secondary",
  });
  for (const state of STATES) {
    const planInput = performancePlan(state, 10);
    const plan = arpeggioPlanForPhrase(planInput);
    assert.equal(plan.active, true);
    assert.equal(plan.role, "foreground");
    assert.ok(plan.window);
    assert.ok(plan.instructions.every((instruction) => instruction.voice === expectedVoices[state]));

    for (const category of ["primary", "secondary", "pad", "service"]) {
      assert.equal(shouldCreateArpeggioSpace({
        perfPlan: planInput,
        category,
        stepIndex: plan.window.startStep,
      }), true, `${state}/${category}`);
      assert.equal(shouldOmitForPhase({
        perfPlan: planInput,
        category,
        stepIndex: plan.window.startStep,
        phraseIndex: 10,
      }), true, `${state}/${category}/performance`);
    }
    for (const category of ["bass", "rhythm", "accent"]) {
      assert.equal(shouldCreateArpeggioSpace({
        perfPlan: planInput,
        category,
        stepIndex: plan.window.startStep,
      }), false, `${state}/${category}`);
    }
  }
});

test("statement cycles contain at least three foreground spotlights", () => {
  for (const state of STATES) {
    let foreground = 0;
    for (let phraseIndex = 0; phraseIndex < 16; phraseIndex += 1) {
      if (arpeggioPlanForPhrase(performancePlan(state, phraseIndex)).role === "foreground") foreground += 1;
    }
    assert.ok(foreground >= 3, `${state}/${foreground}`);
  }
});

test("answer arps sit behind the lead and do not thin the arrangement", () => {
  for (const state of STATES) {
    const input = performancePlan(state, 1);
    const plan = arpeggioPlanForPhrase(input);
    assert.equal(plan.active, true);
    assert.equal(plan.role, "answer");
    assert.deepEqual(plan.spaceCategories, []);
    assert.ok(plan.instructions.every((instruction) => instruction.voice === "secondary"));
  }
});

test("later cycles develop, contrast and reprise deterministically", () => {
  for (const state of STATES) {
    const statement = arpeggioPlanForPhrase(performancePlan(state, 6));
    const development = arpeggioPlanForPhrase(performancePlan(state, 16 + 6));
    const contrast = arpeggioPlanForPhrase(performancePlan(state, 32 + 7));
    const reprise = arpeggioPlanForPhrase(performancePlan(state, 48 + 6));
    assert.equal(Object.isFrozen(statement), true);
    assert.equal(Object.isFrozen(statement.instructions), true);
    assert.notDeepEqual(
      development.instructions.map((instruction) => instruction.midiOffset),
      statement.instructions.map((instruction) => instruction.midiOffset),
    );
    assert.notEqual(contrast.timbreRole, development.timbreRole);
    assert.ok(reprise.instructions.length >= statement.instructions.length);
    assert.deepEqual(arpeggioPlanForPhrase(performancePlan(state, 16 + 6)), development);
  }
});

test("darker states stay below Explorer's protected high arc", () => {
  const ceilings = Object.freeze({ warning: 13, critical: 19, unknown: 12 });
  for (const [state, ceiling] of Object.entries(ceilings)) {
    for (let phraseIndex = 0; phraseIndex < 64; phraseIndex += 1) {
      const plan = arpeggioPlanForPhrase(performancePlan(state, phraseIndex));
      for (const instruction of plan.instructions) {
        assert.ok(instruction.midiOffset <= ceiling, `${state}/${phraseIndex}/${instruction.midiOffset}`);
      }
    }
  }
});
