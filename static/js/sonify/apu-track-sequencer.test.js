import assert from "node:assert/strict";
import test from "node:test";

import { arrangementForPhrase } from "./apu-arranger.js";
import {
  bassEventForTrackStep,
  padChordForTrackStep,
  primaryPulseEventForTrackStep,
  rhythmEventsForTrackStep,
  secondaryPulseEventForTrackStep,
  serviceEventForTrackStep,
  transitionEventForTrackStep,
} from "./apu-track-sequencer.js";

const frame = {
  scoreState: "healthy",
  bpm: 100,
  scale: [0, 2, 3, 5, 7, 8, 10, 12],
  voices: [
    {
      name: "atlas-systems",
      displayName: "Atlas Systems",
      layer: "surface",
      hash: 101,
      pan: -0.2,
      status: "healthy",
      measured: true,
      velocity: 0.5,
      motifMidi: [53, 57, 60, 55],
    },
  ],
};

const plan = {
  phase: "develop",
  targetBpm: 100,
  energy: 0.5,
  intent: { pressure: 0.35, confidence: 0.9, intensity: 0.5 },
};

test("intro and peak sequencing create clear density contrast", () => {
  const intro = arrangementForPhrase(frame, plan, 0);
  const peak = arrangementForPhrase(frame, plan, 11);
  assert.equal(rhythmEventsForTrackStep(frame, intro, 0).kick, null);
  assert.ok(rhythmEventsForTrackStep(frame, peak, 0).kick);
  assert.equal(bassEventForTrackStep(frame, intro, 0), null);
  assert.ok(bassEventForTrackStep(frame, peak, 0));
});

test("harmony and motif remain in bounded musical registers", () => {
  const arrangement = arrangementForPhrase(frame, plan, 3);
  const chord = padChordForTrackStep(frame, arrangement, 0);
  const lead = primaryPulseEventForTrackStep(frame, arrangement, 0);
  assert.ok(chord.midis.every((midi) => midi >= 45 && midi <= 76));
  assert.ok(lead.midi >= 58 && lead.midi <= 91);
  assert.equal(padChordForTrackStep(frame, arrangement, 1), null);
});

test("counterline and service callouts are deterministic", () => {
  const arrangement = arrangementForPhrase(frame, plan, 3);
  const counter = secondaryPulseEventForTrackStep(frame, arrangement, 4);
  const service = serviceEventForTrackStep(frame, arrangement, 2);
  assert.ok(counter);
  assert.ok(service);
  assert.deepEqual(serviceEventForTrackStep(frame, arrangement, 2), service);
  assert.equal(service.voice.name, "atlas-systems");
});

test("section endings create fills and transitions", () => {
  const arrangement = arrangementForPhrase(frame, plan, 2);
  assert.equal(arrangement.isSectionEnd, true);
  const fill = rhythmEventsForTrackStep(frame, arrangement, 30);
  const transition = transitionEventForTrackStep(frame, arrangement, 31);
  assert.ok(fill.snare);
  assert.ok(transition);
  assert.equal(transition.type, "fill" === arrangement.transition ? "hit" : transition.type);
});

test("release removes rhythmic pressure but preserves harmonic motion", () => {
  const release = arrangementForPhrase(frame, plan, 13);
  assert.ok(padChordForTrackStep(frame, release, 0));
  assert.ok(bassEventForTrackStep(frame, release, 0));
  assert.equal(rhythmEventsForTrackStep(frame, release, 8).snare, null);
  assert.ok(transitionEventForTrackStep(frame, release, 30));
});
