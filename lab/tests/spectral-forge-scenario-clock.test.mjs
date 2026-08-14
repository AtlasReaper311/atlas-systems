import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { createFrame } from "../../static/js/spectral-forge/domain.js";
import {
  applyScenarioSelection,
  beginScenarioHandoff,
  mixScenarioFrames,
  resolveScenarioFrame,
  SCENARIO_HANDOFF_MS,
  SCENARIO_HANDOFF_SECONDS,
  scenarioHandoffMix,
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

test("fission state survives scenario switch", () => {
  const seedPhase = FIELD_VISUAL_SEED * Math.PI * 2;
  const event = iterateLifeEvents("fission", seedPhase, "normal", 120)[0];
  const mid = event.start + event.duration * 0.55;
  const before = evaluateFission(mid, seedPhase, "normal");
  const after = evaluateFission(mid, seedPhase, "cascade");
  assert.equal(before.active, true);
  assert.equal(after.active, true);
  assert.equal(before.start, after.start);
  assert.equal(before.count, after.count);
  assert.equal(before.daughters[0].distance, after.daughters[0].distance);
  const switched = livingGesture(mid * 0.35, seedPhase, 1, 0.2, mid, "deploy");
  assert.equal(switched.fission.start, before.start);
  assert.equal(switched.fission.phase, before.phase);
});

test("audio and mode continuity survive scenario switch", async () => {
  const app = await readFile(APP_CORE_URL, "utf8");
  const select = app.slice(app.indexOf("function selectScenario"), app.indexOf("function stepScenario"));
  assert.doesNotMatch(select, /audioEngine\?\.safeReset/);
  assert.doesNotMatch(select, /resetOrganismLifeClock/);
  assert.match(app, /fieldVisible: depth === "PLAY"/);
  assert.match(app, /fieldVisible: depth === "FORGE"/);
  assert.match(app, /fieldVisible: depth === "ANALYSE"/);
  assert.match(app, /mappedFrame\(\)/);
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

test("scenario handoff blends telemetry without jumping to the old elapsed time", () => {
  assert.ok(SCENARIO_HANDOFF_SECONDS >= 0.4 && SCENARIO_HANDOFF_SECONDS <= 1);
  const from = createFrame("normal", 43);
  const to = createFrame("cascade", 0);
  const handoff = beginScenarioHandoff(from, 1000);
  assert.equal(scenarioHandoffMix(handoff, 1000), 0);
  const mid = resolveScenarioFrame(to, handoff, 1000 + SCENARIO_HANDOFF_MS * 0.5);
  assert.notEqual(mid.values.anomaly_score, from.values.anomaly_score);
  assert.notEqual(mid.values.anomaly_score, to.values.anomaly_score);
  const done = resolveScenarioFrame(to, handoff, 1000 + SCENARIO_HANDOFF_MS + 1);
  assert.equal(done.values.anomaly_score, to.values.anomaly_score);
  const mixed = mixScenarioFrames(from, to, 0.5);
  assert.ok(mixed.normalised.latency_ms > Math.min(from.normalised.latency_ms, to.normalised.latency_ms));
  assert.equal(mixed.time, to.time);
});
