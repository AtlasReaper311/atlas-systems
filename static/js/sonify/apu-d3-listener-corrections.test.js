import assert from "node:assert/strict";
import test from "node:test";

import {
  mixDirectiveFor as baselineMixDirectiveFor,
} from "./apu-mix-director-d1a-baseline.js";
import {
  APU_D3_DYNAMICS_BUILD_ID,
  APU_MIX_BUSES,
  mixDirectiveFor,
} from "./apu-mix-director.js";
import {
  APU_D3_LISTENER_POLISH_BUILD_ID,
  ornamentInstructionsForPhrase,
  performanceCategories,
  velocityScaleForDensity,
} from "./apu-performance-conductor.js";
import { createHarmonicJourneyPlanner } from "./apu-harmonic-journey.js";

const STATES = Object.freeze(["healthy", "warning", "critical", "unknown"]);

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

test("Explorer Peak keeps the approved uncluttered ornament space", () => {
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
    assert.ok(!instructions.some((instruction) => instruction.gestureMoment));
    const melodic = instructions.filter((instruction) => (
      ["primary", "secondary"].includes(instruction.voice)
      && Number.isFinite(instruction.midiOffset)
    ));
    assert.ok(melodic.every((instruction) => instruction.midiOffset <= 12));
    assert.ok(melodic.every((instruction) => (
      instruction.listenerPolishBuildId === APU_D3_LISTENER_POLISH_BUILD_ID
    )));
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
