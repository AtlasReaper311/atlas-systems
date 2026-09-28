import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  AUDIO_RUNTIME_STATUSES,
  buildAudioRuntimeEvidence,
  classifyAudioRuntime,
} from "../../scripts/interface-evidence/audio-capability.mjs";

const runner = readFileSync("scripts/capture_recorded_replay_evidence.mjs", "utf8");
const helper = readFileSync("scripts/interface-evidence/audio-capability.mjs", "utf8");

test("a replay context that reaches running is audio runtime pass", () => {
  assert.equal(classifyAudioRuntime({
    replayPostConsentState: "running",
    environmentProbe: { capability: "unavailable" },
  }), "pass");
});

test("a suspended replay with an independently running probe is a product failure", () => {
  assert.equal(classifyAudioRuntime({
    replayPostConsentState: "suspended",
    environmentProbe: { capability: "available", finalState: "running" },
  }), "fail");
});

test("a suspended replay with an unavailable independent probe is capability-unavailable", () => {
  assert.equal(classifyAudioRuntime({
    replayPostConsentState: "suspended",
    environmentProbe: {
      apiPresent: true,
      initialState: "suspended",
      resumeAttempted: true,
      resumePromiseOutcome: "timeout",
      finalState: "suspended",
      capability: "unavailable",
      error: "AudioContext.resume() did not settle before the probe timeout",
    },
  }), "capability-unavailable");
});

test("capability-unavailable is preserved and is never serialized as audio pass", () => {
  const evidence = buildAudioRuntimeEvidence({
    replayInitialState: null,
    replayPostConsentState: "suspended",
    environmentProbe: { capability: "unavailable", finalState: "suspended" },
  });
  assert.deepEqual(evidence.status, "capability-unavailable");
  assert.equal(evidence.audioPlaybackObserved, false);
  assert.equal(JSON.parse(JSON.stringify(evidence)).status, "capability-unavailable");
  assert.deepEqual(AUDIO_RUNTIME_STATUSES, ["pass", "capability-unavailable", "fail"]);
});

test("Firefox continues with non-audio assertions after classification", () => {
  assert.match(runner, /buildAudioRuntimeEvidence/);
  assert.match(runner, /result\.audioRuntime = audioRuntime/);
  assert.ok(runner.indexOf("result.audioRuntime = audioRuntime") < runner.indexOf('await page.locator("[data-recorded-replay-play]")'));
  assert.match(runner, /data-recorded-replay-reset/);
  assert.match(runner, /Play did not start while the audio runtime was available/);
  assert.match(runner, /ArrowRight/);
  assert.match(runner, /ArrowLeft/);
});

test("non-audio, accessibility, request, response, and overflow failures remain blocking", () => {
  for (const phrase of [
    "automatic playback stopped before the second event",
    "Pause did not stop playback",
    "Reset did not stop playback",
    "Atlas-owned accessibility blockers",
    "page errors",
    "failed first-party requests",
    "first-party HTTP errors",
    "horizontal overflow",
  ]) assert.match(runner, new RegExp(phrase.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&")), phrase);
});

test("Chromium audio running remains mandatory while browser name does not grant an exception", () => {
  assert.match(runner, /browserName === "chrome"/);
  assert.equal(classifyAudioRuntime({
    browserName: "firefox",
    replayPostConsentState: "suspended",
    environmentProbe: { capability: "available" },
  }), "fail");
  assert.equal(classifyAudioRuntime({
    browserName: "chrome",
    replayPostConsentState: "suspended",
    environmentProbe: { capability: "unavailable" },
  }), "capability-unavailable");
});

test("the independent probe is test-owned and does not call replay functions", () => {
  assert.match(helper, /data-atlas-audio-capability-probe/);
  assert.match(helper, /new AudioContextClass/);
  assert.match(helper, /resumePromiseOutcome/);
  assert.match(helper, /context\.close\(\)/);
  assert.doesNotMatch(helper, /data-recorded-replay|ensureAudio|startAudio/);
});
