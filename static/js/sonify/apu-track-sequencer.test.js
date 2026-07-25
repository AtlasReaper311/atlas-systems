import assert from "node:assert/strict";
import test from "node:test";

import { arrangementForPhrase } from "./apu-arranger.js";
import {
  bassEventForTrackStep,
  eventSignatureForPhrase,
  normalizedScale,
  padChordForTrackStep,
  primaryPulseEventForTrackStep,
  rhythmEventsForTrackStep,
  secondaryPulseEventForTrackStep,
  serviceEventForTrackStep,
  transitionEventForTrackStep,
} from "./apu-track-sequencer.js";

const voices = [
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
];

const plan = {
  phase: "develop",
  targetBpm: 100,
  energy: 0.5,
  intent: { pressure: 0.35, confidence: 0.9, intensity: 0.5 },
};

function frame(scoreState) {
  return { scoreState, bpm: 100, voices };
}

function pitchClass(midi) {
  return ((Math.round(midi) % 12) + 12) % 12;
}

function allowedPitchClasses(state) {
  return new Set(normalizedScale(frame(state)).map((offset) => (41 + offset) % 12));
}

test("each state selects its own scale instead of trusting shared frame scale", () => {
  assert.deepEqual(normalizedScale({ scoreState: "healthy", scale: [0] }), [0, 2, 3, 5, 7, 9, 10]);
  assert.deepEqual(normalizedScale({ scoreState: "warning", scale: [0] }), [0, 1, 3, 5, 7, 8, 10]);
  assert.deepEqual(normalizedScale({ scoreState: "critical", scale: [0] }), [0, 1, 4, 5, 7, 8, 10]);
  assert.deepEqual(normalizedScale({ scoreState: "unknown", scale: [0] }), [0, 2, 5, 7, 10]);
});

test("the same section produces four different event signatures", () => {
  const signatures = ["healthy", "warning", "critical", "unknown"].map((state) => {
    const arrangement = arrangementForPhrase(frame(state), plan, 9);
    return eventSignatureForPhrase(frame(state), arrangement).join("|");
  });
  assert.equal(new Set(signatures).size, 4);
});

test("uncategorized pitched output remains inside the active state scale", () => {
  for (const state of ["healthy", "warning", "critical", "unknown"]) {
    const allowed = allowedPitchClasses(state);
    for (let phrase = 0; phrase < 16; phrase += 1) {
      const arrangement = arrangementForPhrase(frame(state), plan, phrase);
      for (let step = 0; step < 32; step += 1) {
        const events = [
          bassEventForTrackStep(frame(state), arrangement, step),
          primaryPulseEventForTrackStep(frame(state), arrangement, step),
          secondaryPulseEventForTrackStep(frame(state), arrangement, step),
        ].filter(Boolean);
        const memory = padChordForTrackStep(frame(state), arrangement, step);
        for (const event of events) {
          if (event.pitchIntent === "diatonic" || event.pitchIntent === "drift") {
            assert.ok(allowed.has(pitchClass(event.midi)), `${state} ${event.role} ${event.midi}`);
          } else {
            assert.ok(["approach", "alarm"].includes(event.pitchIntent));
          }
        }
        for (const midi of memory?.midis ?? []) {
          if (memory.pitchIntent !== "alarm") {
            assert.ok(allowed.has(pitchClass(midi)), `${state} memory ${midi}`);
          }
        }
      }
    }
  }
});

test("warning approach notes resolve on the immediately following step", () => {
  const state = "warning";
  const arrangement = arrangementForPhrase(frame(state), plan, 3);
  for (const step of [6, 14, 22, 30]) {
    const approach = primaryPulseEventForTrackStep(frame(state), arrangement, step);
    if (!approach || approach.pitchIntent !== "approach") continue;
    const resolution = primaryPulseEventForTrackStep(frame(state), arrangement, step + 1);
    assert.ok(resolution);
    assert.equal(resolution.midi, approach.resolvesToMidi);
  }
});

test("critical alarm notes are explicit and bounded", () => {
  const state = "critical";
  const arrangement = arrangementForPhrase(frame(state), plan, 11);
  const alarms = [6, 14, 22, 30]
    .map((step) => secondaryPulseEventForTrackStep(frame(state), arrangement, step))
    .filter(Boolean);
  assert.ok(alarms.length >= 2);
  assert.ok(alarms.every((event) => event.pitchIntent === "alarm"));
  assert.ok(alarms.every((event) => ["minor-second", "tritone"].includes(event.alarmInterval)));
});

test("critical and unknown repurpose memory instead of adding channels", () => {
  const criticalArrangement = arrangementForPhrase(frame("critical"), plan, 11);
  const unknownArrangement = arrangementForPhrase(frame("unknown"), plan, 11);
  assert.equal(padChordForTrackStep(frame("critical"), criticalArrangement, 0)?.role, "sub-bass-layer");
  assert.equal(padChordForTrackStep(frame("unknown"), unknownArrangement, 0)?.role, "carrier");
});

test("unknown rhythm is materially sparser than warning rhythm", () => {
  const warning = arrangementForPhrase(frame("warning"), plan, 9);
  const unknown = arrangementForPhrase(frame("unknown"), plan, 9);
  const count = (state, arrangement) => Array.from({ length: 32 }, (_, step) => {
    const events = rhythmEventsForTrackStep(frame(state), arrangement, step);
    return Object.values(events).filter(Boolean).length;
  }).reduce((total, value) => total + value, 0);
  assert.ok(count("unknown", unknown) < count("warning", warning) / 2);
});

test("services remain deterministic and pitched transitions remain disabled", () => {
  const arrangement = arrangementForPhrase(frame("healthy"), plan, 3);
  assert.deepEqual(
    serviceEventForTrackStep(frame("healthy"), arrangement, 2),
    serviceEventForTrackStep(frame("healthy"), arrangement, 2),
  );
  assert.equal(transitionEventForTrackStep(frame("healthy"), arrangement, 30), null);
});
