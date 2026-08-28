"use strict";

import { SMOOTHING_SECONDS, clamp } from "./domain.js";
import { HARMONIC_PROFILES, SONIC_BASE_FREQUENCY, SONIC_SUB_FREQUENCY, effectiveStereoWidth, targetNormalised } from "./sonic-profile.js";
import { DEFAULT_VOICE, materialSlew } from "./sonic-material.js";
import { createSpaceLayer, updateSpaceLayer, createCrystalLayer, updateCrystalLayer } from "./sonic-crystal.js";
import { LEGACY_AUDIO } from "./sonic-identity-install.js";
import {
  createBodyResonator,
  createExcitationBuffer,
  createFrictionLayer,
  createResonatorBank,
  excite,
  updateBodyResonator,
  updateFrictionLayer,
  updateResonatorBank,
} from "./sonic-resonator.js";

function ramp(parameter, value, now, seconds) {
  parameter.cancelScheduledValues(now);
  parameter.setValueAtTime(parameter.value, now);
  parameter.linearRampToValueAtTime(value, now + Math.max(0.025, seconds));
}

function voiceOf(engine) {
  return engine.sonicVoice ?? DEFAULT_VOICE;
}

/* The oscillator core is kept, but only as structural support beneath the
 * resonating material. It was the identity, and the owner heard it as one - "a
 * sine going up and down". At this level it supplies weight and a tonal centre
 * the modes can sit against, and it is not the first thing anyone notices. */
export const SUPPORT_TONE_LEVEL = 0.055;

/* The tonal centre moves, but only within the identity. */
export const TONAL_CENTRE_RANGE = 0.045;

export function materialBaseFrequency(voice) {
  const tension = clamp(voice?.tension ?? 0);
  const converge = clamp(voice?.converge ?? 0);
  const floorDrop = clamp(voice?.floorDrop ?? 0);
  const shift = -tension * 0.6 - floorDrop * 0.45 + converge * 0.35;
  return SONIC_BASE_FREQUENCY * (1 + clamp(shift, -1, 1) * TONAL_CENTRE_RANGE);
}

export function ensureSonicNodes(engine) {
  if (engine.sonicIdentityReady) return;
  const context = engine.context;
  engine.sonicIdentityReady = true;
  engine.sonicVoice = engine.sonicVoice ?? DEFAULT_VOICE;

  engine.subOscillator = context.createOscillator();
  engine.subOscillator.type = "sine";
  engine.subOscillator.frequency.value = SONIC_SUB_FREQUENCY;
  engine.subFilter = context.createBiquadFilter();
  engine.subFilter.type = "lowpass";
  engine.subFilter.frequency.value = 118;
  engine.subFilter.Q.value = 0.68;
  engine.subGain = context.createGain();
  engine.subGain.gain.value = 0.008;
  engine.subOscillator.connect(engine.subFilter).connect(engine.subGain).connect(engine.dryBus);
  engine.subOscillator.start();

  /* Support loss needs its own handle on the low body. */
  engine.bodyGain = context.createGain();
  engine.bodyGain.gain.value = 1;
  try { engine.filter.disconnect(engine.tonalGain); } catch { /* first install */ }
  engine.filter.connect(engine.bodyGain).connect(engine.tonalGain);

  engine.space = createSpaceLayer(context, engine.mixBus);

  /* The material itself: a silent bank of resonant modes, and the excitation
   * that makes them speak. */
  if (LEGACY_AUDIO) {
    engine.crystal = createCrystalLayer(context, engine.dryBus, SONIC_BASE_FREQUENCY);
    engine.crystal.input.connect(engine.space.send);
  }
  engine.excitationBuffer = createExcitationBuffer(context);
  engine.resonators = createResonatorBank(context, engine.dryBus);
  engine.bodyResonator = createBodyResonator(context, engine.dryBus);
  engine.resonators.input.connect(engine.bodyResonator.filter);
  engine.resonators.modes[0].gain.connect(engine.space.send);
  engine.resonators.modes[2].gain.connect(engine.space.send);
  engine.resonators.modes[4].gain.connect(engine.space.send);

  /* The one continuous element in the design, and it is noise under load rather
   * than a tone. */
  try { engine.noisePanner.disconnect(engine.dryBus); } catch { /* may already be detached */ }
  engine.friction = createFrictionLayer(context, engine.dryBus, engine.noiseSource);
  engine.noiseGain.gain.value = 0;

  engine.microImpactAt = context.currentTime;
  engine.impactCounter = 0;

  const now = context.currentTime;
  engine.primary.oscillator.frequency.setValueAtTime(SONIC_BASE_FREQUENCY, now);
  setHarmonicProfile(engine, engine.lastHealth ?? "STABLE");
}

