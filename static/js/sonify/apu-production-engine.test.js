import assert from "node:assert/strict";
import test from "node:test";

import {
  AUDIO_CONTEXT_BLOCKED_CODE,
  DEFAULT_USER_GAIN,
  SYSTEM_SYMPHONY_BUILD_ID,
  createEngine,
} from "./apu-production-engine.js";

test("production adapter exposes the established System Symphony engine contract", () => {
  const engine = createEngine();
  for (const method of [
    "start",
    "pause",
    "applyFrame",
    "setPerformance",
    "setScene",
    "setGhostFocus",
    "setGhostAudition",
    "queueIncidentAccent",
    "queueDeploymentMotif",
    "setUserVolume",
    "getWaveform",
    "getSpectrum",
    "isInitialized",
    "isRunning",
    "isSampleReady",
    "getSampleLoadStats",
    "getSamplePalette",
    "getCompositionSnapshot",
    "dispose",
  ]) {
    assert.equal(typeof engine[method], "function", `${method} is missing`);
  }
  assert.equal(engine.buildId, SYSTEM_SYMPHONY_BUILD_ID);
  assert.equal(engine.isSampleReady(), true);
  assert.equal(engine.getSampleLoadStats().sampleFree, true);
  assert.equal(engine.getSampleLoadStats().totalAssets, 0);
  engine.dispose();
});

test("production adapter keeps the approved first-listen and blocked-audio contracts", () => {
  assert.equal(DEFAULT_USER_GAIN, 0.62);
  assert.equal(AUDIO_CONTEXT_BLOCKED_CODE, "audio-context-blocked");
  assert.match(SYSTEM_SYMPHONY_BUILD_ID, /atlas-apu-live-v7$/);
});
