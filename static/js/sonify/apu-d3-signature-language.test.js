import assert from "node:assert/strict";
import test from "node:test";

import {
  arrangementForPhrase,
  resetMelodyPreservingD2Planner,
} from "./apu-arranger.js";
import {
  ornamentInstructionsForPhrase,
  performanceCategories,
  shouldOmitForPhase,
} from "./apu-performance-conductor.js";
import {
  APU_D3_PRE_PEAK_CUTOUT_STARTS,
  APU_D3_SIGNATURE_GESTURE_BUILD_ID,
  APU_D3_SIGNATURE_PHRASES,
  peakRegisterShiftForState,
  signatureGestureInstructionsForPhrase,
} from "./apu-signature-gestures-d3.js";
import {
  primaryPulseEventForTrackStep as baselinePrimaryPulseEventForTrackStep,
  secondaryPulseEventForTrackStep as baselineSecondaryPulseEventForTrackStep,
} from "./apu-track-sequencer-d2-baseline.js";
import {
  primaryPulseEventForTrackStep,
  secondaryPulseEventForTrackStep,
} from "./apu-track-sequencer.js";

const STATES = Object.freeze(["healthy", "warning", "critical", "unknown"]);
const PRESERVED_STATES = Object.freeze(["healthy", "warning", "critical"]);
const EXPECTED_PEAK_COUNTS = Object.freeze({
  healthy: 16,
  warning: 16,
  critical: 8,
});
const MAX_SIGNATURE_OFFSETS = Object.freeze({
  healthy: 24,
  warning: 15,
  critical: 19,
  unknown: 12,
});
const directorPlan = Object.freeze({
  phase: "develop",
  energy: 0.48,
  intent: Object.freeze({ pressure: 0.4, confidence: 0.9, intensity: 0.5 }),
});

function performancePlan(state, phraseIndex, overrides = {}) {
  return {
    silenceBudget: 0.2,
    density: 0.7,
    ornaments: [{ name: "shimmer", size: "medium", bar: phraseIndex * 2 }],
    phase: phraseIndex >= 11 && phraseIndex <= 12 ? "rupture" : "groove",
    state,
    phraseIndex,
    bars: phraseIndex * 2,
    ...overrides,
  };
}

test("each state receives exactly three structural signature moments per cycle", () => {
  const signatures = new Set();
  for (const state of STATES) {
    const activePhrases = [];
    const stateLabels = [];
    for (let phraseIndex = 0; phraseIndex < 16; phraseIndex += 1) {
      const instructions = signatureGestureInstructionsForPhrase(performancePlan(state, phraseIndex));
      if (!instructions.length) continue;
      activePhrases.push(phraseIndex);
      stateLabels.push(instructions[0].signatureGesture);
      assert.ok(instructions.every((instruction) => instruction.state === state));
      assert.ok(instructions.every((instruction) => (
        instruction.signatureGestureBuildId === APU_D3_SIGNATURE_GESTURE_BUILD_ID
      )));
    }
    assert.deepEqual(activePhrases, [
      APU_D3_SIGNATURE_PHRASES.variationHandoff,
      APU_D3_SIGNATURE_PHRASES.prePeakLift,
      APU_D3_SIGNATURE_PHRASES.recoveryEcho,
    ]);
    assert.equal(new Set(stateLabels).size, 3);
    stateLabels.forEach((label) => signatures.add(label));
  }
  assert.equal(signatures.size, 12);
});