export function updateSonicNodes(engine, parameters, smoothing) {
  ensureSonicNodes(engine);
  const now = engine.context.currentTime;
  const voice = voiceOf(engine);
  const seconds = (target) => materialSlew(SMOOTHING_SECONDS[smoothing[target] ?? "MEDIUM"], voice);

  const tonal = targetNormalised("tonal_level", parameters.tonal_level);
  const brightness = targetNormalised("harmonic_brightness", parameters.harmonic_brightness);
  const density = targetNormalised("texture_density", parameters.texture_density);
  const errorTexture = targetNormalised("error_texture", parameters.error_texture);

  const mappedWidth = effectiveStereoWidth(parameters);
  const width = clamp(mappedWidth * (0.75 + voice.spread * 0.45) * (1 - voice.converge * 0.18), 0.06, 1);

  /* The tonal path is support now, so the mapped tonal level shades it rather
   * than driving the instrument. */
  /* Legacy audition keeps the oscillator core at its old prominence. */
  const toneLevel = LEGACY_AUDIO ? (0.28 + tonal * 0.42) : SUPPORT_TONE_LEVEL * (0.6 + tonal * 0.8);
  ramp(engine.tonalGain.gain, toneLevel, now, seconds("tonal_level"));
  ramp(engine.subGain.gain, 0.006 + tonal * 0.014, now, seconds("tonal_level"));
  ramp(engine.widthLeft.gain, width, now, seconds("stereo_width"));
  ramp(engine.widthRight.gain, -width, now, seconds("stereo_width"));
  ramp(engine.bodyGain.gain, clamp(1 - voice.floorDrop * 0.42, 0.5, 1), now, seconds("tonal_level"));

  const base = materialBaseFrequency(voice);
  engine.sonicBaseFrequency = base;
  engine.sonicBrightness = brightness;
  engine.sonicTexture = clamp(density * 0.6 + errorTexture * 0.4);

  if (LEGACY_AUDIO && engine.crystal) {
    updateCrystalLayer(engine.crystal, voice, base, brightness, now, SMOOTHING_SECONDS[smoothing.harmonic_brightness ?? "MEDIUM"]);
  }
  updateResonatorBank(engine.resonators, voice, base, now, seconds("harmonic_brightness"));
  updateBodyResonator(engine.bodyResonator, voice, base, now, seconds("tonal_level"));
  updateFrictionLayer(engine.friction, { ...voice, density: clamp(voice.density * 0.6 + density * 0.4) }, now, seconds("texture_density"));
  updateSpaceLayer(engine.space, voice, now, seconds("stereo_width"));

  /* Domain disagreement still detunes the support pair, so the structural tone
   * agrees with what the modes are doing rather than contradicting it. */
  const domainCents = voice.domains * 22 + voice.split.detune * 28;
  ramp(engine.harmonic.oscillator.detune, domainCents, now, seconds("instability"));
  ramp(engine.shimmer.oscillator.detune, -domainCents * 0.72, now, seconds("instability"));
}

export function setHarmonicProfile(engine, health) {
  ensureSonicNodes(engine);
  const profile = HARMONIC_PROFILES[health] ?? HARMONIC_PROFILES.STABLE;
  const now = engine.context.currentTime;
  const base = engine.sonicBaseFrequency ?? SONIC_BASE_FREQUENCY;
  ramp(engine.primary.oscillator.frequency, base, now, 0.55);
  ramp(engine.subOscillator.frequency, base / 2, now, 0.7);
  ramp(engine.harmonic.oscillator.frequency, base * profile.harmonic, now, 0.72);
  ramp(engine.shimmer.oscillator.frequency, base * profile.shimmer, now, 0.92);
}

/* The structural pulse: the organism's own beat, delivered as a strike on the
 * material rather than as a tone of its own. What the listener hears is the
 * body's response, which is why the same pulse sounds different in a coherent
 * body and a damaged one without anything about the pulse changing. */
