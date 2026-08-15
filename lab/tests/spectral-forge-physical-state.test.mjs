import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { SCENARIO_BY_ID, createFrame } from "../../static/js/spectral-forge/domain.js";
import { audibleOutputs, createComparisonState } from "../../static/js/spectral-forge/state.js";
import {
  PHYSICAL_STATE_KEYS,
  createPhysicalStateModel,
  resetPhysicalStateModel,
  stepPhysicalState,
} from "../../static/js/spectral-forge/spectral-field-physical-state.js";
import {
  createPhysicalFissionState,
  physicalFissionEnvelope,
  stepPhysicalFission,
} from "../../static/js/spectral-forge/prototypes/field-proto-flagship-final-form-physics.js";

const EXPECTED_KEYS = [
  "pressure",
  "compression",
  "stretch",
  "viscosity",
  "cohesion",
  "instability",
  "propagation",
  "peakRecruitment",
  "surfaceTension",
  "recovery",
  "memory",
];

const comparison = createComparisonState();

function simulateScenario(id, seconds = 60, { model = createPhysicalStateModel(), lifeStart = 0 } = {}) {
  const samples = [];
  const eventStarts = [];
  const seenSequences = new Set();
  const stepSeconds = 0.1;
  const seed = SCENARIO_BY_ID[id]?.visualSeed ?? 0;
  for (let t = 0; t <= seconds + 1e-9; t += stepSeconds) {
    const scenarioTime = Math.min(60, Number(t.toFixed(1)));
    const frame = createFrame(id, scenarioTime);
    const outputs = audibleOutputs(frame, comparison);
    const physical = stepPhysicalState(model, {
      frame,
      outputs,
      lifeTime: lifeStart + t,
      scenarioSeed: seed,
      audioExpression: 0,
    });
    for (const event of model.events) {
      if (!seenSequences.has(event.sequence)) {
        seenSequences.add(event.sequence);
        eventStarts.push({ kind: event.kind, lifeTime: lifeStart + t, scenarioTime, strength: event.strength });
      }
    }
    samples.push({ scenarioTime, physical, target: { ...model.target } });
  }
  return { model, samples, eventStarts, lifeEnd: lifeStart + seconds };
}

function average(samples, key, from = 0) {
  const chosen = samples.filter((sample) => sample.scenarioTime >= from);
  return chosen.reduce((sum, sample) => sum + sample.physical[key], 0) / Math.max(1, chosen.length);
}

function maxValue(samples, key) {
  return Math.max(...samples.map((sample) => sample.physical[key]));
}

function minValue(samples, key) {
  return Math.min(...samples.map((sample) => sample.physical[key]));
}

test("canonical physical contract is exact, finite, bounded and deterministic", () => {
  assert.deepEqual(PHYSICAL_STATE_KEYS, EXPECTED_KEYS);
  const first = simulateScenario("cascade", 45);
  const second = simulateScenario("cascade", 45);
  assert.equal(first.samples.length, second.samples.length);
  for (let index = 0; index < first.samples.length; index += 1) {
    const a = first.samples[index].physical;
    const b = second.samples[index].physical;
    for (const key of EXPECTED_KEYS) {
      assert.ok(Number.isFinite(a[key]), `${key} must be finite`);
      assert.ok(a[key] >= 0 && a[key] <= 1, `${key} must remain bounded`);
      assert.equal(a[key], b[key], `${key} diverged at sample ${index}`);
    }
    assert.equal(a.fractureDrive, b.fractureDrive);
  }
});

test("physical response bands preserve fast micro expression and slow retained state", () => {
  const model = createPhysicalStateModel();
  let life = 0;
  for (let t = 0; t <= 4; t += 0.1) {
    const frame = createFrame("normal", t);
    stepPhysicalState(model, { frame, outputs: audibleOutputs(frame, comparison), lifeTime: life, scenarioSeed: 1, audioExpression: 0 });
    life += 0.1;
  }
  const before = { ...model.values };
  const stressed = createFrame("cascade", 42);
  const firstStress = stepPhysicalState(model, {
    frame: stressed,
    outputs: audibleOutputs(stressed, comparison),
    lifeTime: life,
    scenarioSeed: 1,
    audioExpression: 0,
  });
  assert.ok(
    Math.abs(firstStress.peakRecruitment - before.peakRecruitment) > Math.abs(firstStress.stretch - before.stretch),
    "micro peak recruitment should move faster than macro stretch",
  );
  assert.ok(
    Math.abs(firstStress.instability - before.instability) >= Math.abs(firstStress.viscosity - before.viscosity),
    "instability should attack at least as quickly as viscosity",
  );

  for (let t = 42; t <= 55; t += 0.1) {
    const frame = createFrame("cascade", t);
    stepPhysicalState(model, { frame, outputs: audibleOutputs(frame, comparison), lifeTime: life, scenarioSeed: 1, audioExpression: 0 });
    life += 0.1;
  }
  const stressedMemory = model.values.memory;
  const stressedCohesion = model.values.cohesion;
  for (let t = 0; t <= 2; t += 0.1) {
    const frame = createFrame("normal", t);
    stepPhysicalState(model, { frame, outputs: audibleOutputs(frame, comparison), lifeTime: life, scenarioSeed: 1, audioExpression: 0 });
    life += 0.1;
  }
  assert.ok(model.values.memory > stressedMemory * 0.55, "memory should release slowly after severe stress");
  assert.ok(model.values.cohesion > stressedCohesion, "cohesion should recover rather than reset instantly");
  assert.ok(model.values.cohesion < 0.98, "cohesion recovery should retain macro history after two seconds");
});

