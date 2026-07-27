import assert from "node:assert/strict";
import test from "node:test";

import {
  APU_ACCOMPANIMENT_DEVELOPMENT_D2_BUILD_ID,
  accompanimentDevelopmentForSongPlan,
} from "./apu-accompaniment-development-d2.js";

const plan = (overrides = {}) => ({
  cycleRole: "statement",
  phraseRole: "statement",
  state: "healthy",
  themeId: "ATLAS_THEME",
  transform: "identity",
  cadenceIntent: "open",
  ...overrides,
});

test("D2 development identifies the melody-preserving contract", () => {
  assert.match(APU_ACCOMPANIMENT_DEVELOPMENT_D2_BUILD_ID, /melody-preserving-v1$/);
  const development = accompanimentDevelopmentForSongPlan(plan());
  assert.equal(development.policy, "preserve-primary-melody");
  assert.equal(development.mix.primary, 1);
  assert.equal(development.timbre.leadCutoff, 1);
  assert.equal(development.timbre.leadDrive, 1);
  assert.equal(development.timbre.primaryDutyCycle, 1);
  assert.equal(development.invariants.extraPrimaryEvents, 0);
});

test("all accompaniment multipliers stay inside a narrow ten-percent envelope", () => {
  for (const cycleRole of ["statement", "development", "contrast", "reprise"]) {
    for (const phraseRole of ["statement", "answer", "bridge", "build", "climax", "release", "cadence", "suspension", "decay"]) {
      for (const state of ["healthy", "warning", "critical", "unknown"]) {
        const development = accompanimentDevelopmentForSongPlan(plan({ cycleRole, phraseRole, state }));
        for (const [key, value] of Object.entries(development.mix)) {
          if (key === "primary") assert.equal(value, 1);
          else assert.ok(value >= 0.9 && value <= 1.1, `${cycleRole}/${phraseRole}/${state}/${key}`);
        }
        for (const value of Object.values(development.timbre)) {
          assert.ok(value >= 0.9 && value <= 1.1);
        }
        assert.ok(Object.isFrozen(development));
        assert.ok(Object.isFrozen(development.mix));
        assert.ok(Object.isFrozen(development.timbre));
        assert.ok(Object.isFrozen(development.invariants));
      }
    }
  }
});

test("long-form roles change accompaniment without changing the melody policy", () => {
  const statement = accompanimentDevelopmentForSongPlan(plan({ cycleRole: "statement" }));
  const development = accompanimentDevelopmentForSongPlan(plan({ cycleRole: "development" }));
  const contrast = accompanimentDevelopmentForSongPlan(plan({ cycleRole: "contrast" }));
  const reprise = accompanimentDevelopmentForSongPlan(plan({ cycleRole: "reprise" }));
  assert.notDeepEqual(statement.mix, development.mix);
  assert.notDeepEqual(development.mix, contrast.mix);
  assert.notDeepEqual(contrast.mix, reprise.mix);
  for (const candidate of [statement, development, contrast, reprise]) {
    assert.equal(candidate.mix.primary, 1);
    assert.equal(candidate.invariants.motifDegrees, "unchanged");
    assert.equal(candidate.invariants.primaryMidi, "unchanged");
  }
});
