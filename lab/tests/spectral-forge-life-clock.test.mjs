import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  createOrganismLifeClock,
  organismLifeActive,
  readOrganismLifeTime,
  rendererShouldAnimate,
  resetOrganismLifeClock,
  stepOrganismLifeClock,
} from "../../static/js/spectral-forge/spectral-field-life-clock.js";

const VISUALS_URL = new URL("../../static/js/spectral-forge/visuals.js", import.meta.url);
const APP_CORE_URL = new URL("../../static/js/spectral-forge/app-core.js", import.meta.url);
const RUNTIME_URL = new URL("../../static/js/spectral-forge/spectral-field-runtime.js", import.meta.url);

test("organism life stays active after scenario COMPLETE and pauses otherwise", () => {
  assert.equal(organismLifeActive("PLAYING"), true);
  assert.equal(organismLifeActive("COMPLETE"), true);
  assert.equal(organismLifeActive("PAUSED"), false);
  assert.equal(organismLifeActive("STOPPED"), false);
});

test("shared life clock continues past a 60s telemetry hold and does not reset on render-like steps", () => {
  const clock = createOrganismLifeClock();
  let timestamp = 1_000;
  for (let step = 0; step < 4_400; step += 1) {
    timestamp += 16;
    const playback = clock.time < 60 ? "PLAYING" : "COMPLETE";
    stepOrganismLifeClock(clock, timestamp, playback);
  }
  assert.ok(clock.time > 60, `life clock did not outlive telemetry (${clock.time})`);
  assert.ok(clock.time > 68, `life clock should still advance in COMPLETE (${clock.time})`);
  const before = clock.time;
  stepOrganismLifeClock(clock, timestamp + 16, "COMPLETE");
  assert.ok(clock.time >= before, "COMPLETE must not rewind organism time");
  const paused = clock.time;
  stepOrganismLifeClock(clock, timestamp + 500, "PAUSED");
  assert.equal(clock.time, paused);
  stepOrganismLifeClock(clock, timestamp + 516, "PLAYING");
  assert.equal(clock.time, paused);
  stepOrganismLifeClock(clock, timestamp + 532, "PLAYING");
  assert.ok(clock.time > paused);
});

test("audio and mode-style state updates must not be able to assign frame.time onto visualTime", async () => {
  const visuals = await readFile(VISUALS_URL, "utf8");
  const runtime = await readFile(RUNTIME_URL, "utf8");
  const app = await readFile(APP_CORE_URL, "utf8");
  assert.doesNotMatch(visuals, /this\.visualTime = state\.frame\.time/);
  assert.match(visuals, /state\?\.organismLife/);
  assert.match(runtime, /stepOrganismLifeClock/);
  assert.match(runtime, /fieldVisible !== false/);
  assert.match(app, /createOrganismLifeClock/);
  assert.match(app, /resetOrganismLifeClock\(organismLife\)/);
  assert.match(app, /fieldVisible: depth === "PLAY"/);
  assert.match(app, /fieldVisible: depth === "FORGE"/);
  assert.match(app, /fieldVisible: depth === "ANALYSE"/);
  assert.doesNotMatch(app, /time = 0;\s*\n\s*playback = "COMPLETE"/);
});

test("REPLAY preserves organism life while RESET RUN is the explicit organism restart path", async () => {
  const app = await readFile(APP_CORE_URL, "utf8");
  assert.match(app, /function replayScenario/);
  const replayStart = app.indexOf("function replayScenario");
  const replayEnd = app.indexOf("function togglePlayback");
  const replay = app.slice(replayStart, replayEnd);
  assert.match(replay, /applyScenarioSelection/);
  assert.match(replay, /beginScenarioHandoff/);
  assert.doesNotMatch(replay, /resetScenario\(/);
  assert.doesNotMatch(replay, /resetOrganismLifeClock/);
  assert.doesNotMatch(replay, /safeReset/);
  const toggle = app.slice(replayEnd, app.indexOf("function resetScenario"));
  assert.match(toggle, /playback === "COMPLETE"[\s\S]*replayScenario\(\)/);

  assert.match(app, /function resetScenario/);
  const resetStart = app.indexOf("function resetScenario");
  const resetEnd = app.indexOf("function selectScenario");
  const reset = app.slice(resetStart, resetEnd);
  assert.match(reset, /resetOrganismLifeClock\(organismLife\)/);
  assert.match(reset, /audioEngine\?\.safeReset\(\)/);
  assert.match(reset, /playback = "STOPPED"/);

  const selectStart = app.indexOf("function selectScenario");
  const selectEnd = app.indexOf("function stepScenario");
  const select = app.slice(selectStart, selectEnd);
  assert.match(select, /applyScenarioSelection/);
  assert.doesNotMatch(select, /resetScenario\(/);
  assert.doesNotMatch(select, /resetOrganismLifeClock/);
  assert.doesNotMatch(select, /safeReset/);
  const step = app.slice(selectEnd, app.indexOf("async function enableAudio"));
  assert.match(step, /selectScenario\(SCENARIOS\[index\]\.id\)/);
});

test("hidden views do not animate while still reconstructing from the shared clock", () => {
  const clock = createOrganismLifeClock();
  const hidden = { playback: "PLAYING", fieldVisible: false, organismLife: clock };
  const visible = { playback: "PLAYING", fieldVisible: true, organismLife: clock };
  assert.equal(rendererShouldAnimate(hidden, false), false);
  assert.equal(rendererShouldAnimate(visible, false), true);
  stepOrganismLifeClock(clock, 100, "PLAYING");
  stepOrganismLifeClock(clock, 116, "PLAYING");
  assert.equal(readOrganismLifeTime(hidden), clock.time);
  assert.equal(readOrganismLifeTime(visible), clock.time);
});

test("explicit reset returns the shared clock to the deterministic origin", () => {
  const clock = createOrganismLifeClock();
  stepOrganismLifeClock(clock, 0, "PLAYING");
  stepOrganismLifeClock(clock, 250, "PLAYING");
  clock.audioExpression = 0.8;
  clock.audioExpressionTime = 12;
  clock.attitude = { x: 0.1, y: -0.04, z: 0.02 };
  clock.framing = { distance: 5 };
  clock.fission = { active: true };
  clock.physicalFission = { active: true };
  assert.ok(clock.time > 0);
  resetOrganismLifeClock(clock);
  assert.equal(clock.time, 0);
  assert.equal(clock.lastTimestamp, null);
  assert.equal(clock.audioExpression, 0);
  assert.equal(clock.audioExpressionTime, null);
  assert.equal(clock.attitude, null);
  assert.equal(clock.framing, null);
  assert.equal(clock.fission, null);
  assert.equal(clock.physicalFission, null);
});

test("audio enable and mute-style ramps must not own a second life clock", async () => {
  const pbr = await readFile(
    new URL("../../static/js/spectral-forge/prototypes/field-proto-flagship-final-form-pbr.js", import.meta.url),
    "utf8",
  );
  assert.match(pbr, /function sharedLifeHost/);
  assert.match(pbr, /renderer\.state\?\.organismLife/);
  assert.match(pbr, /state\.attitude = life\.attitude/);
  assert.match(pbr, /stepAudioExpression\(lifeHost/);
  assert.doesNotMatch(pbr, /this\.visualTime = state\.frame\.time/);
});
