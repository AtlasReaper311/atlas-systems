import assert from "node:assert/strict";
import test from "node:test";

import {
  APU_STATE_ORCHESTRATION_D1A_BUILD_ID,
  describeD1AStateOrchestration,
  stateArpeggioInstructionsForPhrase,
  stateFeatureInstructionsForPhrase,
} from "./apu-state-orchestration-d1a.js";
import { APU_MIX_DIRECTOR_BUILD_ID, mixDirectiveFor } from "./apu-mix-director.js";
import { ornamentInstructionsForPhrase } from "./apu-performance-conductor.js";

const plan = (state, phraseIndex = 0, phase = "groove") => ({
  state,
  phraseIndex,
  phase,
  bars: phraseIndex * 2,
  density: 0.72,
  silenceBudget: 0.2,
  ornaments: [],
});

test("D1A module remains explicit and independently deterministic", () => {
  assert.match(APU_STATE_ORCHESTRATION_D1A_BUILD_ID, /pass-d1a/);
  const signatures = new Set();
  for (const state of ["healthy", "warning", "critical", "unknown"]) {
    const first = stateArpeggioInstructionsForPhrase(plan(state, 3));
    const second = stateArpeggioInstructionsForPhrase(plan(state, 3));
    assert.deepEqual(first, second);
    assert.ok(first.length >= 4, state);
    assert.ok(Object.isFrozen(first));
    assert.ok(first.every(Object.isFrozen));
    assert.ok(first.every((event) => event.offsetSteps >= 0 && event.offsetSteps < 32));
    assert.ok(first.every((event) => event.velocity >= 0.1 && event.velocity <= 0.3));
    signatures.add(JSON.stringify(first.map((event) => [event.offsetSteps, event.midiOffset])));
  }
  assert.equal(signatures.size, 4);
});

test("D1A state treatments remain available for later comparison", () => {
  const explorer = stateArpeggioInstructionsForPhrase(plan("healthy", 0));
  const grid = stateArpeggioInstructionsForPhrase(plan("warning", 0));
  const boss = stateFeatureInstructionsForPhrase(plan("critical", 0, "rupture"));
  const lost = stateFeatureInstructionsForPhrase(plan("unknown", 2));

  assert.ok(explorer.length > lost.filter((event) => event.ornament === "state-arp").length);
  assert.notEqual(grid.at(-1).midiOffset, 0);
  assert.equal(boss.filter((event) => event.ornament === "boss-power-chord").length, 4);
  assert.equal(lost.filter((event) => event.ornament === "lost-signal-echo").length, 2);
  assert.match(describeD1AStateOrchestration(plan("unknown", 0)), /Lost Signal/);
});

test("Candidate A restores the Pass C connector without scheduling D1A material", () => {
  for (const state of ["healthy", "warning", "critical", "unknown"]) {
    const instructions = ornamentInstructionsForPhrase(plan(state, 4));
    assert.ok(instructions.some((event) => event.ornament === "connective-arp"), state);
    assert.equal(instructions.some((event) => event.ornament === "state-arp"), false, state);
    assert.equal(instructions.some((event) => event.ornament === "boss-power-chord"), false, state);
    assert.equal(instructions.some((event) => event.ornament === "lost-signal-echo"), false, state);
  }
});

test("Candidate A restores the more modest Pass C Boss mix", () => {
  assert.match(APU_MIX_DIRECTOR_BUILD_ID, /v3$/);
  const explorer = mixDirectiveFor({ state: "healthy", phase: "groove" });
  const boss = mixDirectiveFor({ state: "critical", phase: "groove" });
  assert.ok(boss.buses.bass.gainMul < explorer.buses.bass.gainMul);
  assert.ok(boss.buses.bass.gainMul > explorer.buses.bass.gainMul * 0.85);
  assert.ok(boss.buses.pad.gainMul < explorer.buses.pad.gainMul);
  assert.ok(boss.buses.pad.gainMul > explorer.buses.pad.gainMul * 0.75);
  assert.ok(boss.buses.primary.gainMul > explorer.buses.primary.gainMul);
  assert.ok(boss.buses.secondary.gainMul > explorer.buses.secondary.gainMul);
});

test("Lost Signal remains voice-led rather than pad-dominant", () => {
  const lost = mixDirectiveFor({ state: "unknown", phase: "groove" });
  assert.ok(lost.buses.primary.gainMul > lost.buses.pad.gainMul);
  assert.ok(lost.buses.secondary.gainMul > lost.buses.pad.gainMul);
});
