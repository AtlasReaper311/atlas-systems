import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  BUILT_IN_PRESETS,
  SCENARIOS,
  createFrame,
  mappingOutputs,
} from "../../static/js/spectral-forge/domain.js";
import {
  PHYSICAL_STATE_KEYS,
  createPhysicalStateModel,
  physicalStateEvidence,
  resetPhysicalStateModel,
  stepPhysicalState,
} from "../../static/js/spectral-forge/spectral-field-physical-state.js";
import {
  MATERIAL_REGIMES,
  createMaterialState,
  stepMaterialState,
} from "../../static/js/spectral-forge/spectral-field-material.js";
import {
  beginScenarioHandoff,
  scenarioFrameAt,
} from "../../static/js/spectral-forge/spectral-field-scenario-clock.js";

const REFERENCE = BUILT_IN_PRESETS[0];
const DT = 1 / 30;

/*
 * These tests assert regime EXCLUSIVITY, not amplitude. Threshold-only checks
 * ("cascade has more fracture drive than normal") can stay green while every
 * scenario still performs the same catalogue of deformations at different
 * sizes, which is exactly the failure this suite exists to prevent.
 */

function simulate(scenarioId, {
  seconds = 60,
  model = createPhysicalStateModel(),
  startLife = 0,
  handoff = null,
} = {}) {
  const samples = [];
  let life = startLife;
  let frame = null;
  for (let t = 0; t <= seconds + 1e-9; t += DT) {
    frame = scenarioFrameAt(scenarioId, t, handoff);
    const outputs = mappingOutputs(frame, REFERENCE.mappings);
    life += DT;
    const snapshot = stepPhysicalState(model, {
      frame,
      outputs,
      lifeTime: life,
      scenarioSeed: 0.731,
    });
    samples.push({
      t,
      life,
      regime: snapshot.regime,
      fractureDrive: snapshot.fractureDrive,
      fractureCharge: model.material.fractureCharge,
      damage: model.material.damage,
      supportStrength: model.material.supportStrength,
      stretchMagnitude: model.material.stretchMagnitude,
      domainDisagreement: model.material.domainDisagreement,
      pressureStrength: model.material.pressureStrength,
      frontPosition: model.material.frontPosition,
      returnPull: model.material.returnPull,
      permits: model.material.permits,
      values: { ...model.values },
    });
  }
  return { samples, model, frame, life };
}

function occupancy(samples, regime, from = 0) {
  const window = samples.filter((s) => s.t >= from);
  return window.filter((s) => s.regime === regime).length / window.length;
}

function peak(samples, key) {
  return samples.reduce((best, s) => Math.max(best, s[key]), 0);
}

test("canonical physical contract is exact, finite, bounded and deterministic", () => {
  assert.deepEqual([...PHYSICAL_STATE_KEYS], [
    "pressure", "compression", "stretch", "viscosity", "cohesion", "instability",
    "propagation", "peakRecruitment", "surfaceTension", "recovery", "memory",
  ]);

  for (const scenario of SCENARIOS) {
    const { samples } = simulate(scenario.id);
    for (const sample of samples) {
      for (const key of PHYSICAL_STATE_KEYS) {
        const value = sample.values[key];
        assert.ok(Number.isFinite(value), `${scenario.id}.${key} is not finite`);
        assert.ok(value >= 0 && value <= 1, `${scenario.id}.${key} left 0..1 (${value})`);
      }
      assert.ok(MATERIAL_REGIMES.includes(sample.regime), `unknown regime ${sample.regime}`);
    }
  }

  const first = simulate("cascade").samples.at(-1);
  const second = simulate("cascade").samples.at(-1);
  assert.deepEqual(first.values, second.values, "identical input must replay identically");
  assert.equal(first.regime, second.regime);
  assert.equal(first.fractureCharge, second.fractureCharge);
});

test("each scenario settles into its own material regime", () => {
  const expected = {
    normal: "coherent",
    traffic: "compressed",
    cache: "support-loss",
    flapping: "oscillating",
    creep: "viscous",
    cascade: "structural-failure",
  };
  for (const [scenarioId, regime] of Object.entries(expected)) {
    const { samples } = simulate(scenarioId);
    const share = occupancy(samples, regime, 15);
    assert.ok(share > 0.25, `${scenarioId} only reached ${regime} for ${(share * 100).toFixed(0)}% after 15s`);
  }

  /* Deployment is a bounded disturbance: it must show a recovery regime rather
   * than a failure one. */
  const deploy = simulate("deploy").samples;
  assert.ok(occupancy(deploy, "reassembly", 15) > 0.1, "deployment never reads as reassembly");
  assert.equal(occupancy(deploy, "structural-failure"), 0, "a bounded deployment must not read as structural failure");
});

