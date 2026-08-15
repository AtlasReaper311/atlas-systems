import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { SIGNALS, createFrame } from "../../static/js/spectral-forge/domain.js";
import {
  applyScenarioSelection,
  beginScenarioHandoff,
  scenarioFrameAt,
  scenarioHandoffWeight,
  TELEMETRY_HANDOFF_SECONDS,
} from "../../static/js/spectral-forge/spectral-field-scenario-clock.js";
import {
  createOrganismLifeClock,
  resetOrganismLifeClock,
  stepOrganismLifeClock,
} from "../../static/js/spectral-forge/spectral-field-life-clock.js";
import { FIELD_VISUAL_SEED } from "../../static/js/spectral-forge/spectral-field-model.js";
import {
  evaluateFission,
  iterateLifeEvents,
  livingGesture,
} from "../../static/js/spectral-forge/prototypes/field-proto-flagship-final-form-life.js";

const APP_CORE_URL = new URL("../../static/js/spectral-forge/app-core.js", import.meta.url);

function playingState(scenarioId = "normal", scenarioTime = 20) {
  return { scenarioId, playback: "PLAYING", scenarioTime };
}

test("scenario switch while playing does not stop transport", () => {
  const next = applyScenarioSelection(playingState("normal", 20), "cache");
  assert.equal(next.changed, true);
  assert.equal(next.playback, "PLAYING");
  assert.equal(next.startTimer, false);
  assert.equal(next.keepTimer, true);
  assert.equal(next.stopTimer, false);
  assert.equal(next.resetOrganism, false);
});

test("organism life time remains monotonic across a scenario switch", () => {
  const clock = createOrganismLifeClock();
  let timestamp = 1_000;
  for (let step = 0; step < 1_200; step += 1) {
    timestamp += 16;
    stepOrganismLifeClock(clock, timestamp, "PLAYING");
  }
  const before = clock.time;
  const decision = applyScenarioSelection(playingState("normal", 20), "cascade");
  assert.equal(decision.resetOrganism, false);
  assert.ok(before > 18, `life clock too small before switch (${before})`);
  stepOrganismLifeClock(clock, timestamp + 16, "PLAYING");
  stepOrganismLifeClock(clock, timestamp + 32, "PLAYING");
  assert.ok(clock.time > before);
});

test("new scenario-local time starts at zero", () => {
  const next = applyScenarioSelection(playingState("normal", 43), "cascade");
  assert.equal(next.scenarioTime, 0);
  assert.equal(next.scenarioId, "cascade");
  assert.notEqual(createFrame("cascade", 0).values.anomaly_score, createFrame("normal", 43).values.anomaly_score);
});

test("selected scenario changes", () => {
  const next = applyScenarioSelection(playingState("cache", 12), "cascade");
  assert.equal(next.scenarioId, "cascade");
  const same = applyScenarioSelection(playingState("cache", 12), "cache");
  assert.equal(same.changed, false);
  assert.equal(same.scenarioTime, 12);
});

test("scenario switch while HOLD resumes PLAYING", () => {
  const next = applyScenarioSelection({ scenarioId: "cascade", playback: "COMPLETE", scenarioTime: 60 }, "traffic");
  assert.equal(next.playback, "PLAYING");
  assert.equal(next.scenarioId, "traffic");
  assert.equal(next.scenarioTime, 0);
  assert.equal(next.resetOrganism, false);
  assert.equal(next.startTimer, true);
  assert.equal(next.handoff, true);
});

test("scenario switch while paused remains paused", () => {
  const next = applyScenarioSelection({ scenarioId: "normal", playback: "PAUSED", scenarioTime: 18 }, "flapping");
  assert.equal(next.playback, "PAUSED");
  assert.equal(next.scenarioId, "flapping");
  assert.equal(next.scenarioTime, 0);
  assert.equal(next.resetOrganism, false);
  assert.equal(next.startTimer, false);
  assert.equal(next.handoff, false);
});

