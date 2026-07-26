"use strict";

// AudioWorklet modules are served through a blob-backed loader in the current
// Tone.js/browser path. Keep this processor self-contained: static imports can
// be parsed as classic-script content by that loader and fail before the audio
// thread starts. The pure, unit-tested authority remains apu-loudness-dsp.js.

const APU_LOUDNESS_DSP_BUILD_ID = "20260726-system-symphony-loudness-dsp-v1";
const PROCESSOR_NAME = "atlas-apu-loudness-meter";
const ITU_REFERENCE_SAMPLE_RATE = 48000;
const LOUDNESS_OFFSET_LKFS = -0.691;
const ABSOLUTE_GATE_LKFS = -70;
const RELATIVE_GATE_DB = -10;
const MOMENTARY_WINDOW_SECONDS = 0.4;
const SHORT_TERM_WINDOW_SECONDS = 3;
const GATING_STEP_SECONDS = 0.1;
const TRUE_PEAK_OVERSAMPLE = 4;

const STAGE_ONE_REFERENCE = Object.freeze({
  b0: 1.53512485958697,
  b1: -2.69169618940638,
  b2: 1.19839281085285,
  a1: -1.69065929318241,
  a2: 0.73248077421585,
});

const STAGE_TWO_REFERENCE = Object.freeze({
  b0: 1,
  b1: -2,
  b2: 1,
  a1: -1.99004745483398,
  a2: 0.99007225036621,
});

