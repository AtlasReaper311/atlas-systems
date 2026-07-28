import assert from "node:assert/strict";
import test from "node:test";

import {
  APU_TRANSITION_LANGUAGE_BUILD_ID,
  APU_TRANSITION_STATES,
  APU_TRANSITIONS,
  transitionDurationSeconds,
  transitionForStates,
  transitionPhaseForStates,
} from "./apu-transition-language.js";
import {
  APU_TRANSITION_EVENTS_BUILD_ID,
  transitionEventForTrackStep,
  transitionEventsMetadata,
} from "./apu-transition-events.js";

const frame = Object.freeze({
  scoreState: "healthy",
  scale: Object.freeze([0, 2, 3, 5, 7, 9, 10]),
});

const arrangement = Object.freeze({
  harmony: Object.freeze([
    Object.freeze({ rootDegree: 0, quality: "minor", inversion: 0 }),
    Object.freeze({ rootDegree: 4, quality: "wide", inversion: 0 }),
  ]),
});

const orderedPairs = APU_TRANSITION_STATES.flatMap((from) => (
  APU_TRANSITION_STATES
    .filter((to) => to !== from)
    .map((to) => [from, to])
));

test("the canonical language defines all twelve ordered transitions", () => {
  assert.match(APU_TRANSITION_LANGUAGE_BUILD_ID, /transition-language-v1$/);
  assert.equal(Object.keys(APU_TRANSITIONS).length, 12);
  assert.equal(orderedPairs.length, 12);

  for (const [from, to] of orderedPairs) {
    const plan = transitionForStates(from, to);
    assert.equal(plan.key, `${from}>${to}`);
    assert.notEqual(plan.id, "steady-state");
    assert.equal(plan.durationBars, 1);
    assert.equal(plan.durationSteps, 16);
    assert.equal(plan.mixPolicy, "composed-handover");
    assert.equal(plan.outgoingTail, "preserve");
    assert.equal(plan.harmonicAuthority, "destination");
    assert.ok(plan.phase);
    assert.ok(plan.gesture.length > 20);
    assert.equal(transitionDurationSeconds(from, to, 100), 2.4);
    assert.equal(transitionPhaseForStates(from, to), plan.phase);
  }
});

test("the formerly ambiguous transitions now have explicit musical identities", () => {
  assert.equal(transitionForStates("unknown", "critical").id, "carrier-interrupt");
  assert.equal(transitionForStates("warning", "healthy").id, "recovery-bloom");
  assert.equal(transitionForStates("critical", "warning").id, "pressure-release");
  assert.equal(transitionForStates("critical", "unknown").id, "alarm-dropout");
  assert.equal(transitionForStates("unknown", "warning").id, "carrier-resolve-pressure");
});

test("steady frames hold their movement instead of inventing a transition", () => {
  const first = transitionForStates(null, "healthy");
  const steady = transitionForStates("healthy", "healthy");
  assert.equal(first.id, "steady-state");
  assert.equal(steady.id, "steady-state");
  assert.equal(first.durationSteps, 0);
  assert.equal(steady.mixPolicy, "hold");
});

test("every ordered transition produces a bounded one-bar audible gesture", () => {
  assert.match(APU_TRANSITION_EVENTS_BUILD_ID, /transition-events-v1$/);
  assert.equal(transitionEventsMetadata().languageBuildId, APU_TRANSITION_LANGUAGE_BUILD_ID);

  const start = 100;
  for (const [from, to] of orderedPairs) {
    const events = Array.from({ length: 16 }, (_, delta) => transitionEventForTrackStep(
      { ...frame, scoreState: to },
      arrangement,
      delta,
      { from, to, stepIndex: start },
      start + delta,
    )).filter(Boolean);

    assert.ok(events.length > 0, `${from}>${to} should create an audible handover`);
    for (const event of events) {
      assert.equal(event.type, transitionForStates(from, to).id);
      for (const note of event.notes ?? []) {
        assert.ok(note.midi >= 36 && note.midi <= 88);
        assert.ok(note.velocity >= 0.04 && note.velocity <= 0.46);
      }
      if (event.noise) assert.ok(event.noise.velocity >= 0.04 && event.noise.velocity <= 0.24);
      if (event.bassDrop) assert.ok(event.bassDrop.velocity <= 0.3);
    }

    assert.equal(
      transitionEventForTrackStep(
        { ...frame, scoreState: to },
        arrangement,
        16,
        { from, to, stepIndex: start },
        start + 16,
      ),
      null,
      `${from}>${to} must finish at the one-bar boundary`,
    );
  }
});

test("Boss arrival stays forceful without requiring a hard bus choke", () => {
  const start = 200;
  for (const from of ["healthy", "warning", "unknown"]) {
    const event = transitionEventForTrackStep(
      { ...frame, scoreState: "critical", scale: [0, 1, 4, 5, 7, 8, 10] },
      arrangement,
      0,
      { from, to: "critical", stepIndex: start },
      start,
    );
    assert.ok(event);
    assert.ok(["interrupt-drop", "carrier-interrupt"].includes(event.type));
    assert.ok(event.bassDrop);
    assert.ok(event.noise);
  }
});
