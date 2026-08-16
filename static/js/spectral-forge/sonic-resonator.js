"use strict";

/* Deterministic exciter into coupled material resonators.
 *
 * The previous architecture was oscillator-led: a triangle fundamental, two
 * sines, and later a bank of five continuously running upper sines. Adding the
 * bank moved the spectrum but not the character, and the owner heard the result
 * accurately - a basic tone moving in pitch with a ringing whine over it. A
 * continuously sounding partial is a drone whatever frequency it sits at; no
 * amount of retuning, filtering or reverb makes a drone into a material.
 *
 * A material does not hum. It sits quiet until something excites it, and then
 * its own modes ring and decay at rates its structure decides. So the modes here
 * make no sound at all on their own: they are resonant filters, silent until an
 * exciter feeds them, and everything the listener hears is a consequence of the
 * body being struck, rubbed, loaded or torn.
 *
 * That is also what makes the instrument breathe. Between excitations the
 * resonance decays and the surface is nearly silent, which is the part the
 * previous version could never have, because a continuous oscillator is never
 * not sounding.
 *
 * Modal synthesis in plain Web Audio: a parallel bank of high-Q bandpass
 * filters. Mode frequency sets what the material is, Q sets how long it holds a
 * note, and the excitation sets when and how hard it speaks. No AudioWorklet -
 * the primitives already do this, and the extra machinery would buy nothing.
 */

import { clamp } from "./domain.js";

/* Inharmonic, and deliberately not a harmonic series: a harmonic stack reads as
 * one pitched note, which is the drone problem again. These are spaced like a
 * struck solid - close at the bottom where the body lives, spreading as they
 * rise - so the bank reads as one object rather than a chord. The top mode sits
 * near 1.6 kHz on the 92 Hz body: present, never piercing. The owner's report of
 * a glass whistle came from continuous partials at 1-5 kHz; nothing here sounds
 * unless struck, and the highest mode is well below where that becomes fatiguing.
 */
export const MODE_RATIOS = Object.freeze([1, 1.73, 2.71, 4.12, 6.28, 9.14, 12.6, 17.7]);
export const MODE_COUNT = MODE_RATIOS.length;

/* Falling weights: the body carries the sound and the upper modes colour it. */
const MODE_WEIGHT = Object.freeze([1, 0.82, 0.66, 0.5, 0.36, 0.24, 0.15, 0.09]);
const MODE_PAN = Object.freeze([0, -0.18, 0.22, -0.3, 0.34, -0.4, 0.44, -0.24]);

/* Damping bounds, as filter Q. Low Q is a dead, dull material that barely holds
 * a note; high Q rings on. Capped well short of self-oscillation, which would
 * reintroduce exactly the continuous tone this replaces. */
/* Ring time for a resonant bandpass is roughly Q / (pi * f), so Q is literally
 * how long the material holds a note. At Q 12 the lowest mode decayed in 40ms -
 * a thud, not a ring, which is why the first attempt read as quiet rather than
 * resonant. These values give the body around a second of decay when it is
 * coherent and a few tens of milliseconds when it is damped, which is the span
 * between a struck crystal and a dead weight. */
const Q_MIN = 14;
const Q_MAX = 190;

/* A bandpass passes only a narrow slice of what it is fed, and the slice narrows
 * as Q rises, so a modal bank needs large make-up gain to reach a usable level.
 * Tuned against measured output, not guessed: the safety chain still owns the
 * ceiling. */
const MODE_LEVEL = 300;

function ramp(parameter, value, now, seconds) {
  const finite = Number.isFinite(value) ? value : parameter.value;
  parameter.cancelScheduledValues(now);
  parameter.setValueAtTime(parameter.value, now);
  parameter.linearRampToValueAtTime(finite, now + Math.max(0.02, seconds));
}

/* One short deterministic noise buffer, reused for every excitation. Generating
 * it once keeps excitation allocation-free at the point of use and keeps a run
 * identical to itself. */
