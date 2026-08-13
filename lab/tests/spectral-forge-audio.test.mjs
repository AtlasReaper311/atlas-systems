import assert from "node:assert/strict";
import test from "node:test";

import {
  MASTER_DEFAULT,
  MASTER_MAX,
  MASTER_MIN,
  OUTPUT_CEILING_DBFS,
  OUTPUT_CEILING_LINEAR,
  createSoftClipCurve,
  linearToDb,
  normaliseTarget,
} from "../../static/js/spectral-forge/audio-engine.js";

test("audio master defaults stay inside bounded user range", () => {
  assert.ok(MASTER_MIN > 0);
  assert.ok(MASTER_DEFAULT > MASTER_MIN);
  assert.ok(MASTER_DEFAULT < MASTER_MAX);
  assert.ok(MASTER_MAX < 1);
});

test("declared sample ceiling is internally consistent", () => {
  assert.equal(OUTPUT_CEILING_DBFS, -1);
  assert.ok(Math.abs(linearToDb(OUTPUT_CEILING_LINEAR) - OUTPUT_CEILING_DBFS) < 1e-9);
});

test("soft clip curve is symmetric and bounded", () => {
  const curve = createSoftClipCurve(1024, 1.35);
  assert.equal(curve.length, 1024);
  assert.ok(curve[0] >= -1 && curve.at(-1) <= 1);
  for (let index = 0; index < curve.length; index += 1) {
    assert.equal(Number.isFinite(curve[index]), true);
    assert.ok(curve[index] >= -1 && curve[index] <= 1);
  }
  assert.ok(Math.abs(curve[0] + curve.at(-1)) < 1e-6);
});

test("target normalisation clamps safely", () => {
  assert.equal(normaliseTarget("stereo_width", 0), 0);
  assert.equal(normaliseTarget("stereo_width", 100), 1);
  assert.equal(normaliseTarget("stereo_width", 150), 1);
  assert.equal(normaliseTarget("filter_cutoff", 180), 0);
  assert.equal(normaliseTarget("filter_cutoff", 8000), 1);
});
