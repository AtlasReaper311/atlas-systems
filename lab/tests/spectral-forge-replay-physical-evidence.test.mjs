import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { applyScenarioSelection, beginScenarioHandoff } from "../../static/js/spectral-forge/spectral-field-scenario-clock.js";
import { createOrganismLifeClock, resetOrganismLifeClock } from "../../static/js/spectral-forge/spectral-field-life-clock.js";

const APP_CORE = new URL("../../static/js/spectral-forge/app-core.js", import.meta.url);
const REPLAY_CONTRACT = new URL("../../static/js/spectral-forge/replay-contract.js", import.meta.url);
const INSPECTOR = new URL("../../static/js/spectral-forge/physical-inspector.js", import.meta.url);
const PHYSICS = new URL("../../static/js/spectral-forge/prototypes/field-proto-flagship-final-form-physics.js", import.meta.url);

function completeState() {
  return { scenarioId: "cache", playback: "COMPLETE", scenarioTime: 60 };
}

test("REPLAY decision restarts only scenario-local telemetry and preserves organism-owned state", () => {
  const life = createOrganismLifeClock();
  life.time = 84.25;
  life.physical = { values: { memory: 0.61 }, scars: [{ strength: 0.4 }] };
  life.fission = { active: true, phase: "independent", count: 2 };
  life.physicalFission = { active: true, progress: 0.63 };
  life.audioExpression = 0.77;
  const physicalRef = life.physical;
  const fissionRef = life.fission;
  const physicalFissionRef = life.physicalFission;

  const decision = applyScenarioSelection(completeState(), "cache");
  assert.equal(decision.changed, true);
  assert.equal(decision.scenarioTime, 0);
  assert.equal(decision.playback, "PLAYING");
  assert.equal(decision.resetOrganism, false);
  assert.equal(decision.startTimer, true);
  assert.equal(decision.handoff, true);
  assert.equal(life.time, 84.25);
  assert.equal(life.physical, physicalRef);
  assert.equal(life.fission, fissionRef);
  assert.equal(life.physicalFission, physicalFissionRef);
  assert.equal(life.audioExpression, 0.77);
});

test("REPLAY creates a deterministic short handoff from final frame while RESET RUN remains destructive", async () => {
  const decision = applyScenarioSelection(completeState(), "cache");
  assert.equal(decision.handoff, true);
  const finalFrame = { marker: "final" };
  const handoff = beginScenarioHandoff(finalFrame, 1000);
  assert.equal(handoff.fromFrame, finalFrame);
  assert.ok(handoff.duration > 0);

  const app = await readFile(APP_CORE, "utf8");
  const reset = app.slice(app.indexOf("function resetScenario"), app.indexOf("function selectScenario"));
  assert.match(reset, /resetOrganismLifeClock\(organismLife\)/);
  assert.match(reset, /audioEngine\?\.safeReset\(\)/);
  assert.match(reset, /playback = "STOPPED"/);

  const life = createOrganismLifeClock();
  life.time = 33;
  life.physical = { values: { memory: 0.7 } };
  life.fission = { active: true };
  life.physicalFission = { active: true };
  resetOrganismLifeClock(life);
  assert.equal(life.time, 0);
  assert.equal(life.physical, null);
  assert.equal(life.fission, null);
  assert.equal(life.physicalFission, null);
  assert.equal(life.audioExpression, 0);
});

test("current REPLAY interception has one semantic implementation for click and Space and never safe-resets audio", async () => {
  const replay = await readFile(REPLAY_CONTRACT, "utf8");
  const calls = replay.match(/replayCurrentScenario\(root\)/g) ?? [];
  assert.equal(calls.length, 2, "click and Space should converge on the same replayCurrentScenario action");
  assert.match(replay, /select\.dispatchEvent\(new Event\("change"/);
  assert.doesNotMatch(replay, /safeReset|resetOrganismLifeClock|audioEngine/);
  assert.match(replay, /event\.key !== " "/);
});

test("REPLAY path does not mutate mode, mapping, preset, comparison, mute or audio activation state", () => {
  const productState = {
    depth: "ANALYSE",
    presetId: "reference",
    comparison: { activeVariant: "B", selectedMappingId: "route-1" },
    audioEnabled: true,
    audioMuted: true,
  };
  const snapshot = structuredClone(productState);
  applyScenarioSelection(completeState(), "cache");
  assert.deepEqual(productState, snapshot);
});

test("ANALYSE physical inspector exposes all canonical values and development evidence", async () => {
  const inspector = await readFile(INSPECTOR, "utf8");
  for (const key of [
    "pressure", "compression", "stretch", "viscosity", "cohesion", "instability", "propagation",
    "peakRecruitment", "surfaceTension", "recovery", "memory",
  ]) {
    assert.match(inspector, new RegExp(`\\[\\"${key}\\",`));
  }
  for (const key of ["fractureDrive", "activeEventCount", "scarInfluence", "organismLifeTime", "scenarioTime", "fissionPhase", "fissionCount"]) {
    assert.match(inspector, new RegExp(key));
  }
});

test("selected-route amber remains local while physical integration contains no scenario-name choreography", async () => {
  const physics = await readFile(PHYSICS, "utf8");
  assert.match(physics, /routeEnabled\.value > 0\.5/);
  assert.match(physics, /routeWidth\.value/);
  assert.doesNotMatch(physics, /scenarioId\s*===|scenarioId\s*!==|case\s+["'](?:normal|traffic|cache|flapping|creep|cascade|deploy)["']/i);
  assert.doesNotMatch(physics, /Math\.random\s*\(/);
});