test("Normal Load stays one coherent organism for a long lifetime", () => {
  const { samples } = simulate("normal", { seconds: 60 });
  assert.equal(occupancy(samples, "coherent"), 1, "healthy telemetry left the coherent regime");
  assert.equal(peak(samples, "fractureCharge"), 0, "healthy life charged a fracture");
  assert.equal(peak(samples, "fractureDrive"), 0, "healthy life produced fracture drive");
  assert.ok(peak(samples, "damage") < 0.05, "healthy life accumulated damage");

  for (const sample of samples) {
    assert.equal(sample.permits.fracture, false);
    assert.equal(sample.permits.fission, false);
  }

  /* Bounded micro-life must remain: coherent is not frozen. */
  const recruitment = samples.map((s) => s.values.peakRecruitment);
  assert.ok(Math.max(...recruitment) > 0.1, "healthy organism has no surface life");

  /* Four consecutive 60s runs on one organism: still no macroscopic fission. */
  const model = createPhysicalStateModel();
  let life = 0;
  for (let run = 0; run < 4; run += 1) {
    const result = simulate("normal", { model, startLife: life });
    life = result.life;
    assert.equal(peak(result.samples, "fractureCharge"), 0, `run ${run} charged a fracture in healthy life`);
  }
  assert.ok(life > 240, "organism lifetime did not accumulate across runs");
});

test("Traffic Spike is a compression regime and never becomes support failure or fracture", () => {
  const { samples } = simulate("traffic");
  assert.ok(occupancy(samples, "compressed", 15) > 0.4);
  assert.equal(occupancy(samples, "support-loss"), 0, "traffic acquired a support-loss regime");
  assert.equal(occupancy(samples, "structural-failure"), 0, "traffic acquired a structural-failure regime");
  assert.equal(peak(samples, "fractureCharge"), 0, "traffic charged a fracture");
  assert.equal(peak(samples, "supportStrength"), 0, "traffic developed a support-loss origin");

  const loaded = samples.filter((s) => s.regime === "compressed");
  assert.ok(loaded.length > 0);
  const compression = Math.max(...loaded.map((s) => s.values.compression));
  const stretch = Math.max(...loaded.map((s) => s.values.stretch));
  assert.ok(compression > stretch, `compression (${compression}) must dominate stretch (${stretch})`);
  assert.ok(Math.min(...loaded.map((s) => s.values.cohesion)) > 0.4, "traffic must stay well clear of failure cohesion");
  assert.ok(peak(samples, "pressureStrength") > 0.4, "traffic never developed a directional pressure region");
});

test("Cache Collapse loses local support first, then propagates downstream", () => {
  const { samples } = simulate("cache");
  const firstSupport = samples.find((s) => s.supportStrength > 0.3);
  const firstDownstream = samples.find((s) => s.values.pressure > 0.45);
  assert.ok(firstSupport, "cache never lost local support");
  assert.ok(firstDownstream, "cache never produced downstream pressure");
  assert.ok(
    firstSupport.t < firstDownstream.t,
    `support loss (t=${firstSupport.t.toFixed(1)}) must precede downstream pressure (t=${firstDownstream.t.toFixed(1)})`,
  );

  /* The origin must hold still long enough to be perceptible, and the front
   * must travel away from it. */
  const held = samples.filter((s) => s.supportStrength > 0.3);
  assert.ok(held.at(-1).t - held[0].t > 8, "support-loss origin was not held long enough to read");
  assert.ok(held.at(-1).frontPosition > held[0].frontPosition + 0.2, "propagation front did not travel");

  assert.equal(peak(samples, "fractureCharge"), 0, "an ordinary cache collapse fractured");
  assert.ok(occupancy(samples, "structural-failure") < 0.05, "ordinary cache collapse became structural failure");
});

