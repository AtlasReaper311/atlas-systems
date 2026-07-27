import assert from "node:assert/strict";
import test from "node:test";

import {
  arrangementForPhrase as d2ArrangementForPhrase,
  resetMelodyPreservingD2Planner as resetD2Baseline,
} from "./apu-arranger-d2-baseline.js";
import {
  arrangementForPhrase,
  resetMelodyPreservingD2Planner,
} from "./apu-arranger.js";
import { peakRegisterShiftForState } from "./apu-signature-gestures-d3.js";
import {
  bassEventForTrackStep as baselineBassEvent,
  padChordForTrackStep as baselinePadEvent,
  primaryPulseEventForTrackStep as baselinePrimaryEvent,
} from "./apu-track-sequencer-d2-baseline.js";
import {
  bassEventForTrackStep,
  padChordForTrackStep,
  primaryPulseEventForTrackStep,
} from "./apu-track-sequencer.js";
import { createScoreTraceEntry } from "./apu-score-trace.js";

const directorPlan = {
  phase: "develop",
  energy: 0.48,
  intent: { pressure: 0.4, confidence: 0.9, intensity: 0.5 },
};

const frames = ["healthy", "warning", "critical", "unknown"].map((scoreState) => ({
  scoreState,
  tension: scoreState === "critical" ? 0.9 : 0.35,
  stale: scoreState === "unknown",
}));

test("D3 preserves primary events except the reviewed state-specific Peak octave policy", () => {
  for (const frame of frames) {
    resetD2Baseline();
    resetMelodyPreservingD2Planner();
    for (let phrase = 0; phrase < 32; phrase += 1) {
      const baseline = d2ArrangementForPhrase(frame, directorPlan, phrase);
      const candidate = arrangementForPhrase(frame, directorPlan, phrase);
      assert.deepEqual(candidate.harmony, baseline.harmony);
      assert.equal(candidate.motifMode, baseline.motifMode);
      assert.deepEqual(candidate.motifDegrees, baseline.motifDegrees);
      for (let step = 0; step < 32; step += 1) {
        const before = baselinePrimaryEvent(frame, baseline, step);
        const after = primaryPulseEventForTrackStep(frame, candidate, step);
        const shift = candidate.section === "peak"
          ? peakRegisterShiftForState(frame.scoreState)
          : 0;
        if (!before || shift === 0) {
          assert.deepEqual(after, before, `${frame.scoreState}/phrase-${phrase}/step-${step}`);
          continue;
        }
        assert.deepEqual(after, Object.freeze({
          ...before,
          midi: before.midi + shift,
          registerAdjustmentSemitones: shift,
        }), `${frame.scoreState}/phrase-${phrase}/step-${step}`);
      }
    }
  }
});

test("D3 changes only existing pad voicings and keeps them bounded", () => {
  const frame = frames[0];
  resetD2Baseline();
  resetMelodyPreservingD2Planner();
  for (let phrase = 0; phrase < 16; phrase += 1) {
    const baseline = d2ArrangementForPhrase(frame, directorPlan, phrase);
    const candidate = arrangementForPhrase(frame, directorPlan, phrase);
    for (const step of [0, 16]) {
      const before = baselinePadEvent(frame, baseline, step);
      const after = padChordForTrackStep(frame, candidate, step);
      assert.equal(Boolean(after), Boolean(before));
      if (!before || !after) continue;
      assert.equal(after.duration, before.duration);
      assert.equal(after.velocity, before.velocity);
      assert.ok(after.midis.every((midi) => midi >= 45 && midi <= 72));
      assert.equal(new Set(after.midis).size, after.midis.length);
    }
  }
});

test("Boss bass keeps pitch and rhythm with a small velocity trim", () => {
  const frame = frames.find((candidate) => candidate.scoreState === "critical");
  resetD2Baseline();
  resetMelodyPreservingD2Planner();
  for (let phrase = 0; phrase < 16; phrase += 1) {
    const baseline = d2ArrangementForPhrase(frame, directorPlan, phrase);
    const candidate = arrangementForPhrase(frame, directorPlan, phrase);
    for (let step = 0; step < 32; step += 1) {
      const before = baselineBassEvent(frame, baseline, step);
      const after = bassEventForTrackStep(frame, candidate, step);
      assert.equal(Boolean(after), Boolean(before));
      if (!before || !after) continue;
      assert.equal(after.midi, before.midi);
      assert.equal(after.duration, before.duration);
      assert.ok(after.velocity <= before.velocity);
      assert.ok(after.velocity >= before.velocity * 0.93);
    }
  }
});

test("D3 trace records harmonic destination without losing baseline evidence", () => {
  resetMelodyPreservingD2Planner();
  const frame = frames[0];
  const arrangement = arrangementForPhrase(frame, directorPlan, 15);
  const trace = createScoreTraceEntry({ frame, directorPlan, arrangement });
  assert.equal(trace.harmonicRegion, arrangement.harmonicRegion);
  assert.equal(trace.cadenceIntent, arrangement.cadenceIntent);
  assert.ok(Array.isArray(trace.supportHarmony));
  assert.ok(trace.decisionSources.includes("apu-harmonic-journey"));
  assert.match(trace.deterministicSignature, /^[0-9a-f]{8}$/);
});
