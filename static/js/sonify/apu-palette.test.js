import assert from "node:assert/strict";
import test from "node:test";

import {
  APU_CHANNELS,
  ATLAS_APU_BUILD_ID,
  channelSummary,
  chipIdentityForVoice,
  sceneForFrame,
  stateProfile,
} from "./apu-palette.js";

test("Atlas APU build and state profiles are explicit", () => {
  assert.match(ATLAS_APU_BUILD_ID, /atlas-apu-preview-v1$/);
  assert.equal(stateProfile("healthy").label, "Explorer");
  assert.equal(stateProfile("critical").label, "Boss Protocol");
  assert.equal(stateProfile("missing").label, "Lost Signal");
});

test("service chip identity is deterministic and bounded", () => {
  const voice = { layer: "public-api", hash: 0x12345678, pan: 0.7, status: "healthy", measured: true };
  const first = chipIdentityForVoice(voice);
  const second = chipIdentityForVoice(voice);
  assert.deepEqual(first, second);
  assert.equal(first.channel, APU_CHANNELS.pulseB);
  assert.ok(first.pan <= 0.78);
  assert.ok(first.pan >= -0.78);
  assert.ok([0.125, 0.25, 0.5].includes(first.dutyCycle));
});

test("scene generation preserves bounded score intent", () => {
  const scene = sceneForFrame({
    scoreState: "warning",
    bpm: 100,
    density: 0.8,
    tension: 0.44,
    masterGainDb: -7,
    masterFilterHz: 10000,
    masterHpHz: 32,
  }, {
    phase: "intensify",
    energy: 0.7,
    targetBpm: 100,
    intent: { pressure: 0.6, confidence: 0.8 },
  });
  assert.equal(scene.scoreState, "warning");
  assert.equal(scene.phase, "intensify");
  assert.equal(scene.bpm, 100);
  assert.equal(scene.profile.crusherBits, 10);
});

test("channel summary keeps every APU channel visible", () => {
  const summary = channelSummary({
    voices: [
      { layer: "surface", hash: 1 },
      { layer: "public-api", hash: 2 },
      { layer: "infra", hash: 3 },
      { layer: "local-ai", hash: 4 },
      { layer: "observability", hash: 5 },
    ],
  });
  assert.equal(summary[APU_CHANNELS.pulseA], 1);
  assert.equal(summary[APU_CHANNELS.pulseB], 1);
  assert.equal(summary[APU_CHANNELS.triangle], 1);
  assert.equal(summary[APU_CHANNELS.wavetable], 1);
  assert.equal(summary[APU_CHANNELS.noise], 1);
  assert.equal(summary[APU_CHANNELS.fmAccent], 0);
});