test("Service Flapping competes and reseals without persistent elongation or fission", () => {
  const { samples } = simulate("flapping");
  assert.ok(occupancy(samples, "oscillating", 15) > 0.5);
  assert.ok(peak(samples, "domainDisagreement") > 0.4, "flapping never produced competing domains");
  assert.equal(peak(samples, "fractureCharge"), 0, "flapping charged a fracture");
  assert.equal(occupancy(samples, "viscous"), 0, "flapping acquired the viscous elongation regime");
  assert.ok(peak(samples, "stretchMagnitude") < 0.1, "flapping developed persistent elongation");

  /* Coherence must repeatedly fall and recover rather than decline once. */
  const active = samples.filter((s) => s.t >= 10 && s.t <= 50).map((s) => s.values.cohesion);
  let reversals = 0;
  let direction = 0;
  for (let i = 1; i < active.length; i += 1) {
    const delta = active[i] - active[i - 1];
    if (Math.abs(delta) < 1e-4) continue;
    const sign = Math.sign(delta);
    if (direction !== 0 && sign !== direction) reversals += 1;
    direction = sign;
  }
  assert.ok(reversals >= 4, `flapping cohesion only reversed ${reversals} times`);
});

test("Latency Creep elongates on one persistent axis without instability or fission", () => {
  const { samples, model } = simulate("creep");
  assert.ok(occupancy(samples, "viscous", 15) > 0.4);
  assert.equal(peak(samples, "fractureCharge"), 0, "creep charged a fracture");
  assert.equal(occupancy(samples, "oscillating"), 0, "creep acquired the oscillating regime");
  assert.equal(occupancy(samples, "structural-failure"), 0, "creep became structural failure");

  /* Stretch must rise progressively rather than pulse. */
  const marks = [20, 35, 50].map((t) => samples.find((s) => s.t >= t).stretchMagnitude);
  assert.ok(marks[1] > marks[0], "creep stretch did not grow through the middle of the run");
  assert.ok(marks[2] > marks[1], "creep stretch did not keep growing late");

  /* The elongation axis must be persistent, not re-chosen every few frames. */
  const axis = model.material.stretchAxis;
  assert.ok(Number.isFinite(axis.x + axis.y + axis.z));
  const late = simulate("creep", { seconds: 60 });
  assert.ok(late.model.material.stretchMagnitude > 0.3, "late creep is not materially elongated");

  const viscous = samples.filter((s) => s.regime === "viscous");
  const instability = Math.max(...viscous.map((s) => s.values.instability));
  const flapping = simulate("flapping").samples.filter((s) => s.regime === "oscillating");
  const flappingInstability = Math.max(...flapping.map((s) => s.values.instability));
  assert.ok(instability < flappingInstability, "creep instability must stay below flapping");
});

test("Cascading Failure earns its fracture and produces bounded masses", () => {
  const { samples } = simulate("cascade");
  assert.ok(occupancy(samples, "structural-failure", 15) > 0.2);

  const charged = samples.find((s) => s.fractureCharge >= 1);
  assert.ok(charged, "cascade never charged a fracture");
  assert.ok(charged.t > 25, `fracture charged too early (t=${charged.t.toFixed(1)}) to be earned`);

  /* Fracture is reached only after the body has failed to absorb stress, and
   * only from within the failure regime. */
  for (const sample of samples) {
    if (sample.fractureCharge > 0) assert.equal(sample.permits.fracture, true);
  }

  assert.ok(peak(samples, "damage") > 0.8, "cascade did not accumulate severe damage");
  assert.ok(peak(samples, "fractureDrive") > 0.35, "cascade fracture drive stayed low");

  /* No other scenario may reach the fission envelope, whatever its amplitude. */
  for (const scenario of SCENARIOS) {
    if (scenario.id === "cascade") continue;
    const other = simulate(scenario.id).samples;
    assert.equal(peak(other, "fractureCharge"), 0, `${scenario.id} charged a fracture`);
  }
});

test("Deployment recovery raises return pull and heals residual damage slowly", () => {
  /* Damage the organism with a full cascade, then apply recovery telemetry to
   * the same specimen. */
  const model = createPhysicalStateModel();
  const cascade = simulate("cascade", { model });
  assert.ok(cascade.samples.at(-1).damage > 0.8, "cascade did not leave the organism damaged");

  const handoff = beginScenarioHandoff(cascade.frame, "deploy");
  const recovery = simulate("deploy", { model, startLife: cascade.life, handoff });

  assert.ok(peak(recovery.samples, "returnPull") > 0.2, "recovery never raised a return force");
  const damageAtStart = recovery.samples[0].damage;
  const damageAtEnd = recovery.samples.at(-1).damage;
  assert.ok(damageAtEnd < damageAtStart * 0.5, "residual damage did not decay through recovery");
});

