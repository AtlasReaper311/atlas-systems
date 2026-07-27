import assert from "node:assert/strict";
import test from "node:test";

import {
  APU_CHIP_OSCILLATORS_BUILD_ID,
  createPulseWave,
  createPulseDutyCycles,
  createStaircaseTriangle,
  createVrc6Sawtooth,
  createLfsrNoiseBuffer,
  createLfsrNoiseBuffers,
  pulseWaveForDutyCycle,
  flushChipCache,
} from "./apu-chip-oscillators.js";

// Minimal AudioContext stub for testing waveform generation
function stubContext() {
  const waves = [];
  const buffers = [];
  return {
    waves,
    buffers,
    createPeriodicWave(real, imag, options) {
      const wave = Object.freeze({ real: Float32Array.from(real), imag: Float32Array.from(imag), options });
      waves.push(wave);
      return wave;
    },
    createBuffer(channels, length, sampleRate) {
      const data = new Float32Array(length);
      const buffer = Object.freeze({
        numberOfChannels: channels,
        length,
        sampleRate,
        getChannelData() { return data; },
        _data: data,
      });
      buffers.push(buffer);
      return buffer;
    },
  };
}

test("build ID is a non-empty string", () => {
  assert.equal(typeof APU_CHIP_OSCILLATORS_BUILD_ID, "string");
  assert.ok(APU_CHIP_OSCILLATORS_BUILD_ID.length > 0);
});

test("createPulseWave returns a periodic wave with correct harmonic count", () => {
  const ctx = stubContext();
  const wave = createPulseWave(ctx, 0.5);
  assert.ok(wave);
  assert.equal(wave.real.length, 65); // 64 harmonics + DC
  assert.equal(wave.imag.length, 65);
});

test("createPulseWave caches per context and duty cycle", () => {
  const ctx = stubContext();
  const a = createPulseWave(ctx, 0.25);
  const b = createPulseWave(ctx, 0.25);
  assert.equal(a, b, "same duty cycle should return cached wave");

  const c = createPulseWave(ctx, 0.5);
  assert.notEqual(a, c, "different duty cycle should return new wave");

  flushChipCache(ctx);
  const d = createPulseWave(ctx, 0.25);
  assert.notEqual(a, d, "flushed cache should produce new wave");
});

test("pulse wave DC component is zero", () => {
  const ctx = stubContext();
  createPulseWave(ctx, 0.125);
  assert.equal(ctx.waves[0].real[0], 0);
  assert.equal(ctx.waves[0].imag[0], 0);
});

test("50% pulse wave has non-zero odd harmonics only", () => {
  const ctx = stubContext();
  createPulseWave(ctx, 0.5);
  const imag = ctx.waves[0].imag;
  // For 50% duty (square wave), sin(n * pi * 0.5) = 0 for even n
  for (let n = 2; n <= 64; n += 2) {
    assert.ok(Math.abs(imag[n]) < 1e-10, `even harmonic ${n} should be near zero`);
  }
  // Odd harmonics should be non-zero
  assert.ok(Math.abs(imag[1]) > 0.1);
  assert.ok(Math.abs(imag[3]) > 0.01);
});

test("createPulseDutyCycles returns all three variants", () => {
  const ctx = stubContext();
  const pulses = createPulseDutyCycles(ctx);
  assert.ok(pulses.narrow);
  assert.ok(pulses.hollow);
  assert.ok(pulses.square);
  assert.notEqual(pulses.narrow, pulses.hollow);
  assert.notEqual(pulses.hollow, pulses.square);
});

test("pulseWaveForDutyCycle selects correct wave", () => {
  const ctx = stubContext();
  const pulses = createPulseDutyCycles(ctx);
  assert.equal(pulseWaveForDutyCycle(pulses, 0.125), pulses.narrow);
  assert.equal(pulseWaveForDutyCycle(pulses, 0.15), pulses.narrow);
  assert.equal(pulseWaveForDutyCycle(pulses, 0.25), pulses.hollow);
  assert.equal(pulseWaveForDutyCycle(pulses, 0.375), pulses.hollow);
  assert.equal(pulseWaveForDutyCycle(pulses, 0.5), pulses.square);
  assert.equal(pulseWaveForDutyCycle(pulses, 0.75), pulses.square);
});

