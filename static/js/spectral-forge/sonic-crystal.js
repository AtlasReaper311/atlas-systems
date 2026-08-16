"use strict";

/* The upper register the instrument never had.
 *
 * Measured on the previous build: 90% of all energy below 1.57 kHz and zero
 * above 8 kHz in six of seven scenarios. The highest continuous partial in the
 * whole instrument was about 259 Hz, so "crystalline, futuristic, spacious" had
 * nowhere to come from - opening a low-pass over content that has no treble
 * cannot invent any.
 *
 * Three additions, all deterministic:
 *   - an inharmonic partial bank between roughly 1 and 5 kHz, which is what
 *     actually rings when a hard material is struck
 *   - an air band: high noise shaped by surface tension, the sound of a surface
 *     rather than a body
 *   - a small convolution space, so the body sits somewhere instead of being
 *     pressed against the listener
 *
 * Everything is gain-staged well under the existing safety chain and passes
 * through it unchanged: compressor, soft clip and the -1 dBFS ceiling still own
 * the output.
 */

import { clamp } from "./domain.js";
import { CRYSTAL_PARTIALS, CRYSTAL_RATIOS, materialSlew } from "./sonic-material.js";

const CRYSTAL_BIAS = Object.freeze([0.31, -0.52, 0.78, -1.14, 1.63]);
const CRYSTAL_PAN = Object.freeze([-0.42, 0.31, -0.18, 0.52, -0.07]);
/* Falling weights: the bank should read as one ringing material, not five
 * separate tones. The top partials are present but never prominent. */
const CRYSTAL_WEIGHT = Object.freeze([1, 0.62, 0.4, 0.24, 0.13]);

function ramp(parameter, value, now, seconds) {
  const finite = Number.isFinite(value) ? value : parameter.value;
  parameter.cancelScheduledValues(now);
  parameter.setValueAtTime(parameter.value, now);
  parameter.linearRampToValueAtTime(finite, now + Math.max(0.025, seconds));
}

/* A short, dense, deterministic impulse response.
 *
 * Generated rather than fetched: no network dependency, no asset to ship, and
 * seeded so the space is identical on every run. Kept short so the instrument
 * stays legible as sonification - a long tail would smear the causal
 * relationship the whole surface exists to demonstrate. */
export function createSpaceImpulse(context, seconds = 1.35, seed = 0x9e3779b9) {
  const rate = context.sampleRate;
  const length = Math.max(1, Math.floor(rate * seconds));
  const buffer = context.createBuffer(2, length, rate);
  let state = seed >>> 0;
  const next = () => {
    state = Math.imul(state ^ (state >>> 15), 1 | state);
    state ^= state + Math.imul(state ^ (state >>> 7), 61 | state);
    return (((state ^ (state >>> 14)) >>> 0) / 4294967296) * 2 - 1;
  };
  for (let channel = 0; channel < 2; channel += 1) {
    const data = buffer.getChannelData(channel);
    for (let i = 0; i < length; i += 1) {
      const t = i / length;
      /* Exponential decay with a short build, so the space has a body rather
       * than an instant onset. */
      const envelope = (1 - Math.exp(-t * 42)) * Math.exp(-t * 5.4);
      data[i] = next() * envelope;
    }
  }
  return buffer;
}

export function createCrystalLayer(context, destination, baseFrequency) {
  const bank = [];
  const input = context.createGain();
  input.gain.value = 1;

  for (let i = 0; i < CRYSTAL_PARTIALS; i += 1) {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const panner = context.createStereoPanner();
    oscillator.type = "sine";
    oscillator.frequency.value = baseFrequency * CRYSTAL_RATIOS[i];
    gain.gain.value = 0;
    panner.pan.value = CRYSTAL_PAN[i];
    oscillator.connect(gain).connect(panner).connect(input);
    oscillator.start();
    bank.push({ oscillator, gain, panner, ratio: CRYSTAL_RATIOS[i], weight: CRYSTAL_WEIGHT[i], bias: CRYSTAL_BIAS[i] });
  }

  /* A gentle top-end shelf keeps the bank from ever becoming shrill on a bright
   * playback system while leaving it fully present on laptop speakers. */
  const tone = context.createBiquadFilter();
  tone.type = "highshelf";
  tone.frequency.value = 5200;
  tone.gain.value = -3.5;
  input.connect(tone).connect(destination);

  return { input, tone, bank };
}