test("severe damage persists for roughly 20-30 seconds after conditions clear", () => {
  const model = createPhysicalStateModel();
  const cascade = simulate("cascade", { model });
  const handoff = beginScenarioHandoff(cascade.frame, "normal");
  const after = simulate("normal", { model, startLife: cascade.life, handoff });

  const at = (seconds) => after.samples.find((s) => s.t >= seconds).damage;
  assert.ok(at(5) > 0.4, `damage vanished too quickly (5s: ${at(5).toFixed(2)})`);
  assert.ok(at(15) > 0.15, `damage vanished too quickly (15s: ${at(15).toFixed(2)})`);
  assert.ok(at(20) > 0.08, `damage vanished before 20s (20s: ${at(20).toFixed(2)})`);
  assert.ok(at(35) < 0.1, `damage still present well past 30s (35s: ${at(35).toFixed(2)})`);

  /* The specimen must pass through a recovery regime rather than snapping back. */
  const regimes = after.samples.map((s) => s.regime);
  assert.ok(regimes.includes("reassembly"), "damaged organism never entered reassembly");
  assert.ok(regimes.at(-1) === "coherent", "organism never returned to a coherent state");
  const firstCoherent = after.samples.find((s) => s.regime === "coherent");
  assert.ok(firstCoherent.t > 3, "organism snapped straight back to healthy");
});

test("history changes how the same telemetry is experienced", () => {
  const fresh = simulate("cache");
  const damagedModel = createPhysicalStateModel();
  const cascade = simulate("cascade", { model: damagedModel });
  const carried = simulate("cache", {
    model: damagedModel,
    startLife: cascade.life,
    handoff: beginScenarioHandoff(cascade.frame, "cache"),
  });

  assert.ok(
    peak(carried.samples, "damage") > peak(fresh.samples, "damage"),
    "an already-damaged organism did not experience the next condition differently",
  );
  assert.ok(carried.samples[0].damage > 0.5, "damage did not carry across the scenario change");
});

test("physical and material layers contain no runtime randomness and reset cleanly", async () => {
  const sources = await Promise.all([
    readFile(new URL("../../static/js/spectral-forge/spectral-field-physical-state.js", import.meta.url), "utf8"),
    readFile(new URL("../../static/js/spectral-forge/spectral-field-material.js", import.meta.url), "utf8"),
    readFile(new URL("../../static/js/spectral-forge/prototypes/field-proto-flagship-final-form-physics.js", import.meta.url), "utf8"),
  ]);
  /* Comments are stripped first so the scan reports real code paths rather than
   * prose that happens to name the thing it forbids. */
  const code = sources.map((source) => source
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/^\s*\/\/.*$/gm, " "));

  for (const source of code) {
    assert.equal(/Math\s*\.\s*random/.test(source), false, "runtime randomness entered the physical layer");
  }

  /* Scenario identity must not be branched on in the physical or material
   * layers: identity has to emerge from telemetry. */
  for (const source of code) {
    assert.equal(
      /scenarioId\s*===\s*["'`]/.test(source),
      false,
      "scenario-name choreography entered the physical layer",
    );
    for (const scenario of SCENARIOS) {
      assert.equal(
        new RegExp(`===\\s*["'\`]${scenario.id}["'\`]`).test(source),
        false,
        `scenario-name choreography (${scenario.id}) entered the physical layer`,
      );
    }
  }

  const model = createPhysicalStateModel();
  simulate("cascade", { model });
  assert.ok(model.material.damage > 0.5);
  resetPhysicalStateModel(model);
  assert.equal(model.material.damage, 0);
  assert.equal(model.material.regime, "coherent");
  assert.equal(model.material.fractureCharge, 0);
  assert.equal(model.values.memory, 0);
});

test("material state exposes truthful inspectable evidence", () => {
  const model = createPhysicalStateModel();
  simulate("cascade", { model });
  const evidence = physicalStateEvidence(model);
  assert.ok(evidence);
  for (const key of PHYSICAL_STATE_KEYS) {
    assert.ok(Number.isFinite(evidence[key]), `${key} missing from evidence`);
  }
  assert.ok(MATERIAL_REGIMES.includes(evidence.material.regime));
  assert.ok(Number.isFinite(evidence.material.damage));
  assert.ok(Number.isFinite(evidence.material.fractureCharge));
  assert.equal(physicalStateEvidence(null), null);
});

