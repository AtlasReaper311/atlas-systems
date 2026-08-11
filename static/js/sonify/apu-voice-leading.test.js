import assert from "node:assert/strict";
import test from "node:test";
import { voiceLeadHarmony } from "./apu-voice-leading.js";

const scale = [0, 2, 3, 5, 7, 9, 10];

test("voice leading is deterministic, bounded and frozen", () => {
  const input = {
    previousVoicing: [48, 55, 60],
    targetHarmony: { rootDegree: 3, quality: "wide", inversion: 0 },
    state: "healthy",
    scale,
    registerBounds: { minimum: 48, maximum: 72 },
  };
  const first = voiceLeadHarmony(input);
  const second = voiceLeadHarmony(input);
  assert.deepEqual(first, second);
  assert.ok(first.midi.every((note) => note >= 48 && note <= 72));
  assert.equal(new Set(first.midi).size, first.midi.length);
  assert.ok(Object.isFrozen(first));
  assert.ok(Object.isFrozen(first.midi));
});

test("nearest motion retains permitted common tones", () => {
  const result = voiceLeadHarmony({
    previousVoicing: [48, 55, 60],
    targetHarmony: { rootDegree: 0, quality: "open", inversion: 0 },
    state: "healthy",
    scale,
    registerBounds: { minimum: 48, maximum: 72 },
  });
  assert.ok(result.commonTones.length >= 1);
});

test("Lost Signal uses bounded outer-tone voicing", () => {
  const result = voiceLeadHarmony({
    targetHarmony: { rootDegree: 3, quality: "suspended", inversion: 0 },
    state: "unknown",
    scale,
    registerBounds: { minimum: 45, maximum: 72 },
  });
  assert.equal(result.midi.length, 2);
  assert.ok(result.midi.every((note) => note >= 45 && note <= 72));
});
