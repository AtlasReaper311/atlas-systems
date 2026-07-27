/**
 * Atlas APU chip oscillator factory.
 *
 * Generates authentic 8-bit waveforms using PeriodicWave (additive synthesis)
 * and AudioBuffer (LFSR noise). Every waveform is computed once per
 * AudioContext and cached so repeat calls return the same object.
 *
 * Pulse waves use band-limited Fourier series for variable duty cycles
 * (12.5%, 25%, 50%). The staircase triangle quantises to 16 levels (4-bit)
 * and the VRC6 sawtooth uses 31 harmonics with the characteristic bright
 * upper-partial rolloff of the Konami VRC6 expansion chip.
 *
 * LFSR noise produces two modes:
 *   short-period (93 samples, metallic/pitched for hi-hats and tonal perc)
 *   long-period  (32767 samples, white-ish for snare and explosions)
 *
 * All factories accept a raw AudioContext, not a Tone.js context wrapper.
 */

export const APU_CHIP_OSCILLATORS_BUILD_ID = "20260727-apu-chip-oscillators-v1";

const PULSE_HARMONICS = 64;
const TRIANGLE_HARMONICS = 32;
const VRC6_HARMONICS = 31;
const TRIANGLE_QUANTISE_LEVELS = 16;
const LFSR_SHORT_PERIOD = 93;
const LFSR_LONG_PERIOD = 32767;
const LFSR_SAMPLE_RATE = 44100;

const cache = new WeakMap();

function ensureCache(ctx) {
  if (!cache.has(ctx)) cache.set(ctx, new Map());
  return cache.get(ctx);
}

// ---------------------------------------------------------------------------
// Pulse wave via Fourier series
// ---------------------------------------------------------------------------

/**
 * Band-limited pulse wave with a specific duty cycle.
 *
 * The Fourier coefficients for a pulse wave with duty cycle d are:
 *   b_n = (2 / (n * pi)) * sin(n * pi * d)
 *
 * This gives the classic NES pulse timbres:
 *   12.5% (1/8) - thin, nasal, buzzy
 *   25%   (1/4) - hollow, reedy
 *   50%   (1/2) - pure square wave
 *
 * @param {BaseAudioContext} ctx
 * @param {number} dutyCycle - 0.125, 0.25, or 0.5
 * @returns {PeriodicWave}
 */
export function createPulseWave(ctx, dutyCycle) {
  const key = `pulse-${dutyCycle}`;
  const store = ensureCache(ctx);
  if (store.has(key)) return store.get(key);

  const real = new Float32Array(PULSE_HARMONICS + 1);
  const imag = new Float32Array(PULSE_HARMONICS + 1);
  real[0] = 0;
  imag[0] = 0;

  for (let n = 1; n <= PULSE_HARMONICS; n += 1) {
    real[n] = 0;
    imag[n] = (2 / (n * Math.PI)) * Math.sin(n * Math.PI * dutyCycle);
  }

  const wave = ctx.createPeriodicWave(real, imag, { disableNormalization: false });
  store.set(key, wave);
  return wave;
}

/**
 * All three NES duty cycle variants pre-built.
 * @param {BaseAudioContext} ctx
 * @returns {{ narrow: PeriodicWave, hollow: PeriodicWave, square: PeriodicWave }}
 */
export function createPulseDutyCycles(ctx) {
  return Object.freeze({
    narrow: createPulseWave(ctx, 0.125),
    hollow: createPulseWave(ctx, 0.25),
    square: createPulseWave(ctx, 0.5),
  });
}

// ---------------------------------------------------------------------------
// 4-bit staircase triangle
// ---------------------------------------------------------------------------

/**
 * Quantised triangle wave that mimics the NES 2A03 triangle channel.
 *
 * The NES triangle uses a 32-step lookup table producing only 16 distinct
 * amplitude levels (4-bit). This gives the characteristic buzzy warmth that
 * sits between a pure triangle and a stepped staircase.
 *
 * Built using Fourier series of a triangle wave, then the coefficients are
 * scaled to approximate the quantisation distortion heard on real hardware.
 * The odd harmonics are boosted slightly above what a pure triangle would
 * produce, mimicking the spectral content of the staircase.
 *
 * @param {BaseAudioContext} ctx
 * @returns {PeriodicWave}
 */
export function createStaircaseTriangle(ctx) {
  const key = "staircase-triangle-4bit";
  const store = ensureCache(ctx);
  if (store.has(key)) return store.get(key);

  const real = new Float32Array(TRIANGLE_HARMONICS + 1);
  const imag = new Float32Array(TRIANGLE_HARMONICS + 1);
  real[0] = 0;
  imag[0] = 0;

  // Pure triangle: b_n = (8 / (n^2 * pi^2)) * sin(n * pi / 2) for odd n
  // Staircase quantisation adds a slight boost to harmonics 3, 5, 7
  // proportional to the quantisation error at Q levels
  const quantisationBoost = 1 + (1 / TRIANGLE_QUANTISE_LEVELS);

  for (let n = 1; n <= TRIANGLE_HARMONICS; n += 1) {
    if (n % 2 === 0) {
      real[n] = 0;
      imag[n] = 0;
      continue;
    }
    const sign = ((n - 1) / 2) % 2 === 0 ? 1 : -1;
    const base = (8 / (n * n * Math.PI * Math.PI)) * sign;
    // Higher harmonics get progressively more quantisation distortion
    const boost = n <= 7 ? quantisationBoost : 1 + (0.5 / (n * TRIANGLE_QUANTISE_LEVELS));
    imag[n] = base * boost;
    real[n] = 0;
  }

  const wave = ctx.createPeriodicWave(real, imag, { disableNormalization: false });
  store.set(key, wave);
  return wave;
}

