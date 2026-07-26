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
  assert.match(ATLAS_APU_TRACK_BUILD_ID, /atlas-chip-laws-v1$/);
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

test("arrangement moves through every section and loops deterministically", () => {
  const sections = Array.from({ length: APU_TRACK_PHRASES }, (_, phrase) => (
    arrangementForPhrase(frame, directorPlan, phrase).section
  ));
  assert.deepEqual(sections, [
    "intro",
    "establish",
    "establish",
    "theme-a",
    "theme-a",
    "variation",
    "variation",
    "theme-b",
    "theme-b",
    "build",
    "build",
    "peak",
    "peak",
    "release",
    "recovery",
    "breathe",
  ]);
  const looped = arrangementForPhrase(frame, directorPlan, 16);
  assert.equal(looped.section, "intro");
  assert.equal(looped.cycleNumber, 1);
});

test("motif identity remains recognisable between paired phrases", () => {
  const themeA1 = arrangementForPhrase(frame, directorPlan, 3);
  const themeA2 = arrangementForPhrase(frame, directorPlan, 4);
  assert.deepEqual(themeA1.motifDegrees.slice(0, 4), themeA2.motifDegrees.slice(0, 4));
  assert.equal(themeA2.motifDegrees.at(-1), 0);
  assert.notDeepEqual(themeA1.motifDegrees, arrangementForPhrase(frame, directorPlan, 5).motifDegrees);
});

test("section orchestration and timbre create real contrast", () => {
  const intro = arrangementForPhrase(frame, directorPlan, 0);
  const theme = arrangementForPhrase(frame, directorPlan, 3);
  const peak = arrangementForPhrase(frame, directorPlan, 11);
  const release = arrangementForPhrase(frame, directorPlan, 13);
  assert.equal(intro.mix.drums, 0);
  assert.equal(intro.mix.bass, 0);
  assert.ok(theme.timbre.leadCutoffHz > intro.timbre.leadCutoffHz);
  assert.ok(peak.mix.drums > 0.9);
  assert.ok(peak.mix.primary > 0.9);
  assert.ok(peak.timbre.counterCutoffHz > theme.timbre.counterCutoffHz);
  assert.ok(release.mix.pad > release.mix.drums);
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
  assert.equal(healthy.chipLaw, "explorer-counterpoint");
  assert.equal(warning.chipLaw, "diagnostic-stutter");
  assert.equal(critical.chipLaw, "boss-lockstep");
  assert.equal(unknown.chipLaw, "lost-signal-dropout");
});
