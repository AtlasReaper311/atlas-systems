import assert from "node:assert/strict";
import test from "node:test";

import {
  APU_REPLAY_SONG_BUILD_ID,
  createReplaySongCursor,
  createReplaySongPlan,
  performancePlanForReplayMovement,
  replayFrameForMovement,
} from "./apu-replay-song.js";

test("build id identifies the executable replay plan", () => assert.match(APU_REPLAY_SONG_BUILD_ID, /v3$/));

test("critical evidence without recovery never invents recovery or resolution", () => {
  const plan = createReplaySongPlan({ id: "critical-only", sourceLabel: "fixture", stateSpans: [{ state: "critical", durationMs: 20000 }] });
  const kinds = plan.movements.map((movement) => movement.kind);
  assert.ok(kinds.includes("failure"));
  assert.ok(!kinds.includes("recovery"));
  assert.ok(!kinds.includes("resolved"));
  assert.ok(plan.warnings.some((warning) => warning.includes("mid-critical")));
});

test("ordered evidence remains ordered", () => {
  const plan = createReplaySongPlan({
    id: "journey",
    stateSpans: [
      { state: "healthy", durationMs: 8000 },
      { state: "warning", durationMs: 16000 },
      { state: "critical", durationMs: 24000 },
      { state: "healthy", durationMs: 16000 },
    ],
  });
  const evidence = plan.movements.filter((movement) => movement.fromEvidence).map((movement) => movement.state);
  assert.deepEqual(evidence, ["healthy", "warning", "critical", "healthy"]);
});

test("cursor advances and seeks in bars", () => {
  const plan = createReplaySongPlan({ id: "bars", stateSpans: [{ state: "healthy", durationMs: 16000 }] });
  const cursor = createReplaySongCursor(plan);
  assert.equal(cursor.getBar(), 0);
  cursor.advance(1);
  assert.equal(cursor.getBar(), 1);
  cursor.seek(0);
  assert.equal(cursor.getBar(), 0);
});

test("movement overlays the score frame without changing the base object", () => {
  const base = Object.freeze({ scoreState: "healthy", services: Object.freeze([]) });
  const movement = Object.freeze({ kind: "failure", state: "critical", phase: "rupture", label: "failure", fromEvidence: true });
  const replay = replayFrameForMovement(base, movement, "fixture");
  assert.equal(base.scoreState, "healthy");
  assert.equal(replay.scoreState, "critical");
  assert.equal(replay.replayMovement.fromEvidence, true);
  assert.equal(replay.replayBaseFrame, base);
});

test("movement controls actual performance phase values", () => {
  const movement = Object.freeze({ kind: "failure", state: "critical", phase: "rupture", fromEvidence: true });
  const plan = performancePlanForReplayMovement({ phase: "intro", ornaments: [] }, movement);
  assert.equal(plan.phase, "rupture");
  assert.equal(plan.density, 1);
  assert.equal(plan.silenceBudget, 0.1);
});

test("identical replay evidence is deterministic", () => {
  const incident = { id: "same", sourceLabel: "fixture", stateSpans: [{ state: "warning", durationMs: 12345 }] };
  assert.deepEqual(createReplaySongPlan(incident), createReplaySongPlan(incident));
});

test("missing evidence remains unknown", () => {
  const plan = createReplaySongPlan({ id: "missing", sourceLabel: "fixture" });
  const evidence = plan.movements.filter((movement) => movement.kind === "unknown");
  assert.equal(evidence.length, 1);
  assert.equal(evidence[0].state, "unknown");
});
