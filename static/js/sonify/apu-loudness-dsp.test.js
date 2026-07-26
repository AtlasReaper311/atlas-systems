import assert from "node:assert/strict";
import test from "node:test";

import {
  ITU_REFERENCE_SAMPLE_RATE,
  StereoLoudnessAccumulator,
  TruePeakEstimator,
  gatedIntegratedLoudness,
  kWeightingCoefficients,
  powerToLkfs,
  remapBiquadFrom48k,
} from "./apu-loudness-dsp.js";

function sineBuffer({ frequency = 997, sampleRate = 48000, seconds = 4, amplitude = 1 } = {}) {
  const length = Math.round(sampleRate * seconds);
  return Float32Array.from({ length }, (_, index) => amplitude * Math.sin(2 * Math.PI * frequency * index / sampleRate));
}

function processInQuanta(accumulator, left, right = new Float32Array(left.length), quantum = 128) {
  let latest = null;
  for (let offset = 0; offset < left.length; offset += quantum) {
    latest = accumulator.process(
      left.subarray(offset, offset + quantum),
      right.subarray(offset, offset + quantum),
    ) ?? latest;
  }
  return latest ?? accumulator.lastMetrics;
}

test("published 48 kHz coefficients remain exact at the reference rate", () => {
  const coefficients = kWeightingCoefficients(ITU_REFERENCE_SAMPLE_RATE);
  assert.equal(coefficients.stageOne.b0, 1.53512485958697);
  assert.equal(coefficients.stageOne.a1, -1.69065929318241);
  assert.equal(coefficients.stageTwo.b1, -2);
  assert.equal(coefficients.stageTwo.a2, 0.99007225036621);
});

test("bilinear remapping produces finite stable coefficients for 44.1 kHz", () => {
  const remapped = remapBiquadFrom48k({
    b0: 1.53512485958697,
    b1: -2.69169618940638,
    b2: 1.19839281085285,
    a1: -1.69065929318241,
    a2: 0.73248077421585,
  }, 44100);
  for (const value of Object.values(remapped)) assert.ok(Number.isFinite(value));
  assert.ok(Math.abs(remapped.a2) < 1);
});

test("a full-scale 997 Hz mono sine reads approximately -3.01 LKFS", () => {
  const accumulator = new StereoLoudnessAccumulator(48000);
  const left = sineBuffer();
  const metrics = processInQuanta(accumulator, left);
  assert.ok(Math.abs(metrics.momentaryLufs - (-3.01)) < 0.08, `${metrics.momentaryLufs} LUFS`);
  assert.ok(Math.abs(metrics.integratedLufs - (-3.01)) < 0.08, `${metrics.integratedLufs} LUFS`);
  assert.equal(metrics.ready, true);
  assert.equal(metrics.compliance, "BS.1770-5-aligned");
});

test("sample-rate remapping keeps the 997 Hz reference close at 44.1 kHz", () => {
  const accumulator = new StereoLoudnessAccumulator(44100);
  const left = sineBuffer({ sampleRate: 44100 });
  const metrics = processInQuanta(accumulator, left);
  assert.ok(Math.abs(metrics.integratedLufs - (-3.01)) < 0.15, `${metrics.integratedLufs} LUFS`);
  assert.equal(metrics.compliance, "BS.1770-5-response-remapped");
});

test("integrated loudness applies absolute and relative gates", () => {
  const loud = 10 ** ((-18 + 0.691) / 10);
  const quiet = 10 ** ((-50 + 0.691) / 10);
  const result = gatedIntegratedLoudness([loud, loud, loud, quiet, quiet, 0]);
  assert.ok(Math.abs(result.integratedLufs - (-18)) < 0.001);
  assert.equal(result.absoluteBlockCount, 5);
  assert.equal(result.gatedBlockCount, 3);
  assert.ok(Math.abs(result.relativeGateLufs - (-30.22)) < 0.1);
});

test("silence never becomes a finite programme-loudness claim", () => {
  assert.equal(powerToLkfs(0), Number.NEGATIVE_INFINITY);
  const accumulator = new StereoLoudnessAccumulator(48000);
  const silence = new Float32Array(48000);
  const metrics = processInQuanta(accumulator, silence);
  assert.equal(metrics.momentaryLufs, Number.NEGATIVE_INFINITY);
  assert.equal(metrics.integratedLufs, Number.NEGATIVE_INFINITY);
  assert.equal(metrics.gatedBlockCount, 0);
});

test("four-times cubic interpolation detects an inter-sample overshoot", () => {
  const estimator = new TruePeakEstimator(4);
  for (const sample of [0, 1, 1, 0]) estimator.process(sample);
  assert.ok(estimator.maximum > 1.1);
  assert.ok(estimator.maximum < 1.13);
});

test("gated programme loudness does not collapse during appended silence", () => {
  const accumulator = new StereoLoudnessAccumulator(48000);
  const tone = sineBuffer({ seconds: 2, amplitude: 0.25 });
  const silence = new Float32Array(48000 * 2);
  processInQuanta(accumulator, tone);
  const metrics = processInQuanta(accumulator, silence);
  const expected = -3.01 + 20 * Math.log10(0.25);
  assert.ok(Math.abs(metrics.integratedLufs - expected) < 0.8, `${metrics.integratedLufs} LUFS`);
  assert.ok(metrics.blockCount >= 35);
  assert.ok(metrics.gatedBlockCount > 0);
});
