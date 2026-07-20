import assert from "node:assert/strict";
import test from "node:test";

import {
  MUSICAL_PHASES,
  createCompositionDirector,
  deriveMusicalIntent,
  motifEventForStep,
  phaseMixFor,
} from "./composition-director.js";
import { SCORE_STATES } from "./mapping.js";

function frame(scoreState, pressure, overrides = {}) {
  const state = SCORE_STATES[scoreState];
  return {
    scoreState,
    tension: state.tension,
    bpm: state.bpm,
    scale: [...state.scale],
    overallHealth: scoreState === "critical" ? 0.35 : scoreState === "warning" ? 0.82 : 1,
    activeIncidents: scoreState === "critical" ? 1 : 0,
    stale: scoreState === "unknown",
    modulation: {
      pressure,
      healthPressure: pressure,
      coveragePressure: scoreState === "unknown" ? 0.7 : 0,
      latencyPressure: pressure * 0.6,
      uptimePressure: pressure * 0.3,
      errorPressure: pressure * 0.5,
      incidentPressure: scoreState === "critical" ? 0.5 : 0,
      deploymentEnergy: 0,
      componentLoad: 0.6,
      spectralOpenness: 1 - pressure * 0.5,
      staleDecay: scoreState === "unknown" ? 0.8 : 0,
      ...overrides.modulation,
    },
    ...overrides,
  };
}

function assertUnitInterval(value, label) {
  assert.ok(Number.isFinite(value), `${label} must be finite`);
  assert.ok(value >= 0 && value <= 1, `${label} must stay in [0, 1]`);
}

test("musical intention exposes only bounded finite composition controls", () => {
  for (const state of Object.keys(SCORE_STATES)) {
    for (const pressure of [0, 0.2, 0.5, 0.8, 1]) {
      const intent = deriveMusicalIntent(frame(state, pressure));
      for (const [name, value] of Object.entries(intent)) {
        if (name === "state") continue;
        assertUnitInterval(value, `${state}.${name}`);
      }
    }
  }
});

test("phase mixes remain bounded and never create gain multipliers above unity", () => {
  for (const phase of MUSICAL_PHASES) {
    for (const state of Object.keys(SCORE_STATES)) {
      const mix = phaseMixFor(phase, state, deriveMusicalIntent(frame(state, 1)));
      for (const [name, value] of Object.entries(mix)) {
        assertUnitInterval(value, `${phase}.${state}.${name}`);
      }
    }
  }
});

test("the live director is deterministic for the same normalized telemetry history", () => {
  const left = createCompositionDirector({ seed: "ATLAS-TEST" });
  const right = createCompositionDirector({ seed: "ATLAS-TEST" });
  const history = [
    frame("healthy", 0.05),
    frame("healthy", 0.08),
    frame("warning", 0.5),
    frame("warning", 0.68),
    frame("critical", 0.95),
    frame("critical", 0.9),
    frame("healthy", 0.12),
    frame("healthy", 0.04),
  ];

  const leftPlans = history.map((item) => {
    left.observe(item);
    return left.advancePhrase();
  });
  const rightPlans = history.map((item) => {
    right.observe(item);
    return right.advancePhrase();
  });

  assert.deepEqual(leftPlans, rightPlans);
});

test("motif memory avoids immediate two-phrase repetition while preserving one Atlas family", () => {
  const director = createCompositionDirector({ seed: "ATLAS-MEMORY" });
  director.observe(frame("healthy", 0.08));
  const plans = Array.from({ length: 12 }, () => director.advancePhrase());
  for (let index = 2; index < plans.length; index += 1) {
    assert.notEqual(
      plans[index].motifVariant,
      plans[index - 1].motifVariant,
      "motif variation should not immediately repeat",
    );
    assert.notEqual(
      plans[index].motifVariant,
      plans[index - 2].motifVariant,
      "motif variation should remember the previous two phrases",
    );
  }
  assert.ok(plans.every((plan) => plan.motifDegrees.length >= 4));
  assert.ok(plans.every((plan) => plan.motifPattern.length >= 4));
});