test("all seven real telemetry scenarios produce distinct physical tendencies", () => {
  const normal = simulateScenario("normal", 60);
  const traffic = simulateScenario("traffic", 60);
  const cache = simulateScenario("cache", 60);
  const flapping = simulateScenario("flapping", 60);
  const creep = simulateScenario("creep", 60);
  const cascade = simulateScenario("cascade", 60);
  const deploy = simulateScenario("deploy", 60);

  assert.ok(average(normal.samples, "cohesion", 10) > 0.7);
  assert.ok(average(normal.samples, "instability", 10) < 0.42);
  assert.ok(average(normal.samples, "memory", 10) < 0.36);

  assert.ok(maxValue(traffic.samples, "compression") > maxValue(normal.samples, "compression") + 0.04);
  assert.ok(maxValue(traffic.samples, "pressure") > maxValue(normal.samples, "pressure") + 0.03);

  const supportLoss = cache.eventStarts.find((event) => event.kind === "support-loss");
  assert.ok(supportLoss, "Cache telemetry should produce a generic support-loss event");
  const laterCachePressure = cache.samples.find((sample) => sample.scenarioTime >= supportLoss.scenarioTime + 1.5 && sample.physical.pressure > 0.35);
  assert.ok(laterCachePressure, "support loss should precede later downstream pressure");

  assert.ok(average(flapping.samples, "instability", 8) > average(normal.samples, "instability", 8) + 0.04);

  const creepEarly = creep.samples.filter((sample) => sample.scenarioTime >= 5 && sample.scenarioTime <= 15);
  const creepLate = creep.samples.filter((sample) => sample.scenarioTime >= 45);
  assert.ok(average(creepLate, "stretch") > average(creepEarly, "stretch") + 0.08);
  assert.ok(average(creepLate, "viscosity") > average(creepEarly, "viscosity") + 0.06);

  assert.ok(maxValue(cascade.samples, "fractureDrive") > maxValue(traffic.samples, "fractureDrive") + 0.05);
  assert.ok(maxValue(cascade.samples, "propagation") > maxValue(normal.samples, "propagation") + 0.08);
  assert.ok(minValue(cascade.samples, "cohesion") < minValue(normal.samples, "cohesion") - 0.08);

  const disturbanceRecovery = average(
    deploy.samples.filter((sample) => sample.scenarioTime >= 12 && sample.scenarioTime < 34),
    "recovery",
  );
  const recoveryPhase = average(
    deploy.samples.filter((sample) => sample.scenarioTime >= 34),
    "recovery",
  );
  assert.ok(
    recoveryPhase > disturbanceRecovery + 0.005,
    "Deployment / Recovery should increase recovery after the disturbance phase",
  );
  const midCohesion = Math.min(...deploy.samples.filter((sample) => sample.scenarioTime >= 15 && sample.scenarioTime <= 40).map((sample) => sample.physical.cohesion));
  const lateCohesion = average(deploy.samples, "cohesion", 52);
  assert.ok(lateCohesion > midCohesion + 0.05, "Deployment / Recovery should restore cohesion after disturbance");
});

test("physical history changes otherwise equivalent current telemetry", () => {
  const historyModel = createPhysicalStateModel();
  let life = 0;
  const cache = simulateScenario("cache", 34, { model: historyModel, lifeStart: life });
  life = cache.lifeEnd + 0.1;
  const cascade = simulateScenario("cascade", 32, { model: historyModel, lifeStart: life });
  life = cascade.lifeEnd + 0.1;
  const scarredNormal = simulateScenario("normal", 8, { model: historyModel, lifeStart: life });
  const cleanNormal = simulateScenario("normal", 8);
  const scarred = scarredNormal.samples.at(-1).physical;
  const clean = cleanNormal.samples.at(-1).physical;
  assert.ok(scarred.memory > clean.memory + 0.05);
  assert.ok(scarred.scarInfluence >= clean.scarInfluence);
  assert.notEqual(scarred.cohesion, clean.cohesion);
});

