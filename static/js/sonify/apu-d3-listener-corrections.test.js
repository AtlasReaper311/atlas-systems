import assert from "node:assert/strict";
import test from "node:test";

import {
  arrangementForPhrase,
  resetMelodyPreservingD2Planner,
} from "./apu-arranger.js";
import {
  mixDirectiveFor as baselineMixDirectiveFor,
} from "./apu-mix-director-d1a-baseline.js";
import {
  APU_D3_DYNAMICS_BUILD_ID,
  APU_MIX_BUSES,
  mixDirectiveFor,
} from "./apu-mix-director.js";
import {
  ornamentInstructionsForPhrase as baselineOrnamentInstructionsForPhrase,
} from "./apu-performance-conductor-d1a-baseline.js";
import {
  APU_D3_LISTENER_POLISH_BUILD_ID,
  ornamentInstructionsForPhrase,
  performanceCategories,
  shouldOmitForPhase,
  velocityScaleForDensity,
} from "./apu-performance-conductor.js";
import {
  primaryPulseEventForTrackStep as baselinePrimaryPulseEventForTrackStep,
  secondaryPulseEventForTrackStep as baselineSecondaryPulseEventForTrackStep,
} from "./apu-track-sequencer-d2-baseline.js";
import {
  primaryPulseEventForTrackStep,
  secondaryPulseEventForTrackStep,
} from "./apu-track-sequencer.js";
import { createHarmonicJourneyPlanner } from "./apu-harmonic-journey.js";

const STATES = Object.freeze(["healthy", "warning", "critical", "unknown"]);
const directorPlan = Object.freeze({
  phase: "develop",
  energy: 0.48,
  intent: Object.freeze({ pressure: 0.4, confidence: 0.9, intensity: 0.5 }),
});

function performancePlan(overrides = {}) {
  return {
    silenceBudget: 0.2,
    density: 0.7,
    ornaments: [],
    phase: "groove",
    state: "healthy",
    phraseIndex: 0,
    bars: 0,
    ...overrides,
  };
}

function songPlan(signature = "listener-correction") {
  return {
    cycleRole: "statement",
    cadenceIntent: "open",
    evidenceAuthority: { resolutionPermitted: false },
    deterministicSignature: signature,
  };
}

test("all four states use a narrow opening-to-peak bus envelope", () => {
  assert.match(APU_D3_DYNAMICS_BUILD_ID, /dynamics-v1$/);
  for (const state of STATES) {
    const intro = mixDirectiveFor({ state, phase: "intro" });
    const rupture = mixDirectiveFor({ state, phase: "rupture" });
    for (const busName of APU_MIX_BUSES) {
      const low = Math.min(intro.buses[busName].gainMul, rupture.buses[busName].gainMul);
      const high = Math.max(intro.buses[busName].gainMul, rupture.buses[busName].gainMul);
      assert.ok(high / low <= 1.15, `${state}/${busName} ratio ${high / low}`);
    }
    assert.ok(intro.dynamicsEnvelope);
    assert.ok(rupture.dynamicsEnvelope);
  }
});

test("density velocity changes remain audible without becoming a volume trap", () => {
  for (const category of performanceCategories()) {
    const opening = velocityScaleForDensity(performancePlan({ density: 0.4 }), category);
    const peak = velocityScaleForDensity(performancePlan({ density: 1 }), category);
    assert.ok(opening >= 0.75, `${category} opening floor ${opening}`);
    assert.ok(peak <= 0.96, `${category} peak ceiling ${peak}`);
    assert.ok(peak / opening <= 1.16, `${category} ratio ${peak / opening}`);
  }
});

test("dynamic smoothing keeps state colour and only narrows phase gain", () => {
  for (const state of STATES) {
    const baseline = baselineMixDirectiveFor({ state, phase: "pressure" });
    const candidate = mixDirectiveFor({ state, phase: "pressure" });
    for (const busName of APU_MIX_BUSES) {
      assert.equal(candidate.buses[busName].highcutHz, baseline.buses[busName].highcutHz);
      assert.equal(candidate.buses[busName].width, baseline.buses[busName].width);
    }
    assert.deepEqual(candidate.ducking, baseline.ducking);
    assert.deepEqual(candidate.chipWobble, baseline.chipWobble);
    assert.deepEqual(candidate.transientSoftener, baseline.transientSoftener);
  }
});

test("Explorer Theme A restores the exact PR128 descending shimmer", () => {
  const instructions = ornamentInstructionsForPhrase(performancePlan({
    state: "healthy",
    phraseIndex: 4,
    bars: 8,
    ornaments: [{ name: "shimmer", size: "medium", bar: 8 }],
  }));
  const shimmer = instructions.filter((instruction) => instruction.ornament === "shimmer");
  assert.equal(shimmer.length, 3);
  assert.deepEqual(shimmer.map((instruction) => instruction.voice), ["primary", "primary", "primary"]);
  assert.deepEqual(shimmer.map((instruction) => instruction.offsetSteps), [28, 29, 30]);
  assert.deepEqual(shimmer.map((instruction) => instruction.midiOffset), [24, 19, 12]);
  assert.deepEqual(shimmer.map((instruction) => instruction.velocity), [0.28, 0.24, 0.22]);
  assert.ok(shimmer.every((instruction) => instruction.duration === "32n"));
  assert.ok(shimmer.every((instruction) => instruction.register === "bright-high-transition"));
  assert.ok(shimmer.every((instruction) => instruction.listenerPolishBuildId === APU_D3_LISTENER_POLISH_BUILD_ID));
  assert.ok(!instructions.some((instruction) => instruction.arpFunction === "theme-a-to-variation-handoff"));
});