export function scheduleHeartbeat(engine, at) {
  if (engine.disposed || engine.context.state !== "running") return;
  const voice = voiceOf(engine);
  const context = engine.context;
  const start = Number.isFinite(at) ? at : context.currentTime;
  const strength = engine.pulseIntensity ?? 0.24;
  const brightness = engine.sonicBrightness ?? 0.4;

  /* A loaded body is struck harder and more sharply; a viscous one is struck
   * softly and answers slowly. */
  const amplitude = 0.34 + strength * 0.5 + clamp(voice.tension) * 0.18;
  const sharpness = clamp(0.24 + brightness * 0.4 + clamp(voice.tension) * 0.22 - clamp(voice.drag) * 0.24);
  const pan = (engine.pulseCounter % 2 === 0 ? -0.06 : 0.06) * (1 + voice.spread * 0.8);

  excite(context, engine.resonators, engine.excitationBuffer, {
    at: start,
    amplitude,
    sharpness,
    duration: 0.014 + clamp(voice.drag) * 0.03,
    pan,
  });

  /* Once the body has parted, the second structure answers from its own side,
   * slightly later and softer - one event, two bodies. */
  const separation = clamp(voice.split?.separation ?? 0);
  if (separation > 0.14) {
    excite(context, engine.resonators, engine.excitationBuffer, {
      at: start + 0.028 + separation * 0.05,
      amplitude: amplitude * (0.3 + separation * 0.4),
      sharpness: clamp(sharpness * (1 + separation * 0.3)),
      duration: 0.01,
      pan: clamp((voice.split?.daughterPan ?? 0) * separation, -1, 1),
    });
  }

  engine.pulseCounter += 1;
}

/* Micro impacts: sparse, deterministic, and the reason the material sounds
 * inhabited between structural pulses. Density follows load, so a compressed
 * body chatters and a calm one is nearly silent - which is what gives the
 * instrument its quiet, and why it can be left running. */
export function scheduleMicroImpacts(engine, until) {
  if (engine.disposed || engine.context.state !== "running") return;
  const context = engine.context;
  const voice = voiceOf(engine);
  const texture = engine.sonicTexture ?? 0.2;
  const rate = 1.1 + clamp(voice.density) * 7 + texture * 4;
  if (!Number.isFinite(engine.microImpactAt)) engine.microImpactAt = context.currentTime;
  if (engine.microImpactAt < context.currentTime - 1) engine.microImpactAt = context.currentTime;

  let placed = 0;
  while (engine.microImpactAt < until && placed < 24) {
    const n = engine.impactCounter;
    /* Deterministic scatter: an integer hash, not a random number, so the same
     * run produces the same grain every time. */
    const h = Math.sin(n * 12.9898) * 43758.5453;
    const jitter = h - Math.floor(h);
    const h2 = Math.sin(n * 78.233) * 12345.6789;
    const side = (h2 - Math.floor(h2)) * 2 - 1;

    excite(context, engine.resonators, engine.excitationBuffer, {
      at: engine.microImpactAt,
      amplitude: (0.05 + clamp(voice.density) * 0.12) * (0.5 + jitter * 0.9),
      sharpness: clamp(0.4 + jitter * 0.45 + clamp(voice.tension) * 0.2),
      duration: 0.005 + jitter * 0.006,
      pan: side * (0.35 + voice.spread * 0.5),
    });

    engine.impactCounter += 1;
    engine.microImpactAt += (0.55 + jitter * 0.9) / rate;
    placed += 1;
  }
}

/* Health transitions and scenario events strike the material harder, as a
 * short ordered series rather than a chord of tones. */
export function triggerSonicEvent(engine, health) {
  if (engine.context.state !== "running") return;
  const profile = HARMONIC_PROFILES[health] ?? HARMONIC_PROFILES.STABLE;
  const voice = voiceOf(engine);
  const context = engine.context;
  const peak = health === "FAILED" ? 0.62 : health === "RECOVERING" ? 0.5 : 0.42;
  profile.event.forEach((ratio, index) => {
    excite(context, engine.resonators, engine.excitationBuffer, {
      at: context.currentTime + index * 0.07 * (1 + clamp(voice.drag) * 0.8),
      amplitude: peak * (1 - index * 0.22),
      sharpness: clamp(0.3 + ratio * 0.18),
      duration: 0.02,
      pan: (index - (profile.event.length - 1) / 2) * 0.16,
    });
  });
}

export function disposeSonicNodes(engine) {
  if (!engine.sonicIdentityReady) return;
  const stopAt = engine.context.currentTime + 0.04;
  try { engine.subOscillator.stop(stopAt); } catch { /* already stopped */ }
}
