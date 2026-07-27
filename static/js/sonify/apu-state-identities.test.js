import assert from "node:assert/strict";
import test from "node:test";

import { arrangementForPhrase } from "./apu-arranger.js";
import {
  APU_STATE_IDENTITIES,
  deterministicEventHash,
  shouldOmitEvent,
  stateMixModifiers,
  statePatternGrammar,
} from "./apu-state-identities.js";
import {
  bassEventForTrackStep,
  padChordForTrackStep,
  primaryPulseEventForTrackStep,
  rhythmEventsForTrackStep,
} from "./apu-track-sequencer.js";

const plan = Object.freeze({
  phase: "develop",
  targetBpm: 100,
  energy: 0.55,
  intent: Object.freeze({ pressure: 0.5, confidence: 0.9, intensity: 0.55 }),
});

function frameFor(state) {
  return Object.freeze({
    scoreState: state,
    bpm: 100,
    scale: APU_STATE_IDENTITIES[state].scale,
    voices: Object.freeze([]),
  });
}

function eventSignature(state, phrase = 3) {
  const frame = frameFor(state);
  const arrangement = arrangementForPhrase(frame, plan, phrase);
  return Array.from({ length: 32 }, (_, step) => {
    const rhythm = rhythmEventsForTrackStep(frame, arrangement, step);
    return [
      primaryPulseEventForTrackStep(frame, arrangement, step) ? "L" : ".",
      bassEventForTrackStep(frame, arrangement, step) ? "B" : ".",
      rhythm.kick ? "K" : ".",
      rhythm.snare ? "S" : ".",
      rhythm.hat ? "H" : ".",
      rhythm.noiseAccent ? "N" : ".",
    ].join("");
  }).join("|");
}

test("state identities keep the six-role APU and fixed transport contract", () => {
  for (const identity of Object.values(APU_STATE_IDENTITIES)) {
    assert.equal(typeof identity.padRole, "string");
    assert.equal(typeof identity.accentRole, "string");
    assert.ok(identity.omissionThreshold >= 0 && identity.omissionThreshold <= 0.5);
    assert.equal(arrangementForPhrase(frameFor(identity.id), plan, 3).targetBpm, 100);
  }
});

test("each state selects a distinct arrangement grammar", () => {
  const grammars = Object.fromEntries(Object.keys(APU_STATE_IDENTITIES).map((state) => [state, statePatternGrammar(state, "theme-a")]));
  assert.equal(new Set(Object.values(grammars).map((grammar) => JSON.stringify(grammar))).size, 4);
});

test("same phrase produces four distinct event maps", () => {
  const signatures = Object.keys(APU_STATE_IDENTITIES).map((state) => eventSignature(state));
  assert.equal(new Set(signatures).size, 4);
});

test("critical repurposes the pad role while unknown retains carrier harmony", () => {
  const criticalFrame = frameFor("critical");
  const critical = arrangementForPhrase(criticalFrame, plan, 3);
  assert.equal(padChordForTrackStep(criticalFrame, critical, 0), null);
  assert.equal(critical.stateIdentity.padRole, "sub-bass-layer");

  const unknownFrame = frameFor("unknown");
  const unknown = arrangementForPhrase(unknownFrame, plan, 3);
  assert.ok(padChordForTrackStep(unknownFrame, unknown, 0));
  assert.equal(unknown.stateIdentity.padRole, "carrier-drift");
});

test("omission decisions are deterministic and state-sensitive", () => {
  const context = Object.freeze({ barIndex: 7, stepIndex: 11, serviceHash: 311, phraseIndex: 3 });
  const first = deterministicEventHash({ ...context, state: "warning" });
  const second = deterministicEventHash({ ...context, state: "warning" });
  assert.equal(first, second);
  assert.equal(shouldOmitEvent({ ...context, state: "warning" }), shouldOmitEvent({ ...context, state: "warning" }));
  assert.notEqual(deterministicEventHash({ ...context, state: "healthy" }), first);
});

test("state envelope and duty-cycle contracts remain measurably different", () => {
  assert.equal(APU_STATE_IDENTITIES.healthy.primaryDutyCycle, 0.5);
  assert.equal(APU_STATE_IDENTITIES.warning.primaryDutyCycle, 0.125);
  assert.equal(APU_STATE_IDENTITIES.critical.transitionPolicy, "hard-choke");
  assert.equal(APU_STATE_IDENTITIES.unknown.transitionPolicy, "one-bar-decay");
  assert.equal(APU_STATE_IDENTITIES.unknown.masterGainDb, APU_STATE_IDENTITIES.healthy.masterGainDb);
  assert.ok(APU_STATE_IDENTITIES.unknown.omissionThreshold > APU_STATE_IDENTITIES.warning.omissionThreshold);
  assert.ok(APU_STATE_IDENTITIES.unknown.omissionThreshold < 0.4);
  assert.ok(APU_STATE_IDENTITIES.unknown.dynamicRangeDb > APU_STATE_IDENTITIES.healthy.dynamicRangeDb);
  assert.equal(APU_STATE_IDENTITIES.unknown.leadGate, "2n");
});

test("Lost Signal remains restrained but no longer falls below its audible floors", () => {
  const mix = stateMixModifiers("unknown");
  assert.ok(mix.primary >= 0.6);
  assert.ok(mix.secondary >= 0.45);
  assert.ok(mix.services >= 0.5);
  assert.ok(mix.bass >= 0.5);
  assert.ok(mix.drums >= 0.3);
  assert.equal(mix.pad, 1.18);
});
