import assert from "node:assert/strict";
import test from "node:test";

import {
  arrangementForPhrase,
  resetMelodyPreservingD2Planner,
} from "./apu-arranger.js";
import { arrangementForPhrase as baselineArrangementForPhrase } from "./apu-arranger-baseline.js";
import { primaryPulseEventForTrackStep } from "./apu-track-sequencer.js";

const directorPlan = Object.freeze({
  phase: "develop",
  targetBpm: 100,
  energy: 0.56,
  intent: Object.freeze({ pressure: 0.42, confidence: 0.9, intensity: 0.5 }),
});

const frameFor = (scoreState) => Object.freeze({
  scoreState,
  bpm: 100,
  tension: scoreState === "critical" ? 0.88 : scoreState === "warning" ? 0.58 : 0.3,
  stale: scoreState === "unknown",
});

const states = Object.freeze(["healthy", "warning", "critical", "unknown"]);

test("D2 preserves every baseline melody-authority field across the full form", () => {
  resetMelodyPreservingD2Planner();
  for (const state of states) {
    for (let phrase = 0; phrase < 32; phrase += 1) {
      const frame = frameFor(state);
      const baseline = baselineArrangementForPhrase(frame, directorPlan, phrase);
      const developed = arrangementForPhrase(frame, directorPlan, phrase);
      assert.equal(developed.motifMode, baseline.motifMode, `${state}/${phrase}/mode`);
      assert.strictEqual(developed.motifDegrees, baseline.motifDegrees, `${state}/${phrase}/degrees-reference`);
      assert.deepEqual(developed.motifDegrees, baseline.motifDegrees, `${state}/${phrase}/degrees`);
      assert.deepEqual(developed.harmony, baseline.harmony, `${state}/${phrase}/harmony`);
      assert.equal(developed.drumPattern, baseline.drumPattern, `${state}/${phrase}/drums`);
      assert.equal(developed.bassPattern, baseline.bassPattern, `${state}/${phrase}/bass`);
      assert.equal(developed.counterPattern, baseline.counterPattern, `${state}/${phrase}/counter`);
      assert.equal(developed.mix.primary, baseline.mix.primary, `${state}/${phrase}/primary-mix`);
      assert.equal(developed.timbre.leadCutoffHz, baseline.timbre.leadCutoffHz, `${state}/${phrase}/lead-cutoff`);
      assert.equal(developed.timbre.leadDrive, baseline.timbre.leadDrive, `${state}/${phrase}/lead-drive`);
      assert.equal(developed.timbre.primaryDutyCycle, baseline.timbre.primaryDutyCycle, `${state}/${phrase}/duty`);
      assert.equal(developed.accompanimentDevelopment.policy, "preserve-primary-melody");
    }
  }
});

test("the sequenced primary line remains byte-for-byte equivalent to the PR 133-era baseline", () => {
  resetMelodyPreservingD2Planner();
  for (const state of states) {
    for (let phrase = 0; phrase < 16; phrase += 1) {
      const frame = frameFor(state);
      const baseline = baselineArrangementForPhrase(frame, directorPlan, phrase);
      const developed = arrangementForPhrase(frame, directorPlan, phrase);
      for (let step = 0; step < 32; step += 1) {
        assert.deepEqual(
          primaryPulseEventForTrackStep(frame, developed, step),
          primaryPulseEventForTrackStep(frame, baseline, step),
          `${state}/${phrase}/${step}`,
        );
      }
    }
  }
});

test("D2 changes only bounded accompaniment balance and supporting timbre", () => {
  resetMelodyPreservingD2Planner();
  const baseline = baselineArrangementForPhrase(frameFor("healthy"), directorPlan, 20);
  const developed = arrangementForPhrase(frameFor("healthy"), directorPlan, 20);
  assert.notDeepEqual(developed.mix, baseline.mix);
  assert.equal(developed.mix.primary, baseline.mix.primary);
  for (const key of ["secondary", "services", "bass", "drums", "pad", "accent"]) {
    const original = baseline.mix[key];
    const next = developed.mix[key];
    if (original === 0) assert.equal(next, 0);
    else assert.ok(next >= original * 0.9 - 1e-9 && next <= Math.min(1, original * 1.1) + 1e-9, key);
  }
  assert.equal(developed.timbre.leadCutoffHz, baseline.timbre.leadCutoffHz);
  assert.equal(developed.timbre.leadDrive, baseline.timbre.leadDrive);
  assert.equal(developed.timbre.primaryDutyCycle, baseline.timbre.primaryDutyCycle);
});

test("planner reset makes the same phrase deterministic", () => {
  resetMelodyPreservingD2Planner();
  const first = arrangementForPhrase(frameFor("warning"), directorPlan, 7);
  resetMelodyPreservingD2Planner();
  const second = arrangementForPhrase(frameFor("warning"), directorPlan, 7);
  assert.deepEqual(first.songPlan, second.songPlan);
  assert.deepEqual(first.accompanimentDevelopment, second.accompanimentDevelopment);
});
