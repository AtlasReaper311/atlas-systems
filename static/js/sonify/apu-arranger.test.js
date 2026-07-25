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

const directorPlan = {
  phase: "develop",
  targetBpm: 117,
  energy: 0.45,
  intent: {
    pressure: 0.3,
    confidence: 0.9,
    intensity: 0.42,
  },
};

function frame(scoreState) {
  return { scoreState, bpm: 128, tension: scoreState === "critical" ? 0.9 : 0.25 };
}

test("Atlas APU track form remains a complete 32-bar cycle", () => {
  assert.match(ATLAS_APU_TRACK_BUILD_ID, /state-identities-v1$/);
  assert.equal(APU_TRACK_PHRASES, 16);
  assert.equal(APU_TRACK_BARS, 32);
  assert.equal(APU_FORM.reduce((total, section) => total + section.phrases, 0), 16);
  const timeline = arrangementTimeline();
  assert.equal(timeline[0].startBar, 1);
  assert.equal(timeline.at(-1).endBar, 32);
});

test("transport remains locked to 100 BPM for every state", () => {
  for (const state of ["healthy", "warning", "critical", "unknown"]) {
    assert.equal(arrangementForPhrase(frame(state), directorPlan, 9).targetBpm, 100);
  }
});

test("state identity changes grammar without changing the section", () => {
  const arrangements = ["healthy", "warning", "critical", "unknown"].map((state) => (
    arrangementForPhrase(frame(state), directorPlan, 9)
  ));
  assert.ok(arrangements.every((arrangement) => arrangement.section === "build"));
  assert.equal(new Set(arrangements.map((arrangement) => arrangement.leadFamily)).size, 4);
  assert.equal(new Set(arrangements.map((arrangement) => arrangement.bassFamily)).size, 4);
  assert.equal(new Set(arrangements.map((arrangement) => arrangement.drumFamily)).size, 4);
  assert.equal(arrangements[2].harmony[0].quality, "power");
  assert.equal(arrangements[3].harmony[0].quality, "suspended");
});

test("critical reallocates memory and accent roles while unknown stays sparse", () => {
  const critical = arrangementForPhrase(frame("critical"), directorPlan, 11);
  const unknown = arrangementForPhrase(frame("unknown"), directorPlan, 11);
  assert.match(critical.stateIdentity.roles.memory, /sub-bass/);
  assert.match(critical.stateIdentity.roles.accent, /impact/);
  assert.match(unknown.stateIdentity.roles.memory, /carrier/);
  assert.ok(unknown.mix.drums < critical.mix.drums);
  assert.ok(unknown.serviceDensity < critical.serviceDensity);
});
