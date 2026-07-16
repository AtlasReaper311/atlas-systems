import assert from "node:assert/strict";
import test from "node:test";

import {
  DRONE_MIDI,
  PAD_MEASURE_STEPS,
  PAD_ROOT_MIDI,
  buildPadVoicing,
  serviceOctaveDisplacement,
  shouldPlayPad,
  startToneWithTimeout,
} from "./engine.js";
import { SCORE_STATES } from "./mapping.js";

test("audio context start resolves normally", async () => {
  await startToneWithTimeout({ start: async () => undefined }, 20);
});

test("audio context start fails closed when browser unlock never resolves", async () => {
  await assert.rejects(
    startToneWithTimeout({ start: () => new Promise(() => {}) }, 10),
    /audio context did not start in time/,
  );
});

test("the shared pad refreshes every measure with a low grounded voicing", () => {
  assert.deepEqual(DRONE_MIDI, [38, 45]);
  assert.equal(PAD_MEASURE_STEPS, 8);
  assert.deepEqual(
    Array.from({ length: 32 }, (_, step) => step).filter(shouldPlayPad),
    [0, 8, 16, 24],
  );
  for (const state of Object.keys(SCORE_STATES)) {
    for (let measure = 0; measure < 4; measure += 1) {
      const notes = buildPadVoicing(state, SCORE_STATES[state].scale, measure);
      assert.ok(notes.length >= 2);
      assert.ok(Math.min(...notes) >= PAD_ROOT_MIDI);
      assert.ok(Math.max(...notes) <= 62, `${state} pad should stay below D5`);
    }
  }
});

test("service octave variation is neutral or downward, never an upward alarm jump", () => {
  for (let seed = 0; seed < 500; seed += 1) {
    assert.ok([0, -12].includes(serviceOctaveDisplacement(seed)));
  }
});
