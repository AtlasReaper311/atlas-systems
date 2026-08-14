import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  attitudeTarget,
  cameraOffset,
  createAttitudeState,
  fieldCentre,
  fieldLife,
  livingGesture,
  mesoDrive,
  stepAttitude,
} from "../../static/js/spectral-forge/prototypes/field-proto-flagship-final-form-life.js";

const SOURCE_URL = new URL(
  "../../static/js/spectral-forge/prototypes/field-proto-flagship-final-form-life.js",
  import.meta.url,
);
const PBR_URL = new URL(
  "../../static/js/spectral-forge/prototypes/field-proto-flagship-final-form-pbr.js",
  import.meta.url,
);
const SHADER_URL = new URL(
  "../../static/js/spectral-forge/prototypes/field-proto-flagship-final-form-shader.js",
  import.meta.url,
);

function seed(index) {
  return {
    a: (index * 0.17 + 0.11) % 1,
    b: (index * 0.29 + 0.23) % 1,
    c: (index * 0.41 + 0.37) % 1,
    d: (index * 0.53 + 0.43) % 1,
    e: (index * 0.67 + 0.59) % 1,
    index,
  };
}

function unwrapAzimuth(series) {
  const out = [];
  let previous = series[0] ?? 0;
  let offset = 0;
  for (const value of series) {
    let delta = value - previous;
    if (delta > Math.PI) offset -= Math.PI * 2;
    if (delta < -Math.PI) offset += Math.PI * 2;
    out.push(value + offset);
    previous = value;
  }
  return out;
}

function signChanges(series) {
  let changes = 0;
  for (let i = 1; i < series.length; i += 1) {
    const delta = series[i] - series[i - 1];
    const prev = series[i - 1] - (series[i - 2] ?? series[i - 1]);
    if (delta === 0 || prev === 0) continue;
    if (Math.sign(delta) !== Math.sign(prev)) changes += 1;
  }
  return changes;
}

test("final-form life helpers stay deterministic and free of per-frame randomness", async () => {
  const source = await readFile(SOURCE_URL, "utf8");
  assert.doesNotMatch(source, /Math\.random\s*\(/);
  const first = fieldCentre(12.5, seed(2), 0.4, false);
  const second = fieldCentre(12.5, seed(2), 0.4, false);
  assert.deepEqual(first, second);
});

test("field centres wander without a shared monotonic spin", () => {
  const azimuths = Array.from({ length: 7 }, () => []);
  for (let step = 0; step < 240; step += 1) {
    const phase = step * 0.35;
    for (let index = 0; index < 7; index += 1) {
      const centre = fieldCentre(phase, seed(index), 0.42, false);
      azimuths[index].push(Math.atan2(centre.z, centre.x));
    }
  }
  for (let index = 0; index < 7; index += 1) {
    const unwrapped = unwrapAzimuth(azimuths[index]);
    const net = unwrapped.at(-1) - unwrapped[0];
    assert.ok(Math.abs(net) < Math.PI * 1.15, `field ${index} accumulated too much yaw (${net})`);
    assert.ok(signChanges(unwrapped) >= 2, `field ${index} never reversed`);
    const span = Math.max(...unwrapped) - Math.min(...unwrapped);
    assert.ok(span > 0.7, `field ${index} did not migrate enough (${span})`);
  }
});

test("bounded attitude wanders, settles, and stays far from a turntable orbit", () => {
  const state = createAttitudeState();
  const yaws = [];
  for (let step = 0; step < 180; step += 1) {
    const phase = step * 0.28;
    const visualTime = step * 0.05;
    const target = attitudeTarget(phase, { x: 0.2, y: -0.1, z: 0.15 }, 0.04, -0.03, 1.4);
    stepAttitude(state, target, visualTime);
    assert.ok(Math.abs(state.y) < 0.3);
    assert.ok(Math.abs(state.x) < 0.3);
    yaws.push(state.y);
  }
  assert.ok(signChanges(yaws) >= 2);
  assert.ok(Math.abs(yaws.at(-1) - yaws[0]) < 0.5);
});

test("rare healthy gestures usually keep cohesion high and only occasionally neck", () => {
  let necked = 0;
  let bloomed = 0;
  for (let step = 0; step < 400; step += 1) {
    const gesture = livingGesture(step * 0.4, 0.9, false, 0.08);
    assert.ok(gesture.cohesion >= 0.28 && gesture.cohesion <= 1);
    if (gesture.cohesion < 0.72) necked += 1;
    if (gesture.bloom > 0.2) bloomed += 1;
  }
  assert.ok(necked > 0, "near-split opportunity never occurred");
  assert.ok(necked < 80, "necking is too common for Normal Load");
  assert.ok(bloomed > 0, "peak bloom never occurred");
});

test("audio on changes cadence helpers without replacing organism identity", () => {
  const off = fieldLife(8.2, seed(1), { displacement: 0.4 }, 0.12, false, livingGesture(8.2, 0.4, false, 0.12));
  const on = fieldLife(8.2, seed(1), { displacement: 0.4 }, 0.12, true, livingGesture(8.2, 0.4, true, 0.12));
  assert.notEqual(off.waveRate, on.waveRate);
  assert.ok(on.waveRate > off.waveRate);
  assert.equal(Number.isFinite(off.polarity), true);
  assert.equal(Number.isFinite(on.polarity), true);
  const offDrive = mesoDrive(8.2, 0.4, false, { fold: 0 });
  const onDrive = mesoDrive(8.2, 0.4, true, { fold: 0 });
  assert.notEqual(offDrive.w, onDrive.w);
});

test("camera offset stays tiny and does not orbit", () => {
  const samples = Array.from({ length: 80 }, (_, step) => cameraOffset(step * 0.5, 1.1));
  for (const sample of samples) {
    assert.ok(Math.abs(sample.x) < 0.05);
    assert.ok(Math.abs(sample.y - 0.02) < 0.03);
    assert.ok(Math.abs(sample.z - 4.42) < 0.03);
  }
});

test("final-form sources keep the continuous-surface architecture and avoid a new spin term", async () => {
  const pbr = await readFile(PBR_URL, "utf8");
  const shader = await readFile(SHADER_URL, "utf8");
  assert.match(pbr, /field-proto-flagship-final-form-life\.js/);
  assert.match(pbr, /architecture: "gpu-final-form"/);
  assert.match(pbr, /continuous-shader-surface-peaks/);
  assert.doesNotMatch(pbr, /g\.phase \* \(0\.31 \+ a \* 0\.24/);
  assert.doesNotMatch(shader, /uAtlasPhase \* \(0\.18 \+ jf \* 0\.021\)/);
  assert.doesNotMatch(shader, /float spin = uAtlasPhase \*/);
  assert.match(shader, /uAtlasLifeA/);
  assert.match(shader, /uAtlasNeckAxis/);
  assert.match(shader, /continuous-surface/);
});