export function createExcitationBuffer(context, seed = 0x2545f491) {
  const length = Math.max(1, Math.floor(context.sampleRate * 0.25));
  const buffer = context.createBuffer(1, length, context.sampleRate);
  const data = buffer.getChannelData(0);
  let state = seed >>> 0;
  for (let i = 0; i < length; i += 1) {
    state = Math.imul(state ^ (state >>> 15), 1 | state);
    state ^= state + Math.imul(state ^ (state >>> 7), 61 | state);
    data[i] = (((state ^ (state >>> 14)) >>> 0) / 4294967296) * 2 - 1;
  }
  return buffer;
}

/* The bank. Two groups, because a body that is coming apart has to be able to
 * disagree with itself: modes are split between them, and the groups can be
 * detuned, damped and placed independently. In a coherent body the groups sit on
 * the same tuning and the split is inaudible; during a separation they become
 * two related structures, which is the fission signature heard rather than
 * simulated by panning two oscillators apart. */
export function createResonatorBank(context, destination) {
  const input = context.createGain();
  input.gain.value = 1;

  /* Excitation noise carries energy far above anything the material should
   * express, and letting that reach the modes is what makes a resonator bank
   * hiss. The whole excitation passes through here first. */
  const shelf = context.createBiquadFilter();
  shelf.type = "lowpass";
  shelf.frequency.value = 3200;
  shelf.Q.value = 0.6;
  input.connect(shelf);

  const modes = MODE_RATIOS.map((ratio, index) => {
    const filter = context.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = 92 * ratio;
    filter.Q.value = 60;
    const gain = context.createGain();
    gain.gain.value = MODE_LEVEL * MODE_WEIGHT[index];
    const panner = context.createStereoPanner();
    panner.pan.value = MODE_PAN[index];
    shelf.connect(filter).connect(gain).connect(panner).connect(destination);
    return { filter, gain, panner, ratio, weight: MODE_WEIGHT[index], group: index % 2, index };
  });

  return { input, modes, shelf };
}

/* Body weight. One quiet low resonance under the modal bank, because a bandpass
 * bank alone has no sustained bottom and the organism should feel like it has
 * mass. It is support, not identity: well below the modes, and never the thing
 * the listener notices first. */
export function createBodyResonator(context, destination) {
  const filter = context.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = 150;
  filter.Q.value = 1.4;
  const gain = context.createGain();
  /* Support only. A lowpass passes far more of a broadband excitation than a
   * narrow mode does, so left level with the bank it simply became the sound. */
  gain.gain.value = 0.05;
  filter.connect(gain).connect(destination);
  return { filter, gain };
}

/* Continuous surface friction: the sound of a material being under load rather
 * than being struck. Very quiet, band-limited, and it moves with pressure - it
 * is the only continuous element in the design and it is noise, not a tone. */
export function createFrictionLayer(context, destination, noiseSource) {
  const band = context.createBiquadFilter();
  band.type = "bandpass";
  band.frequency.value = 900;
  band.Q.value = 1.1;
  const gain = context.createGain();
  gain.gain.value = 0;
  noiseSource.connect(band).connect(gain).connect(destination);
  return { band, gain };
}

/* Tunes the material. Nothing here makes sound; it decides what the body will do
 * when something excites it. */
