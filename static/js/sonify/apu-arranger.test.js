import assert from "node:assert/strict";
import test from "node:test";

import {
  APU_FORM,
  APU_TRACK_BARS,
  APU_TRACK_PHRASES,
  ATLAS_APU_TRACK_BUILD_ID,
  arrangementForPhrase,
  arrangementTimeline,
} from "./apu-arranger.js";

const frame = {
  scoreState: "healthy",
  bpm: 100,
  tension: 0.25,
};

const directorPlan = {
  phase: "develop",
  targetBpm: 100,
  energy: 0.45,
  intent: {
    pressure: 0.3,
    confidence: 0.9,
    intensity: 0.42,
  },
};

test("Atlas APU track form is a complete 32-bar cycle", () => {
  assert.match(ATLAS_APU_TRACK_BUILD_ID, /atlas-apu-track-v1$/);
  assert.equal(APU_TRACK_PHRASES, 16);
  assert.equal(APU_TRACK_BARS, 32);
  assert.equal(APU_FORM.reduce((total, section) => total + section.phrases, 0), 16);
  const timeline = arrangementTimeline();
  assert.equal(timeline[0].startBar, 1);
  assert.equal(timeline.at(-1).endBar, 32);
  assert.deepEqual(timeline.map((section) => section.id), [
    "intro",
    "establish",
    "theme-a",
    "variation",
    "theme-b",
    "build",
    "peak",
    "release",
    "recovery",
    "breathe",
  ]);
});

test("arrangement moves through sections and loops deterministically", () => {
  const intro = arrangementForPhrase(frame, directorPlan, 0);
  const theme = arrangementForPhrase(frame, directorPlan, 3);
  const peak = arrangementForPhrase(frame, directorPlan, 11);
  const looped = arrangementForPhrase(frame, directorPlan, 16);
  assert.equal(intro.section, "intro");
  assert.equal(theme.section, "theme-a");
  assert.equal(peak.section, "peak");
  assert.equal(looped.section, "intro");
  assert.equal(looped.cycleNumber, 1);
  assert.deepEqual(arrangementForPhrase(frame, directorPlan, 11), peak);
});

test("section orchestration creates real contrast", () => {
  const intro = arrangementForPhrase(frame, directorPlan, 0);
  const peak = arrangementForPhrase(frame, directorPlan, 11);
  const release = arrangementForPhrase(frame, directorPlan, 13);
  assert.equal(intro.mix.drums, 0);
  assert.equal(intro.mix.bass, 0);
  assert.ok(peak.mix.drums > 0.9);
  assert.ok(peak.mix.primary > 0.9);
  assert.ok(release.mix.pad > release.mix.drums);
  assert.equal(peak.octaveBoost, true);
});

test("state changes reshape harmony without destroying form", () => {
  const healthy = arrangementForPhrase({ ...frame, scoreState: "healthy" }, directorPlan, 9);
  const warning = arrangementForPhrase({ ...frame, scoreState: "warning" }, directorPlan, 9);
  const critical = arrangementForPhrase({ ...frame, scoreState: "critical" }, directorPlan, 9);
  const unknown = arrangementForPhrase({ ...frame, scoreState: "unknown" }, directorPlan, 9);
  assert.equal(healthy.section, "build");
  assert.equal(warning.section, "build");
  assert.equal(critical.harmony[0].quality, "power");
  assert.equal(unknown.harmony[0].quality, "suspended");
  assert.ok(unknown.mix.drums < warning.mix.drums);
});
