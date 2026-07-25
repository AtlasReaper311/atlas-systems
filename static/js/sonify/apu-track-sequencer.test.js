import assert from "node:assert/strict";
import test from "node:test";

import { arrangementForPhrase } from "./apu-arranger.js";
import {
  bassEventForTrackStep,
  normalizedScale,
  padChordForTrackStep,
  primaryPulseEventForTrackStep,
  quantizeMidiToHarmony,
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
      motifMidi: [54, 58, 61, 56],
    },
  ],
};

const plan = {
  phase: "develop",
  targetBpm: 100,
  energy: 0.5,
  intent: { pressure: 0.35, confidence: 0.9, intensity: 0.5 },
};

function pitchClass(midi) {
  return ((Math.round(midi) % 12) + 12) % 12;
}

function scalePitchClasses() {
  return new Set(normalizedScale(frame).map((offset) => (41 + offset) % 12));
}

test("scale normalisation removes the duplicated octave", () => {
  assert.deepEqual(normalizedScale(frame), [0, 2, 3, 5, 7, 8, 10]);
});

test("intro and peak sequencing create clear density contrast", () => {
  const intro = arrangementForPhrase(frame, plan, 0);
  const peak = arrangementForPhrase(frame, plan, 11);
  assert.equal(rhythmEventsForTrackStep(frame, intro, 0).kick, null);
  assert.ok(rhythmEventsForTrackStep(frame, peak, 0).kick);
  assert.equal(bassEventForTrackStep(frame, intro, 0), null);
  assert.ok(bassEventForTrackStep(frame, peak, 0));
});

test("all harmonic and melodic output remains in the active F mode", () => {
  const allowed = scalePitchClasses();
  for (let phrase = 0; phrase < 16; phrase += 1) {
    const arrangement = arrangementForPhrase(frame, plan, phrase);
    for (let step = 0; step < 32; step += 1) {
      const chord = padChordForTrackStep(frame, arrangement, step);
      const lead = primaryPulseEventForTrackStep(frame, arrangement, step);
      const counter = secondaryPulseEventForTrackStep(frame, arrangement, step);
      const bass = bassEventForTrackStep(frame, arrangement, step);
      for (const midi of chord?.midis ?? []) assert.ok(allowed.has(pitchClass(midi)));
      if (lead) assert.ok(allowed.has(pitchClass(lead.midi)));
      if (counter) assert.ok(allowed.has(pitchClass(counter.midi)));
      if (bass) assert.ok(allowed.has(pitchClass(bass.midi)));
    }
  }
});

test("lead voice-leading avoids abrupt within-phrase jumps", () => {
  for (let phrase = 0; phrase < 16; phrase += 1) {
    const arrangement = arrangementForPhrase(frame, plan, phrase);
    const notes = Array.from({ length: 32 }, (_, step) => (
      primaryPulseEventForTrackStep(frame, arrangement, step)?.midi ?? null
    )).filter(Number.isFinite);
    for (let index = 1; index < notes.length; index += 1) {
      assert.ok(
        Math.abs(notes[index] - notes[index - 1]) <= 12,
        `${arrangement.section} jumped ${notes[index - 1]} to ${notes[index]}`,
      );
    }
  }
});

test("service notes are pulled into the current harmony", () => {
  const arrangement = arrangementForPhrase(frame, plan, 3);
  const service = serviceEventForTrackStep(frame, arrangement, 2);
  assert.ok(service);
  assert.ok(scalePitchClasses().has(pitchClass(service.midi)));
  assert.equal(service.midi, quantizeMidiToHarmony(frame, arrangement, 2, service.midi, 32, 88));
  assert.deepEqual(serviceEventForTrackStep(frame, arrangement, 2), service);
});

test("section endings use bounded fills instead of continuous hats", () => {
  const variationEnd = arrangementForPhrase(frame, plan, 6);
  const hats = [];
  const transitions = [];
  for (let step = 0; step < 32; step += 1) {
    const rhythm = rhythmEventsForTrackStep(frame, variationEnd, step);
    if (rhythm.hat || rhythm.openHat) hats.push(step);
    if (transitionEventForTrackStep(frame, variationEnd, step)) transitions.push(step);
  }
  assert.ok(hats.length < 12);
  assert.deepEqual(transitions, [31]);
  assert.ok(rhythmEventsForTrackStep(frame, variationEnd, 30).snare);
});

test("release removes rhythmic pressure but preserves harmonic motion", () => {
  const release = arrangementForPhrase(frame, plan, 13);
  assert.ok(padChordForTrackStep(frame, release, 0));
  assert.ok(bassEventForTrackStep(frame, release, 0));
  assert.equal(rhythmEventsForTrackStep(frame, release, 8).snare, null);
  assert.ok(transitionEventForTrackStep(frame, release, 30));
});