test("gesture directions follow descent, restrained ascent, descent", () => {
  for (const state of STATES) {
    const handoff = signatureGestureInstructionsForPhrase(performancePlan(state, 4));
    const launch = signatureGestureInstructionsForPhrase(performancePlan(state, 10));
    const recovery = signatureGestureInstructionsForPhrase(performancePlan(state, 14));
    assert.ok(handoff.every((instruction) => instruction.direction === "descending"));
    assert.ok(launch.every((instruction) => instruction.direction === "ascending"));
    assert.ok(recovery.every((instruction) => instruction.direction === "descending"));
    assert.ok(Math.max(...handoff.map((instruction) => instruction.midiOffset)) <= MAX_SIGNATURE_OFFSETS[state]);
    assert.ok(Math.max(...launch.map((instruction) => instruction.midiOffset)) <= MAX_SIGNATURE_OFFSETS[state]);
    assert.ok(Math.max(...recovery.map((instruction) => instruction.midiOffset)) <= MAX_SIGNATURE_OFFSETS[state]);
  }
});

test("Explorer keeps the exact approved PR128 descending shimmer", () => {
  const instructions = ornamentInstructionsForPhrase(performancePlan("healthy", 4));
  const shimmer = instructions.filter((instruction) => (
    instruction.signatureGesture === "explorer-descending-shimmer"
  ));
  assert.equal(shimmer.length, 3);
  assert.deepEqual(shimmer.map((instruction) => instruction.offsetSteps), [28, 29, 30]);
  assert.deepEqual(shimmer.map((instruction) => instruction.midiOffset), [24, 19, 12]);
  assert.deepEqual(shimmer.map((instruction) => instruction.velocity), [0.28, 0.24, 0.22]);
  assert.ok(shimmer.every((instruction) => instruction.duration === "32n"));
  assert.ok(shimmer.every((instruction) => instruction.register === "bright-high-transition"));
  assert.ok(!instructions.some((instruction) => instruction.ornament === "shimmer"));
});

test("Explorer pre-Peak drop removes bass only and keeps melody and drums alive", () => {
  const state = "healthy";
  const start = APU_D3_PRE_PEAK_CUTOUT_STARTS[state];
  const plan = performancePlan(state, 10, { silenceBudget: 0, density: 1 });

  for (const category of performanceCategories()) {
    assert.equal(shouldOmitForPhase({
      perfPlan: plan,
      category,
      stepIndex: start - 1,
      phraseIndex: 10,
    }), false, `${state}/${category}/before`);
    assert.equal(shouldOmitForPhase({
      perfPlan: plan,
      category,
      stepIndex: start,
      phraseIndex: 10,
    }), category === "bass", `${state}/${category}/start`);
    assert.equal(shouldOmitForPhase({
      perfPlan: plan,
      category,
      stepIndex: 31,
      phraseIndex: 10,
    }), category === "bass", `${state}/${category}/end`);
  }

  const instructions = ornamentInstructionsForPhrase(plan);
  assert.ok(instructions.some((instruction) => instruction.gestureMoment === "prePeakLift"));
  assert.ok(instructions.some((instruction) => (
    Number.isFinite(instruction.offsetSteps) && instruction.offsetSteps >= start
  )));
});

test("darker-state pre-Peak cutouts remain complete and state-specific", () => {
  for (const state of ["warning", "critical", "unknown"]) {
    const start = APU_D3_PRE_PEAK_CUTOUT_STARTS[state];
    const plan = performancePlan(state, 10, { silenceBudget: 0, density: 1 });
    for (const category of performanceCategories()) {
      assert.equal(shouldOmitForPhase({
        perfPlan: plan,
        category,
        stepIndex: start - 1,
        phraseIndex: 10,
      }), false, `${state}/${category}/before`);
      assert.equal(shouldOmitForPhase({
        perfPlan: plan,
        category,
        stepIndex: start,
        phraseIndex: 10,
      }), true, `${state}/${category}/start`);
      assert.equal(shouldOmitForPhase({
        perfPlan: plan,
        category,
        stepIndex: 31,
        phraseIndex: 10,
      }), true, `${state}/${category}/end`);
    }
    const instructions = ornamentInstructionsForPhrase(plan);
    assert.ok(instructions.some((instruction) => instruction.gestureMoment === "prePeakLift"));
    assert.ok(instructions.every((instruction) => (
      !Number.isFinite(instruction.offsetSteps) || instruction.offsetSteps < start
    )));
  }
});

