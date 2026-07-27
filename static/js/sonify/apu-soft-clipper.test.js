import assert from "node:assert/strict";
import test from "node:test";

import {
  APU_SOFT_CLIPPER_BUILD_ID,
  APU_SOFT_CLIPPER_STATE_PROFILES,
  tanhCurve,
  quantiseCurve8Bit,
  createSoftClipper,
  setSoftClipperDrive,
  createQuantiser,
  createApuMasterStage,
  masterStageProfileForState,
} from "./apu-soft-clipper.js";

test("build ID is a non-empty string", () => {
  assert.equal(typeof APU_SOFT_CLIPPER_BUILD_ID, "string");
  assert.ok(APU_SOFT_CLIPPER_BUILD_ID.length > 0);
});

test("state profiles increase saturation under pressure", () => {
  assert.ok(APU_SOFT_CLIPPER_STATE_PROFILES.healthy.drive < APU_SOFT_CLIPPER_STATE_PROFILES.warning.drive);
  assert.ok(APU_SOFT_CLIPPER_STATE_PROFILES.warning.drive < APU_SOFT_CLIPPER_STATE_PROFILES.critical.drive);
  assert.ok(
    APU_SOFT_CLIPPER_STATE_PROFILES.healthy.quantiseWet
      < APU_SOFT_CLIPPER_STATE_PROFILES.critical.quantiseWet,
  );
  assert.equal(masterStageProfileForState("healthy"), APU_SOFT_CLIPPER_STATE_PROFILES.healthy);
  assert.equal(masterStageProfileForState("missing"), APU_SOFT_CLIPPER_STATE_PROFILES.unknown);
});

test("tanhCurve returns 8192 samples", () => {
  const curve = tanhCurve(1.5);
  assert.equal(curve.length, 8192);
});

test("tanhCurve is bounded between -1 and +1", () => {
  const curve = tanhCurve(3.0);
  for (let i = 0; i < curve.length; i += 1) {
    assert.ok(curve[i] >= -1, `sample ${i} >= -1`);
    assert.ok(curve[i] <= 1, `sample ${i} <= 1`);
  }
});

test("tanhCurve passes through zero at midpoint", () => {
  const curve = tanhCurve(1.5);
  const mid = Math.floor(curve.length / 2);
  assert.ok(Math.abs(curve[mid]) < 0.01, "midpoint should be near zero");
});

test("tanhCurve is monotonically increasing", () => {
  const curve = tanhCurve(1.5);
  for (let i = 1; i < curve.length; i += 1) {
    assert.ok(curve[i] >= curve[i - 1], `curve[${i}] >= curve[${i - 1}]`);
  }
});

test("higher drive produces more saturation at edges", () => {
  const low = tanhCurve(1.0);
  const high = tanhCurve(3.0);
  // At high drive, the curve should reach closer to +/-1 at 75% position
  const pos = Math.floor(0.75 * low.length);
  assert.ok(high[pos] > low[pos], "higher drive saturates faster");
});

test("tanhCurve handles edge case drive values", () => {
  const veryLow = tanhCurve(0.01);
  assert.equal(veryLow.length, 8192);
  const negative = tanhCurve(-1); // should clamp to 0.1
  assert.equal(negative.length, 8192);
});

test("quantiseCurve8Bit returns 8192 samples", () => {
  const curve = quantiseCurve8Bit();
  assert.equal(curve.length, 8192);
});

test("quantiseCurve8Bit values are discrete steps", () => {
  const curve = quantiseCurve8Bit();
  const uniqueValues = new Set();
  for (const value of curve) {
    uniqueValues.add(value);
  }
  // 256 levels plus zero midpoint = at most 257 unique values
  assert.ok(uniqueValues.size <= 257, `should have at most 257 unique values, got ${uniqueValues.size}`);
  assert.ok(uniqueValues.size > 100, "should have many distinct levels");
});

test("quantiseCurve8Bit is bounded between -1 and +1", () => {
  const curve = quantiseCurve8Bit();
  for (let i = 0; i < curve.length; i += 1) {
    assert.ok(curve[i] >= -1, `sample ${i} >= -1`);
    assert.ok(curve[i] <= 1, `sample ${i} <= 1`);
  }
});

// Stub AudioContext for node creation tests
function stubContext() {
  const nodes = [];
  return {
    nodes,
    createWaveShaper() {
      const node = {
        curve: null,
        oversample: "none",
        connect(target) { return target; },
        disconnect() {},
      };
      nodes.push(node);
      return node;
    },
    createGain() {
      const node = {
        gain: { value: 1, setTargetAtTime() {} },
        connect(target) { return target; },
        disconnect() {},
      };
      nodes.push(node);
      return node;
    },
  };
}

test("createSoftClipper returns a wave shaper with 2x oversample", () => {
  const ctx = stubContext();
  const clipper = createSoftClipper(ctx, 1.5);
  assert.ok(clipper.curve);
  assert.equal(clipper.curve.length, 8192);
  assert.equal(clipper.oversample, "2x");
});

test("setSoftClipperDrive updates the curve", () => {
  const ctx = stubContext();
  const clipper = createSoftClipper(ctx, 1.0);
  const originalCurve = clipper.curve;
  setSoftClipperDrive(clipper, 3.0);
  assert.notEqual(clipper.curve, originalCurve, "curve should be replaced");
});

test("createQuantiser returns a wave shaper with no oversample", () => {
  const ctx = stubContext();
  const quantiser = createQuantiser(ctx);
  assert.ok(quantiser.curve);
  assert.equal(quantiser.oversample, "none");
});

test("createApuMasterStage returns input and output gain nodes", () => {
  const ctx = stubContext();
  const stage = createApuMasterStage(ctx);
  assert.ok(stage.input);
  assert.ok(stage.output);
  assert.equal(typeof stage.setDrive, "function");
  assert.equal(typeof stage.setQuantiseWet, "function");
  assert.equal(typeof stage.dispose, "function");
});

test("createApuMasterStage dispose does not throw", () => {
  const ctx = stubContext();
  const stage = createApuMasterStage(ctx);
  assert.doesNotThrow(() => stage.dispose());
  // Double dispose should also be safe
  assert.doesNotThrow(() => stage.dispose());
});