test("createStaircaseTriangle has only odd harmonics", () => {
  const ctx = stubContext();
  createStaircaseTriangle(ctx);
  const imag = ctx.waves[0].imag;
  for (let n = 2; n <= 32; n += 2) {
    assert.equal(imag[n], 0, `even harmonic ${n} should be zero`);
  }
  assert.ok(Math.abs(imag[1]) > 0.1, "fundamental should be strong");
});

test("createStaircaseTriangle caches", () => {
  const ctx = stubContext();
  const a = createStaircaseTriangle(ctx);
  const b = createStaircaseTriangle(ctx);
  assert.equal(a, b);
});

test("createVrc6Sawtooth has both odd and even harmonics", () => {
  const ctx = stubContext();
  createVrc6Sawtooth(ctx);
  const imag = ctx.waves[0].imag;
  assert.ok(Math.abs(imag[1]) > 0.1, "fundamental present");
  assert.ok(Math.abs(imag[2]) > 0.01, "second harmonic present (sawtooth has all harmonics)");
  assert.ok(Math.abs(imag[3]) > 0.01, "third harmonic present");
});

test("createLfsrNoiseBuffer short mode produces 93-sample period", () => {
  const ctx = stubContext();
  const buffer = createLfsrNoiseBuffer(ctx, true);
  assert.ok(buffer.length > 0);
  const data = buffer.getChannelData(0);
  // Verify periodicity: sample 0 should equal sample 93
  assert.equal(data[0], data[93], "short LFSR should repeat at period 93");
});

test("createLfsrNoiseBuffer long mode is longer than short", () => {
  const ctx = stubContext();
  const short = createLfsrNoiseBuffer(ctx, true);
  flushChipCache(ctx);
  const long = createLfsrNoiseBuffer(ctx, false);
  assert.ok(long.length > short.length);
});

test("short LFSR uses the 93-sample metallic polynomial", () => {
  const ctx = stubContext();
  const data = createLfsrNoiseBuffer(ctx, true).getChannelData(0);
  for (let i = 0; i < 93; i += 1) {
    assert.equal(data[i], data[i + 93], `sample ${i} should repeat after 93 samples`);
  }
});

test("long LFSR does not collapse into the 93-sample short sequence", () => {
  const ctx = stubContext();
  const data = createLfsrNoiseBuffer(ctx, false).getChannelData(0);
  const differsWithinWindow = Array.from({ length: 512 }, (_, i) => data[i] !== data[i + 93]).some(Boolean);
  assert.equal(differsWithinWindow, true, "long-period noise must not repeat every 93 samples");
});

test("long LFSR repeats after its full 32767-sample period", () => {
  const ctx = stubContext();
  const data = createLfsrNoiseBuffer(ctx, false).getChannelData(0);
  for (let i = 0; i < 256; i += 1) {
    assert.equal(data[i], data[i + 32767], `sample ${i} should repeat after 32767 samples`);
  }
});

test("LFSR noise values are either -1 or +1", () => {
  const ctx = stubContext();
  const buffer = createLfsrNoiseBuffer(ctx, true);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < Math.min(200, data.length); i += 1) {
    assert.ok(data[i] === -1 || data[i] === 1, `sample ${i} should be -1 or +1, got ${data[i]}`);
  }
});

test("createLfsrNoiseBuffers returns both modes", () => {
  const ctx = stubContext();
  const noise = createLfsrNoiseBuffers(ctx);
  assert.ok(noise.metallic);
  assert.ok(noise.white);
  assert.notEqual(noise.metallic, noise.white);
});

test("flushChipCache clears all cached waves", () => {
  const ctx = stubContext();
  const wave1 = createPulseWave(ctx, 0.5);
  const tri1 = createStaircaseTriangle(ctx);
  flushChipCache(ctx);
  const wave2 = createPulseWave(ctx, 0.5);
  const tri2 = createStaircaseTriangle(ctx);
  assert.notEqual(wave1, wave2);
  assert.notEqual(tri1, tri2);
});

test("different contexts get separate caches", () => {
  const ctx1 = stubContext();
  const ctx2 = stubContext();
  const a = createPulseWave(ctx1, 0.5);
  const b = createPulseWave(ctx2, 0.5);
  assert.notEqual(a, b, "different contexts should not share cache");
});