test("an active stress fission survives a scenario switch", async () => {
  /* Separation is now owned by the material layer rather than scheduled by
   * lifetime, so continuity is asserted against a real cascade-driven event. */
  const { createPhysicalStateModel, stepPhysicalState } =
    await import("../../static/js/spectral-forge/spectral-field-physical-state.js");
  const { createPhysicalFissionState, stepPhysicalFission, readFissionEvidence } =
    await import("../../static/js/spectral-forge/prototypes/field-proto-flagship-final-form-physics.js");
  const { audibleOutputs, createComparisonState } =
    await import("../../static/js/spectral-forge/state.js");

  const comparison = createComparisonState();
  const physical = createPhysicalStateModel();
  const fission = createPhysicalFissionState();
  let life = 0;
  let live = null;
  let latest = null;

  for (let t = 0; t <= 60; t += 0.05) {
    const frame = scenarioFrameAt("cascade", t, null);
    life += 0.05;
    const snapshot = stepPhysicalState(physical, { frame, outputs: audibleOutputs(frame, comparison), lifeTime: life });
    latest = readFissionEvidence(stepPhysicalFission(fission, { physical: snapshot, lifeTime: life, seedPhase: 2.4 }));
    live = frame;
  }
  assert.equal(latest.active, true, "cascade did not leave an active separation to carry across");
  const progressBefore = latest.progress;
  const countBefore = latest.count;

  const handoff = beginScenarioHandoff(live, "deploy");
  const frame = scenarioFrameAt("deploy", 0, handoff);
  life += 0.05;
  const snapshot = stepPhysicalState(physical, { frame, outputs: audibleOutputs(frame, comparison), lifeTime: life });
  const after = readFissionEvidence(stepPhysicalFission(fission, { physical: snapshot, lifeTime: life, seedPhase: 2.4 }));

  assert.equal(after.active, true, "scenario switch despawned the active daughter");
  assert.equal(after.count, countBefore, "scenario switch changed the daughter count");
  assert.ok(after.progress >= progressBefore, "scenario switch restarted the separation");
});

test("audio and mode continuity survive scenario switch", async () => {
  const app = await readFile(APP_CORE_URL, "utf8");
  const select = app.slice(app.indexOf("function selectScenario"), app.indexOf("function stepScenario"));
  assert.doesNotMatch(select, /audioEngine\?\.safeReset/);
  assert.doesNotMatch(select, /resetOrganismLifeClock/);
  assert.match(app, /fieldVisible: depth === "PLAY"/);
  assert.match(app, /fieldVisible: depth === "FORGE"/);
  assert.match(app, /fieldVisible: depth === "ANALYSE"/);
  // One continuous telemetry frame is built by the scenario clock and consumed
  // everywhere, rather than each surface resolving its own version.
  assert.match(app, /scenarioFrameAt\(scenarioId, time, scenarioHandoff\)/);
  assert.doesNotMatch(app, /resolveScenarioFrame/);
  const playing = applyScenarioSelection(playingState("normal", 20), "cache");
  const forge = applyScenarioSelection({ ...playing, playback: "PLAYING" }, "cascade");
  assert.equal(forge.playback, "PLAYING");
  assert.equal(forge.resetOrganism, false);
});

test("next/previous arrows use the same scenario-selection semantics", async () => {
  const app = await readFile(APP_CORE_URL, "utf8");
  const step = app.slice(app.indexOf("function stepScenario"), app.indexOf("async function enableAudio"));
  assert.match(step, /selectScenario\(SCENARIOS\[index\]\.id\)/);
  assert.doesNotMatch(step, /resetScenario/);
});

test("reset/replay remain explicit full resets", () => {
  const clock = createOrganismLifeClock();
  let timestamp = 1_000;
  for (let step = 0; step < 500; step += 1) {
    timestamp += 16;
    stepOrganismLifeClock(clock, timestamp, "PLAYING");
  }
  const decision = applyScenarioSelection(playingState("normal", 20), "traffic");
  assert.equal(decision.resetOrganism, false);
  assert.ok(clock.time > 7);
  resetOrganismLifeClock(clock);
  assert.equal(clock.time, 0);
});