function finitePositive(value, fallback) {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function powerToLkfs(power) {
  return Number.isFinite(power) && power > 0
    ? LOUDNESS_OFFSET_LKFS + 10 * Math.log10(power)
    : Number.NEGATIVE_INFINITY;
}

function amplitudeToDb(value) {
  const magnitude = Math.abs(Number(value));
  return Number.isFinite(magnitude) && magnitude > 0
    ? 20 * Math.log10(magnitude)
    : Number.NEGATIVE_INFINITY;
}

function remapBiquadFrom48k(reference, targetSampleRate = ITU_REFERENCE_SAMPLE_RATE) {
  const targetRate = finitePositive(targetSampleRate, ITU_REFERENCE_SAMPLE_RATE);
  if (Math.abs(targetRate - ITU_REFERENCE_SAMPLE_RATE) < 1e-9) return Object.freeze({ ...reference });

  const sourceK = 2 * ITU_REFERENCE_SAMPLE_RATE;
  const b0 = Number(reference.b0);
  const b1 = Number(reference.b1);
  const b2 = Number(reference.b2);
  const a1 = Number(reference.a1);
  const a2 = Number(reference.a2);

  const analogueB0 = sourceK * sourceK * (b0 + b1 + b2);
  const analogueB1 = sourceK * (2 * b0 - 2 * b2);
  const analogueB2 = b0 - b1 + b2;
  const analogueA0 = sourceK * sourceK * (1 + a1 + a2);
  const analogueA1 = sourceK * (2 - 2 * a2);
  const analogueA2 = 1 - a1 + a2;

  const targetK = 2 * targetRate;
  const numerator0 = analogueB0 + analogueB1 * targetK + analogueB2 * targetK * targetK;
  const numerator1 = 2 * analogueB0 - 2 * analogueB2 * targetK * targetK;
  const numerator2 = analogueB0 - analogueB1 * targetK + analogueB2 * targetK * targetK;
  const denominator0 = analogueA0 + analogueA1 * targetK + analogueA2 * targetK * targetK;
  const denominator1 = 2 * analogueA0 - 2 * analogueA2 * targetK * targetK;
  const denominator2 = analogueA0 - analogueA1 * targetK + analogueA2 * targetK * targetK;

  return Object.freeze({
    b0: numerator0 / denominator0,
    b1: numerator1 / denominator0,
    b2: numerator2 / denominator0,
    a1: denominator1 / denominator0,
    a2: denominator2 / denominator0,
  });
}

function kWeightingCoefficients(targetSampleRate = ITU_REFERENCE_SAMPLE_RATE) {
  return Object.freeze({
    stageOne: remapBiquadFrom48k(STAGE_ONE_REFERENCE, targetSampleRate),
    stageTwo: remapBiquadFrom48k(STAGE_TWO_REFERENCE, targetSampleRate),
  });
}

class BiquadFilterState {
  constructor(coefficients) {
    this.coefficients = coefficients;
    this.x1 = 0;
    this.x2 = 0;
    this.y1 = 0;
    this.y2 = 0;
  }

  process(sample) {
    const input = Number.isFinite(sample) ? sample : 0;
    const { b0, b1, b2, a1, a2 } = this.coefficients;
    const output = b0 * input + b1 * this.x1 + b2 * this.x2 - a1 * this.y1 - a2 * this.y2;
    this.x2 = this.x1;
    this.x1 = input;
    this.y2 = this.y1;
    this.y1 = Number.isFinite(output) ? output : 0;
    return this.y1;
  }

  reset() {
    this.x1 = 0;
    this.x2 = 0;
    this.y1 = 0;
    this.y2 = 0;
  }
}

class KWeightingFilter {
  constructor(targetSampleRate = ITU_REFERENCE_SAMPLE_RATE) {
    const coefficients = kWeightingCoefficients(targetSampleRate);
    this.stageOne = new BiquadFilterState(coefficients.stageOne);
    this.stageTwo = new BiquadFilterState(coefficients.stageTwo);
  }

  process(sample) {
    return this.stageTwo.process(this.stageOne.process(sample));
  }

  reset() {
    this.stageOne.reset();
    this.stageTwo.reset();
  }
}

function gatedIntegratedLoudness(blockPowers = []) {
  const valid = blockPowers.filter((power) => Number.isFinite(power) && power > 0);
  if (!valid.length) {
    return Object.freeze({
      integratedLufs: Number.NEGATIVE_INFINITY,
      relativeGateLufs: Number.NEGATIVE_INFINITY,
      gatedBlockCount: 0,
    });
  }

  const absolute = valid.filter((power) => powerToLkfs(power) > ABSOLUTE_GATE_LKFS);
  if (!absolute.length) {
    return Object.freeze({
      integratedLufs: Number.NEGATIVE_INFINITY,
      relativeGateLufs: Number.NEGATIVE_INFINITY,
      gatedBlockCount: 0,
    });
  }

  const absoluteMean = absolute.reduce((sum, power) => sum + power, 0) / absolute.length;
  const relativeGateLufs = powerToLkfs(absoluteMean) + RELATIVE_GATE_DB;
  const gated = absolute.filter((power) => powerToLkfs(power) > relativeGateLufs);
  if (!gated.length) {
    return Object.freeze({
      integratedLufs: Number.NEGATIVE_INFINITY,
      relativeGateLufs,
      gatedBlockCount: 0,
    });
  }

  const gatedMean = gated.reduce((sum, power) => sum + power, 0) / gated.length;
  return Object.freeze({
    integratedLufs: powerToLkfs(gatedMean),
    relativeGateLufs,
    gatedBlockCount: gated.length,
  });
}

function catmullRom(p0, p1, p2, p3, fraction) {
  const t = fraction;
  const t2 = t * t;
  const t3 = t2 * t;
  return 0.5 * (
    2 * p1
    + (-p0 + p2) * t
    + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2
    + (-p0 + 3 * p1 - 3 * p2 + p3) * t3
  );
}

class TruePeakEstimator {
  constructor(oversample = TRUE_PEAK_OVERSAMPLE) {
    this.oversample = Math.max(2, Math.trunc(oversample) || TRUE_PEAK_OVERSAMPLE);
    this.history = [0, 0, 0];
    this.maximum = 0;
    this.windowMaximum = 0;
  }

  process(sample) {
    const next = Number.isFinite(sample) ? sample : 0;
    const [p0, p1, p2] = this.history;
    this.maximum = Math.max(this.maximum, Math.abs(next));
    this.windowMaximum = Math.max(this.windowMaximum, Math.abs(next));
    for (let index = 1; index < this.oversample; index += 1) {
      const interpolated = catmullRom(p0, p1, p2, next, index / this.oversample);
      const magnitude = Math.abs(interpolated);
      this.maximum = Math.max(this.maximum, magnitude);
      this.windowMaximum = Math.max(this.windowMaximum, magnitude);
    }
    this.history = [p1, p2, next];
  }

  takeWindowMaximum() {
    const value = this.windowMaximum;
    this.windowMaximum = 0;
    return value;
  }

  reset() {
    this.history = [0, 0, 0];
    this.maximum = 0;
    this.windowMaximum = 0;
  }
}

class StereoLoudnessAccumulator {
  constructor(targetSampleRate = ITU_REFERENCE_SAMPLE_RATE, { maxBlockHistory = 216000 } = {}) {
    this.sampleRate = finitePositive(targetSampleRate, ITU_REFERENCE_SAMPLE_RATE);
    this.momentarySamples = Math.max(1, Math.round(this.sampleRate * MOMENTARY_WINDOW_SECONDS));
    this.shortTermSamples = Math.max(this.momentarySamples, Math.round(this.sampleRate * SHORT_TERM_WINDOW_SECONDS));
    this.stepSamples = Math.max(1, Math.round(this.sampleRate * GATING_STEP_SECONDS));
    this.energyRing = new Float64Array(this.shortTermSamples);
    this.rawPeakRing = new Float32Array(this.momentarySamples);
    this.energyCursor = 0;
    this.rawPeakCursor = 0;
    this.energyCount = 0;
    this.rawPeakCount = 0;
    this.momentaryEnergy = 0;
    this.shortTermEnergy = 0;
    this.samplesUntilReport = this.stepSamples;
    this.blockPowers = [];
    this.maxBlockHistory = Math.max(100, Math.trunc(maxBlockHistory) || 216000);
    this.leftFilter = new KWeightingFilter(this.sampleRate);
    this.rightFilter = new KWeightingFilter(this.sampleRate);
    this.leftTruePeak = new TruePeakEstimator();
    this.rightTruePeak = new TruePeakEstimator();
  }

  pushEnergy(energy) {
    const outgoingShort = this.energyCount >= this.shortTermSamples
      ? this.energyRing[this.energyCursor]
      : 0;
    const momentaryOutgoingIndex = (
      this.energyCursor - this.momentarySamples + this.shortTermSamples
    ) % this.shortTermSamples;
    const outgoingMomentary = this.energyCount >= this.momentarySamples
      ? this.energyRing[momentaryOutgoingIndex]
      : 0;

    this.energyRing[this.energyCursor] = energy;
    this.energyCursor = (this.energyCursor + 1) % this.shortTermSamples;
    this.energyCount += 1;
    this.shortTermEnergy += energy - outgoingShort;
    this.momentaryEnergy += energy - outgoingMomentary;
  }

  pushRawPeak(peak) {
    this.rawPeakRing[this.rawPeakCursor] = peak;
    this.rawPeakCursor = (this.rawPeakCursor + 1) % this.momentarySamples;
    this.rawPeakCount += 1;
  }

  currentSamplePeak() {
    const count = Math.min(this.rawPeakCount, this.momentarySamples);
    let maximum = 0;
    for (let index = 0; index < count; index += 1) maximum = Math.max(maximum, this.rawPeakRing[index]);
    return maximum;
  }

  report() {
    const momentaryCount = Math.min(this.energyCount, this.momentarySamples);
    const shortTermCount = Math.min(this.energyCount, this.shortTermSamples);
    const momentaryPower = momentaryCount ? this.momentaryEnergy / momentaryCount : 0;
    const shortTermPower = shortTermCount ? this.shortTermEnergy / shortTermCount : 0;

    if (this.energyCount >= this.momentarySamples) {
      this.blockPowers.push(momentaryPower);
      if (this.blockPowers.length > this.maxBlockHistory) {
        this.blockPowers.splice(0, this.blockPowers.length - this.maxBlockHistory);
      }
    }

    const integrated = gatedIntegratedLoudness(this.blockPowers);
    const windowTruePeak = Math.max(
      this.leftTruePeak.takeWindowMaximum(),
      this.rightTruePeak.takeWindowMaximum(),
    );
    const sessionTruePeak = Math.max(this.leftTruePeak.maximum, this.rightTruePeak.maximum);

    return Object.freeze({
      buildId: APU_LOUDNESS_DSP_BUILD_ID,
      sampleRate: this.sampleRate,
      momentaryLufs: powerToLkfs(momentaryPower),
      shortTermLufs: powerToLkfs(shortTermPower),
      integratedLufs: integrated.integratedLufs,
      samplePeakDbfs: amplitudeToDb(this.currentSamplePeak()),
      truePeakDbtp: amplitudeToDb(windowTruePeak),
      sessionTruePeakDbtp: amplitudeToDb(sessionTruePeak),
      relativeGateLufs: integrated.relativeGateLufs,
      blockCount: this.blockPowers.length,
      gatedBlockCount: integrated.gatedBlockCount,
      ready: this.energyCount >= this.momentarySamples,
      truePeakMethod: "4x-cubic-estimate",
      compliance: this.sampleRate === ITU_REFERENCE_SAMPLE_RATE
        ? "BS.1770-5-aligned"
        : "BS.1770-5-response-remapped",
    });
  }

  process(left = [], right = left) {
    const length = Math.max(left?.length ?? 0, right?.length ?? 0);
    let latest = null;
    for (let index = 0; index < length; index += 1) {
      const leftSample = Number(left?.[index] ?? 0);
      const rightSample = Number(right?.[index] ?? leftSample);
      const weightedLeft = this.leftFilter.process(leftSample);
      const weightedRight = this.rightFilter.process(rightSample);
      this.pushEnergy(weightedLeft * weightedLeft + weightedRight * weightedRight);
      this.pushRawPeak(Math.max(Math.abs(leftSample), Math.abs(rightSample)));
      this.leftTruePeak.process(leftSample);
      this.rightTruePeak.process(rightSample);
      this.samplesUntilReport -= 1;
      if (this.samplesUntilReport <= 0) {
        this.samplesUntilReport += this.stepSamples;
        latest = this.report();
      }
    }
    return latest;
  }

  reset() {
    this.energyRing.fill(0);
    this.rawPeakRing.fill(0);
    this.energyCursor = 0;
    this.rawPeakCursor = 0;
    this.energyCount = 0;
    this.rawPeakCount = 0;
    this.momentaryEnergy = 0;
    this.shortTermEnergy = 0;
    this.samplesUntilReport = this.stepSamples;
    this.blockPowers.length = 0;
    this.leftFilter.reset();
    this.rightFilter.reset();
    this.leftTruePeak.reset();
    this.rightTruePeak.reset();
  }
}

class AtlasApuLoudnessProcessor extends AudioWorkletProcessor {
  constructor(options = {}) {
    super();
    const processorOptions = options.processorOptions ?? {};
    this.accumulator = new StereoLoudnessAccumulator(sampleRate, {
      maxBlockHistory: processorOptions.maxBlockHistory,
    });
    this.failed = false;
    this.port.onmessage = (event) => {
      if (event.data?.type === "reset") this.accumulator.reset();
    };
    this.port.postMessage({
      type: "ready",
      buildId: APU_LOUDNESS_DSP_BUILD_ID,
      sampleRate,
    });
  }

  process(inputs) {
    if (this.failed) return false;
    try {
      const input = inputs[0];
      if (!input?.length) return true;
      const left = input[0] ?? [];
      const right = input[1] ?? left;
      const metrics = this.accumulator.process(left, right);
      if (metrics) this.port.postMessage({ type: "metrics", metrics });
      return true;
    } catch (error) {
      this.failed = true;
      this.port.postMessage({
        type: "error",
        message: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }
}

registerProcessor(PROCESSOR_NAME, AtlasApuLoudnessProcessor);