test("Explorer Peak restores the Pass C contour by removing the later state overlay", () => {
  for (const phraseIndex of [11, 12]) {
    const instructions = ornamentInstructionsForPhrase(performancePlan({
      state: "healthy",
      phase: "rupture",
      density: 1,
      phraseIndex,
      bars: phraseIndex * 2,
    }));
    assert.ok(instructions.some((instruction) => instruction.ornament === "connective-arp"));
    assert.ok(!instructions.some((instruction) => instruction.ornament === "state-arp"));
    assert.ok(!instructions.some((instruction) => instruction.ornament === "explorer-sparkle-answer"));
    const melodic = instructions.filter((instruction) => (
      ["primary", "secondary"].includes(instruction.voice)
      && Number.isFinite(instruction.midiOffset)
    ));
    assert.ok(melodic.every((instruction) => instruction.register === "peak-mid"));
  }
});

test("Explorer Peak keeps every scheduled lead note and lowers it one octave", () => {
  const frame = { scoreState: "healthy", tension: 0.35 };
  resetMelodyPreservingD2Planner();
  for (const phraseIndex of [11, 12]) {
    const arrangement = arrangementForPhrase(frame, directorPlan, phraseIndex);
    assert.equal(arrangement.section, "peak");
    const audiblePrimary = [];
    for (let step = 0; step < 32; step += 1) {
      const before = baselinePrimaryPulseEventForTrackStep(frame, arrangement, step);
      const after = primaryPulseEventForTrackStep(frame, arrangement, step);
      if (!before) {
        assert.equal(after, null);
        continue;
      }
      audiblePrimary.push(after);
      assert.equal(after.midi, before.midi - 12);
      assert.equal(after.duration, before.duration);
      assert.equal(after.velocity, before.velocity);
      assert.equal(after.registerAdjustmentSemitones, -12);
      assert.equal(shouldOmitForPhase({
        perfPlan: performancePlan({
          state: "healthy",
          phase: "rupture",
          density: 1,
          silenceBudget: 0.1,
          phraseIndex,
        }),
        category: "primary",
        stepIndex: step,
        phraseIndex,
      }), false);
    }
    assert.equal(audiblePrimary.length, 16);
  }
});

test("Explorer Peak lowers existing counter-lead notes without changing their rhythm", () => {
  const frame = { scoreState: "healthy", tension: 0.35 };
  resetMelodyPreservingD2Planner();
  const arrangement = arrangementForPhrase(frame, directorPlan, 11);
  for (let step = 0; step < 32; step += 1) {
    const before = baselineSecondaryPulseEventForTrackStep(frame, arrangement, step);
    const after = secondaryPulseEventForTrackStep(frame, arrangement, step);
    assert.equal(Boolean(after), Boolean(before));
    if (!before || !after) continue;
    assert.equal(after.midi, before.midi - 12);
    assert.equal(after.duration, before.duration);
    assert.equal(after.velocity, before.velocity);
  }
});

test("Explorer melodic ornaments stay bounded outside the authored high shimmer", () => {
  for (let phraseIndex = 0; phraseIndex < 16; phraseIndex += 1) {
    const instructions = ornamentInstructionsForPhrase(performancePlan({
      state: "healthy",
      phraseIndex,
      bars: phraseIndex * 2,
      ornaments: phraseIndex === 4
        ? [{ name: "shimmer", size: "medium", bar: 8 }]
        : [],
    }));
    const melodic = instructions.filter((instruction) => (
      ["primary", "secondary"].includes(instruction.voice)
      && Number.isFinite(instruction.midiOffset)
      && instruction.ornament !== "shimmer"
    ));
    assert.ok(melodic.every((instruction) => instruction.midiOffset <= 12));
  }
});

test("non-Explorer ornament programmes remain identical to D1A", () => {
  for (const state of ["warning", "critical", "unknown"]) {
    for (const phraseIndex of [0, 4, 11, 12]) {
      const plan = performancePlan({
        state,
        phase: phraseIndex >= 11 ? "rupture" : "groove",
        phraseIndex,
        bars: phraseIndex * 2,
      });
      assert.deepEqual(
        ornamentInstructionsForPhrase(plan),
        baselineOrnamentInstructionsForPhrase(plan),
        `${state}/phrase-${phraseIndex}`,
      );
    }
  }
});

test("Explorer support voicings share melody harmony and remain warm-mid", () => {
  const harmony = Object.freeze([
    Object.freeze({ rootDegree: 3, quality: "wide", inversion: 0 }),
    Object.freeze({ rootDegree: 5, quality: "wide", inversion: 1 }),
  ]);
  const planner = createHarmonicJourneyPlanner();
  const journey = planner.advancePhrase({
    frame: { scoreState: "healthy" },
    arrangement: {
      phraseIndex: 5,
      cycleNumber: 0,
      scoreState: "healthy",
      section: "variation",
      harmony,
      songPlan: songPlan(),
    },
  });
  assert.equal(journey.supportPolicy, "primary-compatible");
  assert.deepEqual(
    journey.supportHarmony.map(({ rootDegree, quality, inversion }) => ({ rootDegree, quality, inversion })),
    harmony,
  );
  assert.ok(journey.supportVoicings.flatMap((voicing) => voicing.midi).every((midi) => midi <= 67));
});