test("telemetry continues from the live signal state instead of resetting to baseline", () => {
  assert.ok(
    TELEMETRY_HANDOFF_SECONDS >= 3 && TELEMETRY_HANDOFF_SECONDS <= 6,
    `handoff must span 3-6s, got ${TELEMETRY_HANDOFF_SECONDS}`,
  );

  /* Materially different conditions in both directions. Asserting scenarioTime
   * is zero proves nothing; the first post-switch frame has to be measured
   * against the previous live frame. */
  const transitions = [
    ["flapping", 30, "traffic"],
    ["cascade", 50, "deploy"],
    ["cache", 35, "creep"],
    ["cascade", 55, "normal"],
    ["creep", 55, "cache"],
    ["deploy", 25, "cascade"],
  ];

  for (const [fromId, atTime, toId] of transitions) {
    const live = scenarioFrameAt(fromId, atTime, null);
    const naive = createFrame(toId, 0);
    const handoff = beginScenarioHandoff(live, toId);
    assert.ok(handoff, `${fromId}->${toId} produced no handoff`);

    const continued = scenarioFrameAt(toId, 0, handoff);
    let naiveJump = 0;
    let continuedJump = 0;
    for (const signal of SIGNALS) {
      naiveJump = Math.max(naiveJump, Math.abs(naive.normalised[signal.id] - live.normalised[signal.id]));
      continuedJump = Math.max(continuedJump, Math.abs(continued.normalised[signal.id] - live.normalised[signal.id]));
    }

    assert.ok(naiveJump > 0.2, `${fromId}->${toId} is not a materially different condition`);
    assert.ok(
      continuedJump < 1e-9,
      `${fromId}->${toId} reset telemetry to the new scenario baseline (jump ${continuedJump.toFixed(3)})`,
    );

    /* The new scenario must then take full ownership of its own trajectory. */
    const settled = scenarioFrameAt(toId, TELEMETRY_HANDOFF_SECONDS + 0.5, handoff);
    const native = createFrame(toId, TELEMETRY_HANDOFF_SECONDS + 0.5);
    for (const signal of SIGNALS) {
      assert.equal(
        settled.values[signal.id],
        native.values[signal.id],
        `${fromId}->${toId} never handed ${signal.id} back to the new scenario`,
      );
    }

    /* And it must get there smoothly rather than in one step. */
    let previous = continued;
    for (let t = 0.1; t <= TELEMETRY_HANDOFF_SECONDS; t += 0.1) {
      const current = scenarioFrameAt(toId, t, handoff);
      for (const signal of SIGNALS) {
        const span = signal.max - signal.min;
        const delta = Math.abs(current.normalised[signal.id] - previous.normalised[signal.id]);
        assert.ok(
          delta < 0.14,
          `${fromId}->${toId} ${signal.id} jumped ${delta.toFixed(3)} of range ${span} at t=${t.toFixed(1)}`,
        );
      }
      previous = current;
    }
  }
});

test("handoff weight decays monotonically and is bounded", () => {
  const handoff = beginScenarioHandoff(createFrame("cascade", 50), "normal");
  assert.equal(scenarioHandoffWeight(handoff, 0), 1);
  assert.equal(scenarioHandoffWeight(handoff, TELEMETRY_HANDOFF_SECONDS), 0);
  assert.equal(scenarioHandoffWeight(handoff, TELEMETRY_HANDOFF_SECONDS * 4), 0);
  assert.equal(scenarioHandoffWeight(null, 0), 0);

  let previous = Infinity;
  for (let t = 0; t <= TELEMETRY_HANDOFF_SECONDS; t += 0.05) {
    const weight = scenarioHandoffWeight(handoff, t);
    assert.ok(weight >= 0 && weight <= 1);
    assert.ok(weight <= previous + 1e-12, `handoff weight rose at t=${t}`);
    previous = weight;
  }
});

test("handoff is consumed against scenario time so it is deterministic and pause-safe", () => {
  const live = scenarioFrameAt("cascade", 50, null);
  const handoff = beginScenarioHandoff(live, "normal");
  const a = scenarioFrameAt("normal", 1.5, handoff);
  const b = scenarioFrameAt("normal", 1.5, handoff);
  assert.deepEqual(a.values, b.values, "handoff must not depend on wall-clock time");

  /* Selecting the condition already running does not manufacture a handoff. */
  const same = beginScenarioHandoff(createFrame("normal", 0), "normal");
  assert.equal(same, null);
});

test("continued telemetry stays inside every signal's declared bounds", () => {
  const live = scenarioFrameAt("cascade", 55, null);
  for (const target of ["normal", "traffic", "cache", "flapping", "creep", "deploy"]) {
    const handoff = beginScenarioHandoff(live, target);
    for (let t = 0; t <= TELEMETRY_HANDOFF_SECONDS; t += 0.1) {
      const frame = scenarioFrameAt(target, t, handoff);
      for (const signal of SIGNALS) {
        const value = frame.values[signal.id];
        assert.ok(Number.isFinite(value), `${target}.${signal.id} not finite`);
        assert.ok(value >= signal.min && value <= signal.max, `${target}.${signal.id} left bounds (${value})`);
        const normalised = frame.normalised[signal.id];
        assert.ok(normalised >= 0 && normalised <= 1, `${target}.${signal.id} normalised left 0..1`);
      }
    }
  }
});
