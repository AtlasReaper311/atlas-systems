import assert from "node:assert/strict";
import test from "node:test";
import { createHarmonicJourneyPlanner } from "./apu-harmonic-journey.js";

function arrangement(overrides = {}) {
  return {
    phraseIndex: 0,
    cycleNumber: 0,
    scoreState: "healthy",
    section: "establish",
    songPlan: {
      cycleRole: "statement",
      cadenceIntent: "open",
      evidenceAuthority: { resolutionPermitted: false },
      deterministicSignature: "plan-0",
    },
    ...overrides,
  };
}

test("sections receive explicit bounded harmonic functions", () => {
  const planner = createHarmonicJourneyPlanner();
  const sections = ["intro", "establish", "theme-a", "variation", "theme-b", "build", "peak", "release"];
  const regions = sections.map((section, phraseIndex) => planner.advancePhrase({
    frame: { scoreState: "healthy" },
    arrangement: arrangement({ phraseIndex, section, songPlan: {
      cycleRole: "statement",
      cadenceIntent: "open",
      evidenceAuthority: { resolutionPermitted: false },
      deterministicSignature: `plan-${phraseIndex}`,
    } }),
  }).region);
  assert.deepEqual(regions, ["suspended", "home", "home", "subdominant", "relative", "dominant-pressure", "pedal", "suspended"]);
});

test("critical and unknown cannot emit unsupported resolution", () => {
  for (const state of ["critical", "unknown"]) {
    const planner = createHarmonicJourneyPlanner();
    const journey = planner.advancePhrase({
      frame: { scoreState: state },
      arrangement: arrangement({
        scoreState: state,
        section: "breathe",
        songPlan: {
          cycleRole: "reprise",
          cadenceIntent: "resolved",
          evidenceAuthority: { resolutionPermitted: true },
          deterministicSignature: state,
        },
      }),
    });
    assert.equal(journey.resolutionPermitted, false);
    assert.notEqual(journey.cadenceIntent, "resolved");
  }
});

test("recovery cadence requires explicit evidence permission", () => {
  const denied = createHarmonicJourneyPlanner().advancePhrase({
    frame: { scoreState: "healthy" },
    arrangement: arrangement({ section: "recovery", songPlan: {
      cycleRole: "reprise",
      cadenceIntent: "recovery",
      evidenceAuthority: { resolutionPermitted: false },
      deterministicSignature: "denied",
    } }),
  });
  const allowed = createHarmonicJourneyPlanner().advancePhrase({
    frame: { scoreState: "healthy" },
    arrangement: arrangement({ section: "recovery", songPlan: {
      cycleRole: "reprise",
      cadenceIntent: "recovery",
      evidenceAuthority: { resolutionPermitted: true },
      deterministicSignature: "allowed",
    } }),
  });
  assert.equal(denied.resolutionPermitted, false);
  assert.equal(allowed.cadenceIntent, "recovery");
  assert.equal(allowed.destination, "home");
});

test("later cycles take controlled alternative regions without randomness", () => {
  const statement = createHarmonicJourneyPlanner().advancePhrase({
    arrangement: arrangement({ section: "variation", songPlan: {
      cycleRole: "statement",
      cadenceIntent: "open",
      evidenceAuthority: { resolutionPermitted: false },
      deterministicSignature: "statement",
    } }),
  });
  const development = createHarmonicJourneyPlanner().advancePhrase({
    arrangement: arrangement({ section: "variation", songPlan: {
      cycleRole: "development",
      cadenceIntent: "open",
      evidenceAuthority: { resolutionPermitted: false },
      deterministicSignature: "development",
    } }),
  });
  assert.equal(statement.region, "subdominant");
  assert.equal(development.region, "relative");
});

test("Boss Protocol carries a small low-end trim", () => {
  const journey = createHarmonicJourneyPlanner().advancePhrase({
    frame: { scoreState: "critical" },
    arrangement: arrangement({ scoreState: "critical", section: "peak" }),
  });
  assert.equal(journey.bassVelocityScale, 0.94);
  assert.equal(journey.invariants.primaryMidi, "unchanged");
});
