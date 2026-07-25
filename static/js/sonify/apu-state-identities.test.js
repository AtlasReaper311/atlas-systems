import assert from "node:assert/strict";
import test from "node:test";

import {
  APU_STATE_IDENTITIES,
  ATLAS_APU_LOCKED_BPM,
  deterministicUnitInterval,
  logicalChannels,
  pitchIntentFor,
  shouldOmitEvent,
  stateIdentityFor,
  stateIdentitySignature,
  transitionPolicy,
} from "./apu-state-identities.js";

test("state identities preserve six logical channels and locked transport", () => {
  assert.equal(ATLAS_APU_LOCKED_BPM, 100);
  assert.deepEqual(logicalChannels(), [
    "lead",
    "counterline",
    "bass",
    "noise",
    "memory",
    "accent",
  ]);
});

test("all four states have materially distinct musical signatures", () => {
  const signatures = Object.keys(APU_STATE_IDENTITIES).map(stateIdentitySignature);
  assert.equal(new Set(signatures).size, 4);
  assert.equal(stateIdentityFor("healthy").mode, "F Dorian");
  assert.equal(stateIdentityFor("warning").mode, "F Phrygian");
  assert.equal(stateIdentityFor("critical").roles.memory, "repurposed-sub-bass-distortion");
  assert.equal(stateIdentityFor("unknown").roles.accent, "repurposed-low-level-telemetry-hum");
});

test("deterministic omissions never use runtime randomness", () => {
  const args = {
    state: "unknown",
    barIndex: 9,
    stepIndex: 14,
    serviceHash: 123456,
    lane: "service",
  };
  assert.equal(shouldOmitEvent(args), shouldOmitEvent(args));
  assert.equal(
    deterministicUnitInterval("unknown", 9, 14, 123456, "service"),
    deterministicUnitInterval("unknown", 9, 14, 123456, "service"),
  );
});

test("omission rates are ordered by state identity", () => {
  assert.ok(stateIdentityFor("healthy").omissionThreshold < stateIdentityFor("warning").omissionThreshold);
  assert.ok(stateIdentityFor("warning").omissionThreshold < stateIdentityFor("unknown").omissionThreshold);
  assert.ok(stateIdentityFor("critical").omissionThreshold < stateIdentityFor("warning").omissionThreshold);
});

test("chromatic intent is explicit and bounded", () => {
  assert.equal(pitchIntentFor({ state: "healthy", role: "lead", stepIndex: 6 }), "diatonic");
  assert.equal(pitchIntentFor({ state: "warning", role: "lead", stepIndex: 6 }), "approach");
  assert.equal(pitchIntentFor({ state: "critical", role: "counterline", stepIndex: 14 }), "alarm");
  assert.equal(pitchIntentFor({ state: "unknown", role: "memory", stepIndex: 0 }), "drift");
});

test("state transition policies encode choke and dissolve behaviour", () => {
  const critical = transitionPolicy("healthy", "critical");
  assert.equal(critical.mode, "hard-choke");
  assert.deepEqual(critical.chokeChannels, ["memory", "counterline"]);
  const unknown = transitionPolicy("warning", "unknown");
  assert.equal(unknown.mode, "one-bar-dissolve");
  assert.equal(unknown.durationSeconds, 2.4);
});