test("the material model allocates a bounded, preallocated site and scar set", () => {
  const material = createMaterialState(0.731);
  assert.equal(material.sites.length, 7);
  assert.equal(material.scars.length, 4);

  const model = createPhysicalStateModel();
  simulate("cascade", { model });
  assert.ok(model.material.activeSiteCount <= 7);
  assert.ok(model.material.scars.filter((scar) => scar.active).length <= 4);

  /* The published snapshot must be a stable object rather than a fresh
   * allocation per frame: this runs inside the render loop. */
  const frame = createFrame("normal", 1);
  const outputs = mappingOutputs(frame, REFERENCE.mappings);
  const a = stepPhysicalState(model, { frame, outputs, lifeTime: 500 });
  const b = stepPhysicalState(model, { frame, outputs, lifeTime: 500.033 });
  assert.equal(a, b, "physical snapshot allocates a new object per frame");
});

test("domain disagreement reverses continuously instead of inverting polarity", () => {
  /* Service Flapping showed a visible positional snap. The domain sites took the
   * sign of sin(domainPhase) as their polarity while holding strength at half
   * the disagreement or more, so at the zero crossing the field went from a
   * substantial outward push to a substantial inward pull between two frames.
   *
   * Walking the phase through several full cycles, no site may invert its
   * polarity while carrying meaningful strength, and the signed force each
   * domain applies must never step. */
  const model = createMaterialState(0.41);
  const signals = {
    request_rate: 0.5, latency_ms: 0.5, error_rate: 0.42,
    queue_depth: 0.4, cache_hit_rate: 0.6, cpu_load: 0.5, anomaly_score: 0.55,
  };
  const trends = { request_rate: 0, latency_ms: 0, error_rate: 0, queue_depth: 0, cache_hit_rate: 0, cpu_load: 0, anomaly_score: 0 };

  /* Drive it into an oscillating regime with a real disagreement. */
  let lifeTime = 0;
  const dt = 1 / 60;
  for (let step = 0; step < 900; step += 1) {
    lifeTime += dt;
    const phase = Math.sin(lifeTime * 2.2);
    stepMaterialState(model, {
      signals: { ...signals, error_rate: 0.42 + phase * 0.3, anomaly_score: 0.55 + phase * 0.25 },
      trends: { ...trends, error_rate: phase * 0.9, anomaly_score: phase * 0.8 },
      physical: { instability: 0.8, cohesion: 0.6, propagation: 0.2, pressure: 0.4, stretch: 0.1, compression: 0.2, viscosity: 0.2, recovery: 0.1, memory: 0.2, surfaceTension: 0.5, peakRecruitment: 0.3 },
      lifeTime,
      dt,
    });
  }
  assert.ok(model.domainDisagreement > 0.05, `domain disagreement never engaged (${model.domainDisagreement})`);

  /* Now sample the site output across the phase, holding everything else. */
  const samples = [];
  for (let i = 0; i <= 720; i += 1) {
    model.domainPhase = (i / 720) * Math.PI * 6;
    stepMaterialState(model, { signals, trends, physical: { instability: 0.8, cohesion: 0.6, propagation: 0.2, pressure: 0.4, stretch: 0.1, compression: 0.2, viscosity: 0.2, recovery: 0.1, memory: 0.2, surfaceTension: 0.5, peakRecruitment: 0.3 }, lifeTime: (lifeTime += dt), dt: 0 });
    const domains = model.sites.slice(0, model.activeSiteCount).filter((s) => s.kind === "domain");
    samples.push(domains.map((s) => ({ polarity: s.polarity, strength: s.strength, signed: s.polarity * s.strength })));
  }

  let inversions = 0;
  let maxSignedStep = 0;
  for (let i = 1; i < samples.length; i += 1) {
    const previous = samples[i - 1];
    const current = samples[i];
    const pairs = Math.min(previous.length, current.length);
    for (let d = 0; d < pairs; d += 1) {
      const a = previous[d];
      const b = current[d];
      /* A polarity flip is only acceptable where the force has gone to nothing. */
      if (a.polarity !== b.polarity && Math.min(a.strength, b.strength) > 0.05) inversions += 1;
      maxSignedStep = Math.max(maxSignedStep, Math.abs(b.signed - a.signed));
    }
  }

  assert.equal(inversions, 0, `${inversions} polarity inversion(s) at substantial strength`);
  assert.ok(maxSignedStep < 0.05, `signed domain force stepped by ${maxSignedStep.toFixed(4)} between adjacent phases`);

  /* And the disagreement must still actually swing - the fix must not have been
   * bought by making Flapping placid. */
  const spans = samples.map((s) => (s.length >= 2 ? Math.abs(s[0].signed - s[1].signed) : 0));
  assert.ok(Math.max(...spans) - Math.min(...spans) > 0.1, "domain opposition no longer varies across the cycle");
});