test("warning develops pressure before critical reaches a bounded peak", () => {
  const director = createCompositionDirector({ seed: "ATLAS-PRESSURE" });
  director.observe(frame("healthy", 0.05));
  director.advancePhrase();
  director.advancePhrase();

  director.observe(frame("warning", 0.62));
  const warningPlans = Array.from({ length: 3 }, () => director.advancePhrase());
  assert.ok(
    warningPlans.some((plan) => ["intensify", "destabilise"].includes(plan.phase)),
    "warning should move the score into a pressure-building phase",
  );

  director.observe(frame("critical", 0.98));
  const criticalPlans = Array.from({ length: 5 }, () => director.advancePhrase());
  assert.ok(
    criticalPlans.some((plan) => ["destabilise", "peak"].includes(plan.phase)),
    "critical should reach deliberate high-pressure phases",
  );
  const longestPeakRun = criticalPlans.reduce(
    ({ run, max }, plan) => plan.phase === "peak"
      ? { run: run + 1, max: Math.max(max, run + 1) }
      : { run: 0, max },
    { run: 0, max: 0 },
  ).max;
  assert.ok(longestPeakRun <= 2, "critical peak must not become a permanent wall of sound");
});

test("recovery reassembles the stable motif before the phase machine fully settles", () => {
  const director = createCompositionDirector({ seed: "ATLAS-RECOVERY" });
  director.observe(frame("critical", 0.95));
  director.advancePhrase();
  director.advancePhrase();
  director.observe(frame("healthy", 0.04));

  const firstRecoveryBoundary = director.advancePhrase();
  assert.ok(firstRecoveryBoundary.intent.recoveryEnergy >= 0.2);
  assert.equal(firstRecoveryBoundary.motifVariant, 0);

  const settlingPlans = [
    firstRecoveryBoundary,
    director.advancePhrase(),
    director.advancePhrase(),
    director.advancePhrase(),
  ];
  assert.ok(
    settlingPlans.some((plan) => ["release", "recover"].includes(plan.phase)),
    "recovery should pass through a controlled release or recover phase rather than hard-reset",
  );
});

test("unknown remains sparse and distinct from confirmed critical pressure", () => {
  const unknownDirector = createCompositionDirector({ seed: "ATLAS-UNKNOWN" });
  unknownDirector.observe(frame("unknown", 0.4));
  const unknownPlans = [
    unknownDirector.advancePhrase(),
    unknownDirector.advancePhrase(),
  ];
  const unknown = unknownPlans.at(-1);
  const criticalDirector = createCompositionDirector({ seed: "ATLAS-UNKNOWN" });
  criticalDirector.observe(frame("critical", 0.9));
  const critical = criticalDirector.advancePhrase();

  assert.ok(
    unknownPlans.some((plan) => ["release", "breathe"].includes(plan.phase)),
    "Unknown should settle into a sparse uncertainty phase at a phrase boundary",
  );
  assert.ok(unknown.motifPattern.length <= 2);
  assert.ok(unknown.phaseMix.drums < critical.phaseMix.drums);
  assert.ok(unknown.intent.urgency < critical.intent.urgency);
});

test("motif events are finite, bounded and state-transformable", () => {
  for (const state of Object.keys(SCORE_STATES)) {
    const director = createCompositionDirector({ seed: `ATLAS-${state}` });
    director.observe(frame(state, state === "critical" ? 0.95 : 0.4));
    const plan = director.advancePhrase();
    const events = Array.from({ length: 32 }, (_, step) => (
      motifEventForStep(plan, SCORE_STATES[state].scale, step)
    )).filter(Boolean);
    assert.equal(events.length, plan.motifPattern.length);
    for (const event of events) {
      assert.ok(Number.isFinite(event.midi));
      assert.ok(event.midi >= 50 && event.midi <= 74);
      assert.ok(Number.isFinite(event.velocity));
      assert.ok(event.velocity <= 0.5);
      assert.equal(typeof event.duration, "string");
    }
  }
});

test("live performance fields stay within conservative mix and tempo ceilings", () => {
  for (const state of Object.keys(SCORE_STATES)) {
    const director = createCompositionDirector({ seed: `ATLAS-LIMIT-${state}` });
    director.observe(frame(state, 1, { modulation: { deploymentEnergy: 1 } }));
    const plan = director.advancePhrase();
    assert.ok(plan.targetBpm >= 92 && plan.targetBpm <= 132);
    assert.ok(plan.drumMultiplier <= 1.18);
    assert.ok(plan.bassMultiplier <= 1.12);
    assert.ok(plan.distortionWet <= 0.2);
    assert.ok(plan.delayWet <= 0.2);
    assert.ok(plan.reverbWet <= 0.32);
    assert.ok(plan.terminalGain <= 0.52);
    assert.ok(plan.riffGain <= 0.4);
  }
});
