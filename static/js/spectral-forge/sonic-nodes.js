"use strict";

import { SMOOTHING_SECONDS, clamp } from "./domain.js";
import { HARMONIC_PROFILES, SONIC_BASE_FREQUENCY, SONIC_SUB_FREQUENCY, effectiveStereoWidth, targetNormalised } from "./sonic-profile.js";
import { DEFAULT_VOICE, materialSlew } from "./sonic-material.js";
import {
  createAirLayer,
  createCrystalLayer,
  createSpaceLayer,
  updateAirLayer,
  updateCrystalLayer,
  updateSpaceLayer,
} from "./sonic-crystal.js";

function ramp(parameter, value, now, seconds) {
  parameter.cancelScheduledValues(now);
  parameter.setValueAtTime(parameter.value, now);
  parameter.linearRampToValueAtTime(value, now + Math.max(0.025, seconds));
}

function voiceOf(engine) {
  return engine.sonicVoice ?? DEFAULT_VOICE;
}

/* The tonal centre moves, but only within the identity.
 *
 * A permanently fixed 92 Hz made every scenario the same note; free movement
 * would make it a melody and stop it reading as sonification. The centre is
 * therefore pulled by a bounded amount - a few percent - by the material's own
 * loading, so the instrument stays recognisably itself while its pitch admits
 * that something has changed. */
export const TONAL_CENTRE_RANGE = 0.045;

export function materialBaseFrequency(voice) {
  const tension = clamp(voice?.tension ?? 0);
  const converge = clamp(voice?.converge ?? 0);
  const floorDrop = clamp(voice?.floorDrop ?? 0);
  /* Loading pulls the centre down, reconvergence pulls it back to true, and a
   * collapsing floor drops it further because its support is gone. */
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
  engine.subGain.gain.value = 0.018;
  engine.subOscillator.connect(engine.subFilter).connect(engine.subGain).connect(engine.dryBus);
  engine.subOscillator.start();

  engine.crystalDelay = context.createDelay(0.04);
  engine.crystalDelay.delayTime.value = 0.011;
  engine.crystalFeedback = context.createGain();
  engine.crystalFeedback.gain.value = 0.12;
  try { engine.noisePanner.disconnect(engine.dryBus); } catch { /* direct noise route may already be detached */ }
  engine.noisePanner.connect(engine.crystalDelay);
  engine.crystalDelay.connect(engine.crystalFeedback).connect(engine.crystalDelay);
  engine.crystalDelay.connect(engine.dryBus);
  engine.noiseFilter.Q.value = 3.2;

  /* Support loss is heard as the floor going out from under the tone rather than
   * as a filter sweep, so the low body has its own gain to duck. */
  engine.bodyGain = context.createGain();
  engine.bodyGain.gain.value = 1;
  try { engine.filter.disconnect(engine.tonalGain); } catch { /* first install */ }
  engine.filter.connect(engine.bodyGain).connect(engine.tonalGain);

  engine.space = createSpaceLayer(context, engine.mixBus);
  engine.crystal = createCrystalLayer(context, engine.dryBus, SONIC_BASE_FREQUENCY);
  engine.crystal.input.connect(engine.space.send);

  /* A second tap off the shared deterministic noise buffer: the air band is the
   * same source as the texture layer, filtered an octave and a half higher. */
  engine.air = createAirLayer(context, engine.dryBus, engine.noiseSource);
  engine.air.gain.connect(engine.space.send);

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

  /* Width is the mapped value worked by the material: separation opens it,
   * compression closes it, and reconvergence pulls it back to centre. */
  const mappedWidth = effectiveStereoWidth(parameters);
  const width = clamp(mappedWidth * (0.75 + voice.spread * 0.45) * (1 - voice.converge * 0.18), 0.06, 1);

  ramp(engine.subGain.gain, 0.012 + tonal * 0.038 - brightness * 0.006, now, seconds("tonal_level"));
  ramp(engine.crystalFeedback.gain, clamp(0.08 + density * 0.12 + errorTexture * 0.055, 0.08, 0.24), now, Math.min(seconds("texture_density"), seconds("error_texture")));
  ramp(engine.crystalDelay.delayTime, clamp(0.011 * voice.combShift, 0.004, 0.038), now, seconds("texture_density"));
  ramp(engine.noiseFilter.Q, 2.6 + density * 4.8, now, seconds("texture_density"));
  ramp(engine.widthLeft.gain, width, now, seconds("stereo_width"));
  ramp(engine.widthRight.gain, -width, now, seconds("stereo_width"));

  /* The floor drop. Not a level change on the master - the body thins while the
   * upper structure stays, which is what a support collapse actually sounds
   * like, and it keeps failure from simply becoming louder or quieter. */
  ramp(engine.bodyGain.gain, clamp(1 - voice.floorDrop * 0.42, 0.5, 1), now, seconds("tonal_level"));

  const base = materialBaseFrequency(voice);
  engine.sonicBaseFrequency = base;
  updateCrystalLayer(engine.crystal, voice, base, brightness, now, SMOOTHING_SECONDS[smoothing.harmonic_brightness ?? "MEDIUM"]);
  updateAirLayer(engine.air, voice, now, SMOOTHING_SECONDS[smoothing.texture_density ?? "MEDIUM"]);
  updateSpaceLayer(engine.space, voice, now, SMOOTHING_SECONDS[smoothing.stereo_width ?? "MEDIUM"]);

  /* Domains: the tonal pair pulls apart and agrees again while the body stays
   * connected, which is what makes an oscillating regime read as reversible
   * rather than broken. */
  const domainCents = voice.domains * 26 + voice.split.detune * 34;
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

function pulseVoice(engine, start, frequency, peak, duration, pan, type = "sine") {
  const context = engine.context;
  const oscillator = context.createOscillator();
  const filter = context.createBiquadFilter();
  const gain = context.createGain();
  const panner = context.createStereoPanner();
  oscillator.type = type;
  oscillator.frequency.value = frequency;
  filter.type = "bandpass";
  filter.frequency.value = frequency * 1.55;
  filter.Q.value = 1.35;
  panner.pan.value = clamp(pan, -1, 1);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), start + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  oscillator.connect(filter).connect(gain).connect(panner).connect(engine.dryBus);
  oscillator.start(start);
  oscillator.stop(start + duration + 0.025);
}