export function updateResonatorBank(bank, voice, baseFrequency, now, slew) {
  const cohesion = 1 - clamp(voice.split?.separation ?? 0);
  const damping = clamp(voice.damping ?? 0.5);
  const coupling = clamp(voice.coupling ?? 1);
  const spread = clamp(voice.spread ?? 0.5);
  const detune = clamp(voice.inharmonic ?? 0);
  const separation = clamp(voice.split?.separation ?? 0);
  const daughterPan = voice.split?.daughterPan ?? 0;

  for (const mode of bank.modes) {
    /* Coupling pulls the modes onto a common ratio; losing it lets them drift
     * apart, which is what an incoherent material sounds like. Detune spreads
     * them further, alternating by mode so the body beats against itself. */
    const drift = (1 - coupling) * (mode.index % 2 === 0 ? 1 : -1) * 0.06;
    const groupOffset = mode.group === 1 ? separation * 0.055 : -separation * 0.02;
    const frequency = baseFrequency * mode.ratio * (1 + drift + groupOffset + detune * 0.03 * (mode.index % 3 - 1));
    ramp(mode.filter.frequency, Math.min(7800, Math.max(35, frequency)), now, slew);

    /* Damping: a well-supported, cohesive body rings; a damaged or loaded one
     * does not. Upper modes lose their ring first, which is how real materials
     * dull as they are damaged. */
    const heightPenalty = 1 - (mode.index / (MODE_COUNT - 1)) * damping * 0.55;
    ramp(mode.filter.Q, clamp(Q_MIN + (Q_MAX - Q_MIN) * (1 - damping) * heightPenalty, Q_MIN, Q_MAX), now, slew);

    /* Level per mode. Support loss silences the lower reinforcement
     * specifically, which is the collapse heard as the floor going rather than
     * as a filter sweep. */
    const support = mode.index < 3 ? 1 - clamp(voice.floorDrop ?? 0) * 0.6 : 1;
    ramp(mode.gain.gain, MODE_LEVEL * mode.weight * support * (0.55 + coupling * 0.45), now, slew);

    /* Once the body has parted, the second group takes the daughter's side. */
    const side = mode.group === 1 ? daughterPan * separation * 0.6 : 0;
    ramp(mode.panner.pan, clamp(MODE_PAN[mode.index] * (0.6 + spread * 0.8) + side, -1, 1), now, slew);
  }

  ramp(bank.shelf.frequency, 2400 + (1 - damping) * 2200, now, slew);
  void cohesion;
}

export function updateBodyResonator(body, voice, baseFrequency, now, slew) {
  ramp(body.filter.frequency, baseFrequency * 1.6 * (1 - clamp(voice.floorDrop ?? 0) * 0.3), now, slew);
  ramp(body.gain.gain, 0.05 * (0.6 + (1 - clamp(voice.damping ?? 0.5)) * 0.4), now, slew);
}

export function updateFrictionLayer(friction, voice, now, slew) {
  /* Load makes a surface speak; a dead surface does not. Kept low enough that it
   * reads as texture under the resonance rather than as noise in its own right. */
  const level = 0.0075 * clamp(voice.density ?? 0) * (0.4 + clamp(voice.air ?? 0) * 0.6);
  ramp(friction.gain.gain, level, now, slew);
  ramp(friction.band.frequency, 620 + clamp(voice.density ?? 0) * 900, now, slew);
  ramp(friction.band.Q, 0.8 + clamp(voice.tension ?? 0) * 2.4, now, slew);
}

/* One excitation: a short shaped burst into the bank.
 *
 * Sharpness decides what the material is hit with - a soft, low-passed knock or
 * a bright tap - and amplitude decides how hard. Everything the listener hears
 * follows from this and the state of the modes; there is no note here to play. */
export function excite(context, bank, buffer, {
  at,
  amplitude = 0.2,
  sharpness = 0.5,
  duration = 0.02,
  pan = 0,
} = {}) {
  const start = Math.max(context.currentTime, at ?? context.currentTime);
  const source = context.createBufferSource();
  source.buffer = buffer;
  /* Playback rate varies the grain of the excitation without a second buffer. */
  source.playbackRate.value = 0.7 + sharpness * 1.1;

  /* The excitation's own colour is set by where the buffer is read and how fast,
   * not by a filter per strike. A bandpass here cost a node on every impact -
   * and with micro impacts running up to a dozen a second that is real
   * main-thread work for a shaping the playback rate already provides. The bank
   * has its own input roll-off, so nothing broadband reaches the modes. */
  const shaper = context.createGain();
  const peak = Math.max(0.0002, amplitude);
  /* A struck excitation is near-instant on and short off. The decay is what
   * hands energy to the modes rather than sounding itself. */
  shaper.gain.setValueAtTime(0.0001, start);
  shaper.gain.exponentialRampToValueAtTime(peak, start + 0.0016);
  shaper.gain.exponentialRampToValueAtTime(0.0001, start + Math.max(0.006, duration));

  const panner = context.createStereoPanner();
  panner.pan.value = clamp(pan, -1, 1);

  source.connect(shaper).connect(panner).connect(bank.input);
  source.start(start, 0.01 + sharpness * 0.05);
  source.stop(start + Math.max(0.006, duration) + 0.03);
}
