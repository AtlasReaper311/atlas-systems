import assert from "node:assert/strict";
import test from "node:test";

import {
  APU_MIX_LISTENER_POLISH,
  mixDirectiveFor,
} from "./apu-mix-director.js";
import {
  shouldOmitForPhase,
  supplementalRhythmForDensity,
} from "./apu-performance-conductor.js";

const plan = (silenceBudget, density) => ({
  silenceBudget,
  density,
  ornaments: [],
  phase: "groove",
});

test("listener polish preserves rhythm, bass, and pad anchors", () => {
  const sparse = plan(1, 0);
  for (const step of [0, 4, 8, 12, 16, 20, 24, 28]) {
    assert.equal(shouldOmitForPhase({ perfPlan: sparse, category: "rhythm", stepIndex: step, phraseIndex: 2 }), false);
  }
  for (const step of [0, 8, 16, 24]) {
    assert.equal(shouldOmitForPhase({ perfPlan: sparse, category: "bass", stepIndex: step, phraseIndex: 2 }), false);
  }
  for (const step of [0, 16]) {
    assert.equal(shouldOmitForPhase({ perfPlan: sparse, category: "pad", stepIndex: step, phraseIndex: 2 }), false);
  }
});

test("listener polish adds bounded connective hats at moderate density", () => {
  const events = supplementalRhythmForDensity(plan(0, 0.5), 2, 0);
  assert.equal(events.length, 1);
  assert.equal(events[0].voice, "hat");
  assert.ok(events[0].velocity <= 0.5);
});

test("listener polish trims bass and strengthens kick separation", () => {
  assert.ok(Object.isFrozen(APU_MIX_LISTENER_POLISH));
  assert.ok(APU_MIX_LISTENER_POLISH.bassGainMul < 1);
  assert.ok(APU_MIX_LISTENER_POLISH.criticalBassGainMul < 1);
  assert.ok(APU_MIX_LISTENER_POLISH.kickBassDuckDepthMul > 1);

  const healthy = mixDirectiveFor({ state: "healthy", phase: "groove" });
  const warning = mixDirectiveFor({ state: "warning", phase: "groove" });
  const critical = mixDirectiveFor({ state: "critical", phase: "groove" });
  assert.equal(healthy.buses.bass.gainMul, APU_MIX_LISTENER_POLISH.bassGainMul);
  assert.ok(critical.buses.bass.gainMul < warning.buses.bass.gainMul);
  const kickBass = critical.ducking.find((rule) => rule.source === "kick" && rule.target === "bass");
  assert.ok(kickBass.depthDb > 3.2);
});