/* Places one pulse at an explicit audio-clock time. The caller owns the grid. */
export function scheduleHeartbeat(engine, at) {
  if (engine.disposed || engine.context.state !== "running") return;
  const voice = voiceOf(engine);
  const start = Number.isFinite(at) ? at : engine.context.currentTime;
  const strength = engine.pulseIntensity;
  const base = engine.sonicBaseFrequency ?? 92;

  /* Pressure tightens the envelope rather than raising the level, so a
   * compressed regime reads as compressed time instead of more volume. */
  const bodyDuration = 0.13 * (1 - voice.density * 0.42) * (1 + voice.drag * 1.1);
  const pan = (engine.pulseCounter % 2 === 0 ? -0.08 : 0.08) * (1 + voice.spread * 0.6);

  pulseVoice(engine, start, base, 0.022 + strength * 0.078, bodyDuration, pan, "triangle");
  pulseVoice(engine, start + 0.055 * (1 + voice.drag * 0.9), base * 2.6, 0.01 + strength * 0.035, 0.075 * (1 + voice.drag), -pan * 0.5, "sine");

  /* Once the body has separated, the daughter answers the parent from its own
   * place in the image, detuned by however far apart they have travelled. */
  if (voice.split.active && voice.split.separation > 0.12) {
    const detune = 1 - voice.split.detune * 0.09;
    pulseVoice(
      engine,
      start + 0.026,
      base * 2.6 * detune,
      (0.008 + strength * 0.022) * voice.split.separation,
      0.06,
      clamp(voice.split.daughterPan * voice.split.separation, -1, 1),
      "sine",
    );
  }

  engine.pulseCounter += 1;
}

export function triggerSonicEvent(engine, health) {
  if (engine.context.state !== "running") return;
  const profile = HARMONIC_PROFILES[health] ?? HARMONIC_PROFILES.STABLE;
  const voice = voiceOf(engine);
  const ratios = profile.event;
  const base = (engine.sonicBaseFrequency ?? 92) * 4;
  const peak = health === "FAILED" ? 0.034 : health === "RECOVERING" ? 0.03 : 0.026;
  ratios.forEach((ratio, index) => {
    const start = engine.context.currentTime + index * 0.065 * (1 + voice.drag * 0.8);
    const duration = health === "RECOVERING" ? 0.42 + index * 0.08 : health === "FAILED" ? 0.24 : 0.18;
    pulseVoice(engine, start, base * ratio, peak, duration * (1 + voice.drag), (index - (ratios.length - 1) / 2) * 0.1, index === 0 ? "triangle" : "sine");
  });
}

export function disposeSonicNodes(engine) {
  if (!engine.sonicIdentityReady) return;
  const stopAt = engine.context.currentTime + 0.04;
  try { engine.subOscillator.stop(stopAt); } catch { /* already stopped */ }
  for (const partial of engine.crystal?.bank ?? []) {
    try { partial.oscillator.stop(stopAt); } catch { /* already stopped */ }
  }
}