// ---------------------------------------------------------------------------
// VRC6 sawtooth
// ---------------------------------------------------------------------------

/**
 * VRC6-style sawtooth wave.
 *
 * The Konami VRC6 expansion chip's sawtooth channel uses a 7-step accumulator
 * that produces a brighter, more aggressive saw than a standard 8-bit DAC.
 * The upper harmonics roll off more slowly than an ideal sawtooth, giving a
 * characteristic buzzy brightness useful for power chords and rhythm backing.
 *
 * Built from Fourier series with a modified rolloff curve that keeps harmonics
 * 8-31 about 2 dB louder than an ideal sawtooth would.
 *
 * @param {BaseAudioContext} ctx
 * @returns {PeriodicWave}
 */
export function createVrc6Sawtooth(ctx) {
  const key = "vrc6-sawtooth";
  const store = ensureCache(ctx);
  if (store.has(key)) return store.get(key);

  const real = new Float32Array(VRC6_HARMONICS + 1);
  const imag = new Float32Array(VRC6_HARMONICS + 1);
  real[0] = 0;
  imag[0] = 0;

  // Standard sawtooth: b_n = (2 / (n * pi)) * (-1)^(n+1)
  // VRC6 modification: slower rolloff above harmonic 8
  for (let n = 1; n <= VRC6_HARMONICS; n += 1) {
    const sign = n % 2 === 0 ? -1 : 1;
    const base = (2 / (n * Math.PI)) * sign;
    // VRC6 accumulator keeps upper partials brighter
    const vrc6Boost = n >= 8 ? 1.26 : 1.0;
    imag[n] = base * vrc6Boost;
    real[n] = 0;
  }

  const wave = ctx.createPeriodicWave(real, imag, { disableNormalization: false });
  store.set(key, wave);
  return wave;
}

// ---------------------------------------------------------------------------
// LFSR noise buffer
// ---------------------------------------------------------------------------

/**
 * Generate a Linear Feedback Shift Register noise buffer.
 *
 * Short-period mode (93 samples) produces metallic, pitched noise suitable
 * for hi-hats, cymbals, and tonal percussion. Long-period mode (32767
 * samples) produces pseudo-random white noise for snares and explosions.
 *
 * The LFSR uses the NES 2A03 polynomial: bits 0 and 6 (short) or bits 0
 * and 1 (long) are XORed and fed back into bit 14.
 *
 * @param {BaseAudioContext} ctx
 * @param {boolean} short - true for metallic pitched noise, false for long
 * @returns {AudioBuffer}
 */
export function createLfsrNoiseBuffer(ctx, short = false) {
  const key = short ? "lfsr-noise-short" : "lfsr-noise-long";
  const store = ensureCache(ctx);
  if (store.has(key)) return store.get(key);

  const period = short ? LFSR_SHORT_PERIOD : LFSR_LONG_PERIOD;
  // Repeat the period enough times to fill about 1 second of audio
  const repeats = Math.max(1, Math.ceil(LFSR_SAMPLE_RATE / period));
  const length = period * repeats;
  const buffer = ctx.createBuffer(1, length, LFSR_SAMPLE_RATE);
  const data = buffer.getChannelData(0);

  let shift = 1;
  const feedbackBit = short ? 6 : 1;

  for (let i = 0; i < length; i += 1) {
    // Output is bit 0 inverted, mapped to -1..+1
    data[i] = (shift & 1) ? -1.0 : 1.0;

    // Advance LFSR: feedback = bit0 XOR bit(feedbackBit)
    const feedback = ((shift >> 0) ^ (shift >> feedbackBit)) & 1;
    shift = ((shift >> 1) | (feedback << 14)) & 0x7FFF;
  }

  store.set(key, buffer);
  return buffer;
}

/**
 * Both LFSR noise buffers pre-built.
 * @param {BaseAudioContext} ctx
 * @returns {{ metallic: AudioBuffer, white: AudioBuffer }}
 */
export function createLfsrNoiseBuffers(ctx) {
  return Object.freeze({
    metallic: createLfsrNoiseBuffer(ctx, true),
    white: createLfsrNoiseBuffer(ctx, false),
  });
}

// ---------------------------------------------------------------------------
// Utility
// ---------------------------------------------------------------------------

/**
 * Apply a PeriodicWave to an OscillatorNode.
 * Safe to call on running oscillators.
 *
 * @param {OscillatorNode} oscillator
 * @param {PeriodicWave} wave
 */
export function applyChipWave(oscillator, wave) {
  if (!oscillator || !wave) return;
  oscillator.setPeriodicWave(wave);
}

/**
 * Select the correct pulse PeriodicWave for a duty cycle value.
 *
 * @param {{ narrow: PeriodicWave, hollow: PeriodicWave, square: PeriodicWave }} pulses
 * @param {number} dutyCycle
 * @returns {PeriodicWave}
 */
export function pulseWaveForDutyCycle(pulses, dutyCycle) {
  if (dutyCycle <= 0.15) return pulses.narrow;
  if (dutyCycle <= 0.375) return pulses.hollow;
  return pulses.square;
}

/**
 * Flush the waveform cache for a given AudioContext.
 * Useful for tests and disposal.
 *
 * @param {BaseAudioContext} ctx
 */
export function flushChipCache(ctx) {
  cache.delete(ctx);
}