test("the approved three-state Peak keeps its full authored primary line", () => {
  for (const state of PRESERVED_STATES) {
    const frame = { scoreState: state, tension: state === "critical" ? 0.9 : 0.35 };
    resetMelodyPreservingD2Planner();
    for (const phraseIndex of [11, 12]) {
      const arrangement = arrangementForPhrase(frame, directorPlan, phraseIndex);
      assert.equal(arrangement.section, "peak");
      const shift = peakRegisterShiftForState(state);
      let audibleCount = 0;
      for (let step = 0; step < 32; step += 1) {
        const before = baselinePrimaryPulseEventForTrackStep(frame, arrangement, step);
        const after = primaryPulseEventForTrackStep(frame, arrangement, step);
        assert.equal(Boolean(after), Boolean(before), `${state}/phrase-${phraseIndex}/step-${step}`);
        if (!before || !after) continue;
        audibleCount += 1;
        assert.equal(after.midi, before.midi + shift);
        assert.equal(after.duration, before.duration);
        assert.equal(after.velocity, before.velocity);
        if (shift === 0) {
          assert.deepEqual(after, before);
        } else {
          assert.equal(after.registerAdjustmentSemitones, shift);
        }
        assert.equal(shouldOmitForPhase({
          perfPlan: performancePlan(state, phraseIndex, {
            phase: "rupture",
            density: 1,
            silenceBudget: 0.5,
          }),
          category: "primary",
          stepIndex: step,
          phraseIndex,
        }), false);
      }
      assert.equal(audibleCount, EXPECTED_PEAK_COUNTS[state]);
    }
  }
});

test("Lost Signal Peak keeps the complete question motif", () => {
  const state = "unknown";
  const frame = { scoreState: state, tension: 0.35 };
  resetMelodyPreservingD2Planner();
  for (const phraseIndex of [11, 12]) {
    const arrangement = arrangementForPhrase(frame, directorPlan, phraseIndex);
    assert.equal(arrangement.section, "peak");
    assert.deepEqual(arrangement.motifDegrees, [0, 2, 0, 4, 2]);
    const events = Array.from({ length: 32 }, (_, step) => (
      primaryPulseEventForTrackStep(frame, arrangement, step)
    )).filter(Boolean);
    assert.equal(events.length, 5);
    assert.ok(events.every((event) => event.questionTheme === true));
    assert.ok(events.every((event) => event.registerAdjustmentSemitones === peakRegisterShiftForState(state)));
  }
});

test("approved three-state Peak counterlines keep their rhythms and warm register policy", () => {
  for (const state of PRESERVED_STATES) {
    const frame = { scoreState: state, tension: state === "critical" ? 0.9 : 0.35 };
    resetMelodyPreservingD2Planner();
    const arrangement = arrangementForPhrase(frame, directorPlan, 11);
    const shift = peakRegisterShiftForState(state);
    for (let step = 0; step < 32; step += 1) {
      const before = baselineSecondaryPulseEventForTrackStep(frame, arrangement, step);
      const after = secondaryPulseEventForTrackStep(frame, arrangement, step);
      assert.equal(Boolean(after), Boolean(before));
      if (!before || !after) continue;
      assert.equal(after.midi, before.midi + shift);
      assert.equal(after.duration, before.duration);
      assert.equal(after.velocity, before.velocity);
    }
  }
});

test("Lost Signal Peak counterline is a bounded ghost echo", () => {
  const frame = { scoreState: "unknown", tension: 0.35 };
  resetMelodyPreservingD2Planner();
  const arrangement = arrangementForPhrase(frame, directorPlan, 11);
  const events = Array.from({ length: 32 }, (_, step) => (
    secondaryPulseEventForTrackStep(frame, arrangement, step)
  )).filter(Boolean);
  assert.ok(events.length >= 3 && events.length <= 4);
  assert.ok(events.every((event) => event.ghostEcho === true));
  assert.ok(events.every((event) => event.velocity <= 0.28));
});
