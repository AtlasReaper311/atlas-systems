import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { FIELD_VISUAL_SEED, deterministicUnit } from "../../static/js/spectral-forge/spectral-field-model.js";
import {
  activityFocus,
  anticipateExtent,
  attitudeTarget,
  audioLife,
  cameraOffset,
  CAMERA_DISTANCE,
  createAttitudeState,
  fieldCentre,
  fieldHome,
  fieldLife,
  focusWeight,
  iterateLifeEvents,
  livingGesture,
  MAX_FISSION_DAUGHTERS,
  MAX_CAMERA_DISTANCE,
  mesoDrive,
  MIN_PRESENTATION_SCALE,
  presentationTarget,
  projectedContainment,
  scheduledLifeEvent,
  DEBUG_FISSION_START,
  stepAttitude,
  stepSafeFraming,
  evaluateFission,
  estimateOrganismExtent,
  createSafeFramingState,
  readDebugGesture,
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

function productionSeed(index) {
  const seedPhase = FIELD_VISUAL_SEED * Math.PI * 2;
  return {
    a: deterministicUnit(seedPhase, 1001 + index * 11),
    b: deterministicUnit(seedPhase, 1002 + index * 11),
    c: deterministicUnit(seedPhase, 1003 + index * 11),
    d: deterministicUnit(seedPhase, 1004 + index * 11),
    e: deterministicUnit(seedPhase, 1005 + index * 11),
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

test("production field homes occupy both hemispheres instead of clustering left", () => {
  const homes = Array.from({ length: 7 }, (_, index) => fieldHome(productionSeed(index)));
  const left = homes.filter((home) => home.x < 0).length;
  const right = homes.filter((home) => home.x >= 0).length;
  assert.ok(left >= 2, `too few left homes (${left})`);
  assert.ok(right >= 2, `too few right homes (${right})`);
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
    assert.ok(span > 1.1, `field ${index} did not migrate enough (${span})`);
  }
});

test("activity focus changes dominant hemisphere without a permanent side", () => {
  const seedPhase = FIELD_VISUAL_SEED * Math.PI * 2;
  const xs = [];
  for (let time = 0; time <= 90; time += 0.25) {
    xs.push(activityFocus(time, seedPhase).x);
  }
  let changes = 0;
  let run = 1;
  let longest = 1;
  for (let i = 1; i < xs.length; i += 1) {
    if (Math.sign(xs[i]) !== Math.sign(xs[i - 1]) && xs[i] !== 0 && xs[i - 1] !== 0) {
      changes += 1;
      longest = Math.max(longest, run);
      run = 1;
    } else {
      run += 1;
    }
  }
  longest = Math.max(longest, run);
  assert.ok(changes >= 2, `focus did not change sides enough (${changes})`);
  assert.ok(longest * 0.25 <= 22, `one side stayed dominant too long (${longest * 0.25}s)`);
});

test("hot-side weighting visits both hemispheres over a minute", () => {
  const seedPhase = FIELD_VISUAL_SEED * Math.PI * 2;
  let leftHot = 0;
  let rightHot = 0;
  for (let time = 0; time <= 60; time += 1) {
    const phase = time * 0.35 + seedPhase;
    const focus = activityFocus(time, seedPhase);
    let left = 0;
    let right = 0;
    for (let index = 0; index < 7; index += 1) {
      const centre = fieldCentre(phase, productionSeed(index), 0.42, false);
      const weight = focusWeight(centre, focus);
      if (weight < 0.78) continue;
      if (centre.x < 0) left += 1;
      else right += 1;
    }
    if (left > right) leftHot += 1;
    if (right > left) rightHot += 1;
  }
  assert.ok(leftHot >= 8, `left rarely became the hot side (${leftHot})`);
  assert.ok(rightHot >= 8, `right rarely became the hot side (${rightHot})`);
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

test("healthy folds and blooms are common while near-split stays rare but readable", () => {
  let necked = 0;
  let bloomed = 0;
  let folded = 0;
  let minCohesion = 1;
  for (let step = 0; step < 800; step += 1) {
    const gesture = livingGesture(step * 0.4, 0.9, false, 0.08);
    assert.ok(gesture.cohesion >= 0.16 && gesture.cohesion <= 1);
    minCohesion = Math.min(minCohesion, gesture.cohesion);
    if (gesture.cohesion < 0.62) necked += 1;
    if (gesture.bloom > 0.2) bloomed += 1;
    if (gesture.fold > 0.2) folded += 1;
  }
  assert.ok(necked > 0, "near-split opportunity never occurred");
  assert.ok(necked < 120, "necking is too common for Normal Load");
  assert.ok(bloomed > 0, "peak bloom never occurred");
  assert.ok(folded > 0, "fold never occurred");
  assert.ok(bloomed + folded > necked, "9B events should outnumber 9C near-splits");
  assert.ok(minCohesion < 0.5, `near-split never became readable (${minCohesion})`);
});

test("near-split is a long-horizon rare event rather than a 60s clock trick", () => {
  const seedPhase = FIELD_VISUAL_SEED * Math.PI * 2;
  const rares = iterateLifeEvents("rare", seedPhase, "normal", 400);
  assert.ok(rares.length >= 2, "rare stream ended before a long watch");
  assert.ok(rares[0].start >= 120, `non-fission rare arrived too early (${rares[0].start})`);
  assert.ok(rares[1].start > 180, `second rare is still inside a short loop (${rares[1].start})`);
  const gaps = rares.slice(1).map((event, index) => event.start - rares[index].start);
  assert.ok(gaps.every((gap) => gap > 80), `rare gaps are too regular/short (${gaps.join(", ")})`);
});

test("deterministic event schedule is reproducible and not a repeating 60s table", () => {
  const seedPhase = FIELD_VISUAL_SEED * Math.PI * 2;
  const first = iterateLifeEvents("occasional", seedPhase, "normal", 180).map((event) => [
    event.start,
    event.family,
  ]);
  const second = iterateLifeEvents("occasional", seedPhase, "normal", 180).map((event) => [
    event.start,
    event.family,
  ]);
  assert.deepEqual(first, second);
  const other = iterateLifeEvents("occasional", seedPhase, "cache", 180).map((event) => event.start);
  assert.deepEqual(first.map((entry) => entry[0]), other);
  const mods = first.map(([start]) => Number((start % 60).toFixed(2)));
  const unique = new Set(mods);
  assert.ok(unique.size >= 4, `event starts collapsed onto a 60s table (${[...unique].join(", ")})`);
  const later = scheduledLifeEvent(150, seedPhase, "normal");
  const earlier = scheduledLifeEvent(20, seedPhase, "normal");
  if (later && earlier) assert.notEqual(later.start, earlier.start);
});

test("audio mix changes expression without replacing oscillator identity", () => {
  assert.equal(audioLife(0).recruit, 0);
  assert.equal(audioLife(1).recruit, 1);
  assert.equal(audioLife(true).ridge, 1);
  const off = fieldLife(8.2, seed(1), { displacement: 0.4 }, 0.12, 0, livingGesture(8.2, 0.4, 0, 0.12));
  const on = fieldLife(8.2, seed(1), { displacement: 0.4 }, 0.12, 1, livingGesture(8.2, 0.4, 1, 0.12));
  assert.equal(off.waveRate, on.waveRate);
  assert.ok(on.crestScale >= off.crestScale);
  assert.equal(Number.isFinite(off.polarity), true);
  assert.equal(Number.isFinite(on.polarity), true);
  const offDrive = mesoDrive(8.2, 0.4, 0, { fold: 0 });
  const onDrive = mesoDrive(8.2, 0.4, 1, { fold: 0 });
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
  assert.match(pbr, /fill\.position\.set\(3\.8, 4\.4, 5\.1\)/);
  assert.match(pbr, /audioEnergy\.value = 1/);
  assert.match(pbr, /visual-fission-coherent-daughters/);
  assert.doesNotMatch(pbr, /g\.phase \* \(0\.31 \+ a \* 0\.24/);
  assert.doesNotMatch(shader, /uAtlasPhase \* \(0\.18 \+ jf \* 0\.021\)/);
  assert.doesNotMatch(shader, /float spin = uAtlasPhase \*/);
  assert.doesNotMatch(shader, /signedEnergy \* 1\.14 \* mix\(1\.0, uAtlasAudioEnergy/);
  assert.match(shader, /uAtlasLifeA/);
  assert.match(shader, /uAtlasLifeB/);
  assert.match(shader, /uAtlasNeckAxis/);
  assert.match(shader, /continuous-surface/);
  assert.match(shader, /atlas-spectral-forge-final-form-gpu-v5/);
  assert.doesNotMatch(shader, /float gather = atlasSat\(uAtlasFission/);
  assert.match(shader, /step\(2\.5, jf\)/);
  assert.match(pbr, /sharedLifeHost/);
  assert.match(pbr, /organismLife/);
});

test("macro fission is a substantial scheduled event, not a satellite", () => {
  const seedPhase = FIELD_VISUAL_SEED * Math.PI * 2;
  const events = iterateLifeEvents("fission", seedPhase, "normal", 900);
  assert.ok(events.length >= 2, "fission stream ended too early");
  assert.ok(events[0].start >= 60 && events[0].start <= 100, `first Normal fission is not reviewable (${events[0].start})`);
  assert.ok(events[1].start - events[0].start > 150, `later fission is still frequent (${events[1].start - events[0].start})`);
  assert.ok(events.every((event) => event.count >= 1 && event.count <= MAX_FISSION_DAUGHTERS));
  assert.ok(events[0].primaryScale >= 0.24, `daughter is still satellite-scale (${events[0].primaryScale})`);
  const other = iterateLifeEvents("fission", seedPhase, "cache", 200);
  assert.equal(events[0].start, other[0].start);
  assert.equal(events[0].count, other[0].count);
  const again = iterateLifeEvents("fission", seedPhase, "normal", 200);
  assert.equal(again[0].start, events[0].start);
  assert.equal(again[0].count, events[0].count);
});

test("fission child state persists through separation and rejoin", () => {
  const seedPhase = FIELD_VISUAL_SEED * Math.PI * 2;
  // Scheduled fission is no longer part of healthy life, so the retained
  // prototype path is what still exercises the separation/rejoin geometry.
  const spec = iterateLifeEvents("fission", seedPhase, "normal", 120)[0];
  const event = { start: DEBUG_FISSION_START, duration: spec.duration, end: DEBUG_FISSION_START + spec.duration };
  const phases = [];
  let sawIndependent = false;
  let sawContained = false;
  let previousProgress = -1;
  for (let time = event.start; time <= event.end; time += 0.25) {
    const fission = evaluateFission(time, seedPhase, "normal", "fission");
    assert.equal(fission.active, true);
    assert.ok(fission.progress >= previousProgress);
    previousProgress = fission.progress;
    assert.ok(fission.count >= 1 && fission.count <= MAX_FISSION_DAUGHTERS);
    if (fission.phase !== phases.at(-1)) phases.push(fission.phase);
    const daughter = fission.daughters[0];
    if (daughter?.independent) sawIndependent = true;
    if (fission.progress > 0.96 && (!daughter || daughter.contained || daughter.scale < 0.02)) sawContained = true;
  }
  assert.ok(phases.includes("gather") || phases.includes("lobe"));
  assert.ok(phases.includes("neck") || phases.includes("pinch"));
  assert.ok(phases.includes("independent") || phases.includes("detach"));
  assert.ok(phases.includes("return") || phases.includes("contact") || phases.includes("pour"));
  assert.ok(sawIndependent, "daughter never became independent");
  assert.ok(sawContained, "daughter never rejoined");
  const before = evaluateFission(event.start - 1, seedPhase, "normal", "fission");
  const after = evaluateFission(event.end + 1, seedPhase, "normal", "fission");
  assert.equal(before.active, false);
  assert.equal(after.active, false);
});

test("audio and mode-style inputs do not reset a living fission event", () => {
  const seedPhase = FIELD_VISUAL_SEED * Math.PI * 2;
  const spec = iterateLifeEvents("fission", seedPhase, "normal", 120)[0];
  const mid = DEBUG_FISSION_START + spec.duration * 0.5;
  const off = livingGesture(mid * 0.35, seedPhase, 0, 0.08, mid, "normal", "fission");
  const on = livingGesture(mid * 0.35, seedPhase, 1, 0.08, mid, "normal", "fission");
  assert.equal(off.fission.start, on.fission.start);
  assert.equal(off.fission.count, on.fission.count);
  assert.equal(off.fission.axis.x, on.fission.axis.x);
  assert.equal(off.fission.daughters[0].distance, on.fission.daughters[0].distance);
  const forgeView = evaluateFission(mid, seedPhase, "normal", "fission");
  const analyseView = evaluateFission(mid, seedPhase, "normal", "fission");
  assert.deepEqual(forgeView.daughters, analyseView.daughters);
  assert.equal(readDebugGesture("?proto=flagship-final-form&debug-gesture=fission"), "fission");
  const debug = evaluateFission(8, seedPhase, "normal", "fission");
  assert.equal(debug.debug, true);
  assert.equal(debug.active, true);
  assert.ok(debug.start < 60);
});

test("safe-framing target stays bounded and only eases outward when extent grows", () => {
  const framing = createSafeFramingState();
  stepSafeFraming(framing, 1.05, 1);
  const rest = framing.distance;
  const restScale = framing.scale;
  assert.ok(rest >= CAMERA_DISTANCE && rest <= CAMERA_DISTANCE + 0.08);
  assert.equal(restScale, 1);
  for (let step = 0; step < 40; step += 1) {
    stepSafeFraming(framing, 1.85, 1 + step * 0.016);
  }
  assert.ok(framing.distance > rest);
  assert.ok(framing.distance <= MAX_CAMERA_DISTANCE + 1e-6);
  assert.ok(framing.scale < restScale);
  assert.ok(framing.scale >= MIN_PRESENTATION_SCALE);
  assert.ok(framing.maxExtent >= 1.85);
  const gesture = livingGesture(12, 1.1, false, 0.1, 12, "normal");
  const extent = estimateOrganismExtent(gesture, gesture.fission, 0.5);
  assert.ok(extent > 0.8 && extent < 3.2);
});

test("fission and peak projected extent stay inside the presentation envelope", () => {
  const seedPhase = FIELD_VISUAL_SEED * Math.PI * 2;
  const spec = iterateLifeEvents("fission", seedPhase, "normal", 120)[0];
  const event = { start: DEBUG_FISSION_START, duration: spec.duration, end: DEBUG_FISSION_START + spec.duration };
  const gatherTime = event.start + 0.4;
  const gather = evaluateFission(gatherTime, seedPhase, "cascade", "fission");
  assert.equal(gather.active, true);
  assert.ok(gather.lookahead > gather.extent, "framing must look ahead of the current daughter");
  const gatherGesture = livingGesture(gatherTime * 0.35, seedPhase, 0, 0.12, gatherTime, "cache", "fission");
  assert.equal(gatherGesture.fission.start, gather.start);
  const anticipated = anticipateExtent(gatherGesture, gatherGesture.fission, 0.7);
  assert.ok(anticipated >= estimateOrganismExtent(gatherGesture, gatherGesture.fission, 0.7));

  const framing = createSafeFramingState();
  stepSafeFraming(framing, 1.1, 0);
  const expandTimes = [];
  for (let time = event.start; time <= event.start + event.duration * 0.7; time += 0.05) {
    const fission = evaluateFission(time, seedPhase, "traffic", "fission");
    const gesture = livingGesture(time * 0.35, seedPhase, 0, 0.2, time, "traffic", "fission");
    const extent = estimateOrganismExtent(gesture, fission, 0.8);
    const lookahead = anticipateExtent(gesture, fission, 0.8);
    stepSafeFraming(framing, extent, time, lookahead, 1.7);
    expandTimes.push({ extent, lookahead, scale: framing.scale, distance: framing.distance });
  }
  const peak = expandTimes.reduce((best, sample) => (sample.extent > best.extent ? sample : best));
  const settled = projectedContainment(peak.extent, framing, 1.7);
  const unframed = projectedContainment(peak.extent, { scale: 1, distance: CAMERA_DISTANCE }, 1.7);
  assert.ok(settled.apparent < unframed.apparent, "presentation envelope must shrink apparent fission extent");
  assert.ok(settled.contained, `peak fission still overflows rest composition (${settled.ratio})`);
  assert.ok(framing.distance <= MAX_CAMERA_DISTANCE + 1e-6);
  assert.ok(framing.scale >= MIN_PRESENTATION_SCALE);

  const afterExpand = framing.distance;
  const afterScale = framing.scale;
  for (let step = 0; step < 12; step += 1) {
    stepSafeFraming(framing, 1.1, event.end + step * 0.016, 1.1, 1.7);
  }
  const earlyRecoverDistance = afterExpand - framing.distance;
  const earlyRecoverScale = framing.scale - afterScale;
  const expandFraming = createSafeFramingState();
  stepSafeFraming(expandFraming, 1.1, 0);
  for (let step = 0; step < 12; step += 1) {
    stepSafeFraming(expandFraming, peak.extent, step * 0.016, peak.lookahead, 1.7);
  }
  const expandDistance = expandFraming.distance - CAMERA_DISTANCE;
  const expandScale = 1 - expandFraming.scale;
  assert.ok(expandDistance > earlyRecoverDistance, "recovery must be slower than expansion");
  assert.ok(expandScale > earlyRecoverScale);

  const peakTarget = presentationTarget(1.42, 1.7);
  assert.ok(peakTarget.scale <= 1);
  assert.ok(peakTarget.distance >= CAMERA_DISTANCE);
});
