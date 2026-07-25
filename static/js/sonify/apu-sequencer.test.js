import assert from "node:assert/strict";
import test from "node:test";

import {
  APU_PHRASE_STEPS,
  bassEventForStep,
  deploymentSequence,
  incidentSequence,
  padChordForStep,
  rhythmEventsForStep,
  secondaryPulseEventForStep,
  serviceEventForStep,
} from "./apu-sequencer.js";

const frame = {
  scoreState: "healthy",
  scale: [0, 2, 3, 5, 7, 8, 10, 12],
  voices: [
    {
      name: "atlas-systems",
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

test("phrase grid stays bounded and deterministic", () => {
  assert.equal(APU_PHRASE_STEPS, 32);
  assert.deepEqual(rhythmEventsForStep("healthy", 0), rhythmEventsForStep("healthy", 32));
  assert.ok(rhythmEventsForStep("critical", 14).kick);
  assert.equal(rhythmEventsForStep("unknown", 1).kick, null);
});

test("bass and pad events remain inside useful registers", () => {
  const bass = bassEventForStep(frame, { motifVariant: 0 }, 0, 0);
  const pad = padChordForStep(frame, null, 0, 0);
  assert.ok(bass.midi >= 27 && bass.midi <= 48);
  assert.ok(pad.midis.every((midi) => midi >= 45 && midi <= 72));
  assert.equal(bassEventForStep(frame, null, 1, 0), null);
  assert.equal(padChordForStep(frame, null, 1, 0), null);
});

test("secondary and service events are stable", () => {
  const secondary = secondaryPulseEventForStep(frame, { motifVariant: 1 }, 4, 0);
  const service = serviceEventForStep(frame, 2, 0);
  assert.ok(secondary);
  assert.equal(service.voice.name, "atlas-systems");
  assert.equal(service.identity.channel, "pulse-a");
  assert.deepEqual(serviceEventForStep(frame, 2, 0), service);
});

test("deployment and incident cues are bounded generated phrases", () => {
  const first = deploymentSequence(frame, "abc123");
  const second = deploymentSequence(frame, "abc123");
  assert.deepEqual(first, second);
  assert.equal(first.length, 6);
  assert.equal(incidentSequence(frame, 99).length, 8);
  assert.ok(first.every((event) => event.midi >= 60 && event.midi <= 88));
});