export function createAirLayer(context, destination, noiseSource) {
  const highpass = context.createBiquadFilter();
  highpass.type = "highpass";
  highpass.frequency.value = 5400;
  highpass.Q.value = 0.7;
  const peak = context.createBiquadFilter();
  peak.type = "peaking";
  peak.frequency.value = 9200;
  peak.Q.value = 0.9;
  peak.gain.value = 3;
  const gain = context.createGain();
  gain.gain.value = 0;
  noiseSource.connect(highpass).connect(peak).connect(gain).connect(destination);
  return { highpass, peak, gain };
}

export function createSpaceLayer(context, destination) {
  const send = context.createGain();
  send.gain.value = 0;
  const convolver = context.createConvolver();
  convolver.normalize = true;
  convolver.buffer = createSpaceImpulse(context);
  /* Keeps the tail out of the low mids, where it would blur the body's weight. */
  const shape = context.createBiquadFilter();
  shape.type = "highpass";
  shape.frequency.value = 340;
  const returnGain = context.createGain();
  returnGain.gain.value = 1;
  send.connect(convolver).connect(shape).connect(returnGain).connect(destination);
  return { send, convolver, shape, returnGain };
}

/* Drives the whole upper structure from one material voice.
 *
 * Level is deliberately conservative: the crystal bank tops out around a tenth
 * of the tonal body, because its job is to give the material a surface, not to
 * become the instrument. */
export function updateCrystalLayer(layer, voice, baseFrequency, brightness, now, slewBase) {
  const seconds = materialSlew(slewBase, voice);
  const crystal = clamp(voice.crystal);
  const inharmonic = clamp(voice.inharmonic);
  const tension = clamp(voice.tension);
  const domains = clamp(voice.domains);

  for (let i = 0; i < layer.bank.length; i += 1) {
    const partial = layer.bank[i];
    /* Brightness shades the bank rather than gating it: a dark mapping should
     * make the material sound covered, not absent. */
    const presence = crystal * partial.weight * (0.58 + brightness * 0.42);
    ramp(partial.gain.gain, 0.052 * presence, now, seconds);

    /* Inharmonic push and tension both bend the bank off true, in opposite
     * senses per partial so the material beats against itself. Domains add a
     * slower competing offset on alternate partials. */
    const domainSide = i % 2 === 0 ? 1 : -1;
    const cents = partial.bias * (inharmonic * 46 + tension * 28) + domainSide * domains * 19;
    ramp(partial.oscillator.detune, cents, now, seconds);
    ramp(partial.oscillator.frequency, baseFrequency * partial.ratio, now, Math.max(seconds, 0.35));

    /* Separation widens the bank across the image as the body comes apart. */
    const pan = CRYSTAL_PAN[i] * (1 + voice.spread * 0.5);
    ramp(partial.panner.pan, clamp(pan, -1, 1), now, seconds);
  }
}

export function updateAirLayer(layer, voice, now, slewBase) {
  const seconds = materialSlew(slewBase, voice);
  ramp(layer.gain.gain, 0.021 * clamp(voice.air), now, seconds);
  /* Support loss takes the floor out from under the tone; the air band lifts as
   * the body below it thins, which is what makes the collapse audible as a
   * change of support rather than a change of volume. */
  ramp(layer.highpass.frequency, 5400 - clamp(voice.floorDrop) * 1500, now, seconds);
}

export function updateSpaceLayer(layer, voice, now, slewBase) {
  const seconds = materialSlew(slewBase, voice);
  /* Space opens as the material spreads and closes as it compresses, so the
   * room is part of the physical reading rather than a fixed effect. */
  const wet = 0.06 + clamp(voice.spread) * 0.1 + clamp(voice.air) * 0.05;
  ramp(layer.send.gain, wet, now, seconds);
}
