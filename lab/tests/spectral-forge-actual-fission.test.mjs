import assert from "node:assert/strict";
import test from "node:test";

import { SCENARIO_BY_ID, createFrame } from "../../static/js/spectral-forge/domain.js";
import { audibleOutputs, createComparisonState } from "../../static/js/spectral-forge/state.js";
import {
  createPhysicalStateModel,
  stepPhysicalState,
} from "../../static/js/spectral-forge/spectral-field-physical-state.js";
import {
  createPhysicalFissionState,
  readFissionEvidence,
  stepPhysicalFission,
} from "../../static/js/spectral-forge/prototypes/field-proto-flagship-final-form-physics.js";

const comparison = createComparisonState();
const STEP_SECONDS = 0.05;

function stepScenario(id, seconds, { physicalModel, fissionModel, lifeStart = 0 } = {}) {
  const physical = physicalModel ?? createPhysicalStateModel();
  const fission = fissionModel ?? createPhysicalFissionState();
  const seed = SCENARIO_BY_ID[id].visualSeed;
  const samples = [];

  for (let offset = 0; offset <= seconds + 1e-9; offset += STEP_SECONDS) {
    const scenarioTime = Math.min(60, Number(offset.toFixed(2)));
    const frame = createFrame(id, scenarioTime);
    const state = stepPhysicalState(physical, {
      frame,
      outputs: audibleOutputs(frame, comparison),
      lifeTime: lifeStart + offset,
      scenarioSeed: seed,
      audioExpression: 0,
    });
    // stepPhysicalFission reuses its result between frames, so a retained
    // sample must copy it rather than hold the live reference.
    const split = readFissionEvidence(stepPhysicalFission(fission, {
      physical: state,
      lifeTime: lifeStart + offset,
      seedPhase: 2.4,
    }));
    samples.push({ scenarioTime, state, split });
  }

  return { physicalModel: physical, fissionModel: fission, samples, lifeEnd: lifeStart + seconds };
}

test("actual Cascading Failure telemetry crosses the generic stress-fission envelope", () => {
  const run = stepScenario("cascade", 60);
  const firstStress = run.samples.find((sample) => sample.split.active && sample.split.stressDriven);
  assert.ok(firstStress, "real cascade telemetry must trigger stress-driven fission without a scenario-name check");
  assert.ok(firstStress.scenarioTime >= 40, "stress fission should emerge from accumulated failure rather than start as a preset clip");
  assert.equal(firstStress.split.count, 2, "an ordinary severe cascade separates into two principal masses");
  assert.ok(firstStress.split.count >= 2 && firstStress.split.count <= 3, "severe cascade should recruit two or three meaningful masses");
  assert.ok(run.samples.some((sample) => sample.split.independent), "cascade fission should reach an independent daughter phase");
});

test("actual Service Flapping telemetry does not routinely cross the major-fission envelope", () => {
  const run = stepScenario("flapping", 60);
  assert.equal(
    run.samples.some((sample) => sample.split.active && sample.split.stressDriven),
    false,
    "flapping should express coherence loss and necking without routine major daughter separation",
  );
});

test("scenario change during actual stress fission preserves the same active event", () => {
  // Sample mid-separation. Running to 60s lets the separation legitimately
  // finish, and a completed event is not a restarted one.
  const cascade = stepScenario("cascade", 50);
  const active = [...cascade.samples].reverse().find((sample) => sample.split.active && sample.split.stressDriven);
  assert.ok(active, "cascade should have an active stress-fission event before handoff");
  const progressBefore = active.split.progress;
  const countBefore = active.split.count;

  const recovery = stepScenario("deploy", 1.5, {
    physicalModel: cascade.physicalModel,
    fissionModel: cascade.fissionModel,
    lifeStart: cascade.lifeEnd + STEP_SECONDS,
  });
  const first = recovery.samples[0].split;
  const latest = recovery.samples.at(-1).split;
  assert.equal(first.active, true, "scenario handoff must not despawn the active daughter event");
  assert.equal(first.count, countBefore);
  assert.equal(latest.active, true, "the separation must still be running through the handoff");
  assert.ok(latest.progress >= progressBefore, "new telemetry must act on the current event rather than restart it");
  assert.equal(latest.count, countBefore, "the daughter count must survive the handoff");
});
