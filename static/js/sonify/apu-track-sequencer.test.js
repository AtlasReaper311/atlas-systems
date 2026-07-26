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
  TONIC_MIDI,
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

test("section endings use bounded percussion without unsafe pitched accents", () => {
  const variationEnd = arrangementForPhrase(frame, plan, 6);
  const hats = [];
  const transitions = [];
  for (let step = 0; step < 32; step += 1) {
    const rhythm = rhythmEventsForTrackStep(frame, variationEnd, step);
    if (rhythm.hat || rhythm.openHat) hats.push(step);
    if (transitionEventForTrackStep(frame, variationEnd, step)) transitions.push(step);
  }
  assert.ok(hats.length < 12);
  assert.deepEqual(transitions, []);
  assert.ok(rhythmEventsForTrackStep(frame, variationEnd, 30).snare);
});

test("release removes rhythmic pressure but preserves harmonic motion", () => {
  const release = arrangementForPhrase(frame, plan, 13);
  assert.ok(padChordForTrackStep(frame, release, 0));
  assert.ok(bassEventForTrackStep(frame, release, 0));
  assert.equal(rhythmEventsForTrackStep(frame, release, 8).snare, null);
  assert.equal(transitionEventForTrackStep(frame, release, 30), null);
});

test("Atlas chip laws create audible state contrast beyond mix changes", () => {
  const healthyFrame = { ...frame, scoreState: "healthy" };
  const warningFrame = { ...frame, scoreState: "warning", scale: [0, 1, 3, 5, 7, 8, 10] };
  const criticalFrame = { ...frame, scoreState: "critical", scale: [0, 1, 4, 5, 7, 8, 10] };
  const unknownFrame = { ...frame, scoreState: "unknown", scale: [0, 2, 5, 7, 10] };

  const healthy = arrangementForPhrase(healthyFrame, plan, 3);
  const warning = arrangementForPhrase(warningFrame, plan, 3);
  const critical = arrangementForPhrase(criticalFrame, plan, 3);
  const unknown = arrangementForPhrase(unknownFrame, plan, 7);

  const healthyLeadSteps = Array.from({ length: 32 }, (_, step) => (
    primaryPulseEventForTrackStep(healthyFrame, healthy, step) ? step : null
  )).filter(Number.isFinite);
  const warningLeadSteps = Array.from({ length: 32 }, (_, step) => (
    primaryPulseEventForTrackStep(warningFrame, warning, step) ? step : null
  )).filter(Number.isFinite);
  const unknownLeadSteps = Array.from({ length: 32 }, (_, step) => (
    primaryPulseEventForTrackStep(unknownFrame, unknown, step) ? step : null
  )).filter(Number.isFinite);

  assert.equal(healthy.chipLaw, "explorer-counterpoint");
  assert.ok(healthy.motifDegrees.includes(6));
  assert.ok(healthyLeadSteps.includes(0));

  assert.equal(warning.chipLaw, "diagnostic-stutter");
  assert.equal(warning.bassPattern, "pressure");
  assert.ok(warningLeadSteps.some((step) => step % 2 === 1));
  assert.ok(rhythmEventsForTrackStep(warningFrame, warning, 1).hat);

  assert.equal(critical.chipLaw, "boss-lockstep");
  assert.equal(critical.drumPattern, "boss");
  const criticalBass = bassEventForTrackStep(criticalFrame, critical, 4);
  const criticalLead = primaryPulseEventForTrackStep(criticalFrame, critical, 4);
  const criticalAlarm = secondaryPulseEventForTrackStep(criticalFrame, critical, 7);
  assert.ok(criticalBass);
  assert.ok(criticalLead);
  assert.ok([0, 7].includes((pitchClass(criticalLead.midi) - pitchClass(criticalBass.midi) + 12) % 12));
  assert.ok([1, 6].includes((pitchClass(criticalAlarm.midi) - pitchClass(TONIC_MIDI) + 12) % 12));

  assert.equal(unknown.chipLaw, "lost-signal-dropout");
  assert.ok(unknownLeadSteps.length <= 2);
  assert.equal(padChordForTrackStep(unknownFrame, unknown, 0)?.duration, "1m");
  assert.equal(rhythmEventsForTrackStep(unknownFrame, unknown, 1).hat, null);
});

test("state transition signatures produce bounded audible APU events", () => {
  const arrangement = arrangementForPhrase(frame, plan, 3);
  const start = 96;
  const pressure = transitionEventForTrackStep(
    { ...frame, scoreState: "warning", scale: [0, 1, 3, 5, 7, 8, 10] },
    arrangement,
    0,
    { from: "healthy", to: "warning", stepIndex: start },
    start,
  );
  const interrupt = transitionEventForTrackStep(
    { ...frame, scoreState: "critical", scale: [0, 1, 4, 5, 7, 8, 10] },
    arrangement,
    0,
    { from: "warning", to: "critical", stepIndex: start },
    start,
  );
  const bloom = [0, 2, 4, 6, 10].map((delta) => transitionEventForTrackStep(
    frame,
    arrangement,
    delta,
    { from: "critical", to: "healthy", stepIndex: start },
    start + delta,
  ));
  const resolve = transitionEventForTrackStep(
    frame,
    arrangement,
    8,
    { from: "unknown", to: "healthy", stepIndex: start },
    start + 8,
  );
  const dropout = transitionEventForTrackStep(
    { ...frame, scoreState: "unknown", scale: [0, 2, 5, 7, 10] },
    arrangement,
    15,
    { from: "healthy", to: "unknown", stepIndex: start },
    start + 15,
  );

  assert.equal(pressure.type, "pressure-ramp");
  assert.equal(pressure.notes[0].voice, "incident");
  assert.ok(pressure.notes[0].velocity <= 0.46);

  assert.equal(interrupt.type, "interrupt-drop");
  assert.ok(interrupt.bassDrop);
  assert.ok(interrupt.noise);
  assert.ok(interrupt.noise.velocity <= 0.24);

  assert.deepEqual(bloom.map((event) => event?.type), [
    "recovery-bloom",
    "recovery-bloom",
    "recovery-bloom",
    "recovery-bloom",
    "recovery-bloom",
  ]);
  assert.ok(bloom.every((event) => event.notes[0].voice === "deployment"));
  assert.ok(bloom.at(-1).notes[0].velocity > bloom[0].notes[0].velocity);

  assert.equal(resolve.type, "carrier-resolve");
  assert.equal(resolve.notes[0].voice, "deployment");

  assert.equal(dropout.type, "melody-dropout");
  assert.ok(dropout.noise);
  assert.deepEqual(dropout.notes, []);

  assert.equal(
    transitionEventForTrackStep(frame, arrangement, 16, { from: "critical", to: "healthy", stepIndex: start }, start + 16),
    null,
  );
});
