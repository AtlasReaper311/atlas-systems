import assert from "node:assert/strict";
import test from "node:test";

import {
  DRONE_MIDI,
  PAD_MEASURE_STEPS,
  PAD_ROOT_MIDI,
  PERCUSSION_BUS_GAINS,
  buildPadVoicing,
  percussionEventsForStep,
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
  assert.deepEqual(DRONE_MIDI, [26, 33]);
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
      assert.ok(Math.max(...notes) <= 57, `${state} pad should stay at or below A3`);
    }
  }
});

test("service octave variation is neutral or downward, never an upward alarm jump", () => {
  for (let seed = 0; seed < 500; seed += 1) {
    assert.ok([0, -12].includes(serviceOctaveDisplacement(seed)));
  }
});

test("every state keeps an industrial rhythmic foundation", () => {
  const steps = Array.from({ length: 32 }, (_, step) => step);
  const eventSteps = (state, event) => steps.filter(
    (step) => percussionEventsForStep(state, step)[event] !== null,
  );

  assert.deepEqual(eventSteps("healthy", "kick"), [0, 8, 16, 24]);
  assert.deepEqual(eventSteps("healthy", "snare"), [4, 12, 20, 28]);
  assert.deepEqual(
    eventSteps("healthy", "hat"),
    [1, 3, 5, 7, 9, 11, 13, 15, 17, 19, 21, 23, 25, 27, 29, 31],
  );
  assert.deepEqual(
    eventSteps("warning", "kick"),
    [0, 6, 8, 14, 16, 22, 24, 30],
  );
  assert.deepEqual(
    eventSteps("warning", "snare"),
    [4, 12, 20, 28],
  );
  assert.deepEqual(eventSteps("unknown", "kick"), [0, 16]);
  assert.deepEqual(eventSteps("unknown", "hat"), [3, 7, 11, 19, 23, 31]);
  assert.ok(PERCUSSION_BUS_GAINS.healthy > 0);
  assert.ok(PERCUSSION_BUS_GAINS.warning > PERCUSSION_BUS_GAINS.healthy);
  assert.ok(PERCUSSION_BUS_GAINS.critical > PERCUSSION_BUS_GAINS.warning);
  assert.ok(PERCUSSION_BUS_GAINS.unknown > 0);
  assert.ok(PERCUSSION_BUS_GAINS.unknown < PERCUSSION_BUS_GAINS.healthy);
});

test("critical keeps the liked kick pattern inside the fuller drum machine", () => {
  const steps = Array.from({ length: 32 }, (_, step) => step);
  assert.deepEqual(
    steps.filter((step) => percussionEventsForStep("critical", step).kick),
    [0, 8, 14, 16, 24, 30],
  );
  assert.deepEqual(
    steps.filter((step) => percussionEventsForStep("critical", step).snare),
    [4, 12, 20, 28],
  );
  assert.equal(percussionEventsForStep("critical", 0).kick.velocity, 0.72);
  assert.equal(percussionEventsForStep("critical", 14).kick.velocity, 0.48);
  assert.equal(percussionEventsForStep("critical", 7).hat.velocity, 0.3);
  assert.equal(percussionEventsForStep("critical", 3).hat.velocity, 0.2);
  assert.equal(percussionEventsForStep("critical", 15).metal.velocity, 0.24);
});