test("causal event and scar storage stays bounded and heals", () => {
  const run = simulateScenario("cascade", 60);
  assert.ok(run.model.events.length <= 4);
  assert.ok(run.model.scars.length <= 4);
  const before = run.model.scars.reduce((sum, scar) => sum + (scar.current ?? scar.strength ?? 0), 0);
  let life = run.lifeEnd + 0.1;
  for (let t = 0; t <= 40; t += 0.1) {
    const frame = createFrame("normal", Math.min(60, t));
    stepPhysicalState(run.model, { frame, outputs: audibleOutputs(frame, comparison), lifeTime: life, scenarioSeed: 1, audioExpression: 0 });
    life += 0.1;
  }
  const after = run.model.scars.reduce((sum, scar) => sum + (scar.current ?? scar.strength ?? 0), 0);
  assert.ok(after < before || run.model.scars.length === 0, "scar influence should decay under sustained recovery");
});

test("stress-driven fission uses physical state, stays bounded, persists through changing conditions and recovery accelerates return", () => {
  const severe = {
    fractureDrive: 0.96,
    cohesion: 0.14,
    instability: 0.82,
    propagation: 0.92,
    pressure: 0.88,
    memory: 0.84,
    surfaceTension: 0.18,
    recovery: 0.03,
    scarInfluence: 0.45,
    dominantEvent: { axis: { x: 0.45, y: -0.2, z: 0.87 }, influence: 0.9, progress: 0.4 },
  };
  const flappingLike = {
    fractureDrive: 0.48,
    cohesion: 0.62,
    instability: 0.92,
    propagation: 0.2,
    pressure: 0.28,
    memory: 0.12,
    surfaceTension: 0.62,
    recovery: 0.08,
  };
  assert.ok(physicalFissionEnvelope(severe) > 0.64);
  assert.ok(physicalFissionEnvelope(flappingLike) < 0.64, "instability alone must not routinely cause major fission");

  const state = createPhysicalFissionState();
  let current = null;
  let life = 10;
  for (let index = 0; index < 220; index += 1) {
    current = stepPhysicalFission(state, { physical: severe, lifeTime: life, seedPhase: 2.4, scheduledFission: null });
    life += 0.05;
  }
  assert.equal(current.active, true);
  assert.ok(current.count >= 1 && current.count <= 3);
  const progressBeforeSwitch = current.progress;

  const changedCondition = { ...severe, pressure: 0.58, propagation: 0.55, memory: 0.8 };
  current = stepPhysicalFission(state, { physical: changedCondition, lifeTime: life, seedPhase: 2.4, scheduledFission: null });
  assert.equal(current.active, true);
  assert.ok(current.progress >= progressBeforeSwitch, "new telemetry must modify rather than despawn the active fission event");

  while (state.progress < 0.72) {
    stepPhysicalFission(state, { physical: severe, lifeTime: life, seedPhase: 2.4, scheduledFission: null });
    life += 0.05;
  }
  const stressedClone = structuredClone(state);
  const recoveryClone = structuredClone(state);
  const recovery = {
    ...severe,
    fractureDrive: 0.18,
    cohesion: 0.9,
    instability: 0.1,
    propagation: 0.12,
    pressure: 0.16,
    memory: 0.42,
    surfaceTension: 0.92,
    recovery: 0.94,
  };
  const stressedNext = stepPhysicalFission(stressedClone, { physical: severe, lifeTime: life + 0.05, seedPhase: 2.4, scheduledFission: null });
  const recoveringNext = stepPhysicalFission(recoveryClone, { physical: recovery, lifeTime: life + 0.05, seedPhase: 2.4, scheduledFission: null });
  assert.ok(recoveringNext.progress > stressedNext.progress, "recovery should accelerate deterministic return/rejoin progress");
});

test("physical modules have no runtime Math.random dependency and hard reset clears models", async () => {
  const paths = [
    new URL("../../static/js/spectral-forge/spectral-field-physical-state.js", import.meta.url),
    new URL("../../static/js/spectral-forge/prototypes/field-proto-flagship-final-form-physics.js", import.meta.url),
  ];
  for (const path of paths) {
    assert.doesNotMatch(await readFile(path, "utf8"), /Math\.random\s*\(/);
  }
  const model = createPhysicalStateModel();
  simulateScenario("cascade", 20, { model });
  resetPhysicalStateModel(model);
  assert.equal(model.values.memory, 0);
  assert.equal(model.events.length, 0);
  assert.equal(model.scars.length, 0);
});
