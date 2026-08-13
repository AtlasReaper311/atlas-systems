"use strict";

import { SMOOTHING_SECONDS, TARGET_BY_ID, clamp } from "./domain.js";

export const OUTPUT_CEILING_DBFS = -1;
export const OUTPUT_CEILING_LINEAR = 10 ** (OUTPUT_CEILING_DBFS / 20);
export const MASTER_MIN = 0.18;
export const MASTER_MAX = 0.78;
export const MASTER_DEFAULT = 0.56;

export const HEALTH_AUDIO_PROFILES = Object.freeze({
  STABLE: Object.freeze({ tonalScale: 1, textureScale: 0.9, widthScale: 1, pulseScale: 1, noiseBandScale: 1, brightnessScale: 1 }),
  PRESSURED: Object.freeze({ tonalScale: 0.96, textureScale: 1, widthScale: 0.92, pulseScale: 0.98, noiseBandScale: 0.92, brightnessScale: 0.94 }),
  DEGRADED: Object.freeze({ tonalScale: 0.88, textureScale: 1.08, widthScale: 0.82, pulseScale: 0.93, noiseBandScale: 0.82, brightnessScale: 0.86 }),
  FAILED: Object.freeze({ tonalScale: 0.76, textureScale: 1.12, widthScale: 0.68, pulseScale: 0.86, noiseBandScale: 0.72, brightnessScale: 0.78 }),
  RECOVERING: Object.freeze({ tonalScale: 0.92, textureScale: 0.96, widthScale: 0.88, pulseScale: 0.92, noiseBandScale: 0.9, brightnessScale: 0.92 }),
});

export function healthAudioProfile(health) {
  return HEALTH_AUDIO_PROFILES[health] ?? HEALTH_AUDIO_PROFILES.STABLE;
}

export function normaliseTarget(id, value) {
  const target = TARGET_BY_ID[id];
  if (!target) throw new TypeError(`Unknown audio target: ${id}`);
  return clamp((value - target.min) / (target.max - target.min));
}

export function linearToDb(value) {
  if (!Number.isFinite(value) || value <= 0) return -Infinity;
  return 20 * Math.log10(value);
}

export function createSoftClipCurve(size = 2048, drive = 1.35) {
  const length = Math.max(32, Math.floor(size));
  const curve = new Float32Array(length);
  const normaliser = Math.tanh(drive);
  for (let index = 0; index < length; index += 1) {
    const x = (index / (length - 1)) * 2 - 1;
    curve[index] = Math.tanh(x * drive) / normaliser;
  }
  return curve;
}

function ramp(parameter, value, now, seconds) {
  const finite = Number.isFinite(value) ? value : parameter.value;
  parameter.cancelScheduledValues(now);
  parameter.setValueAtTime(parameter.value, now);
  parameter.linearRampToValueAtTime(finite, now + Math.max(0.025, seconds));
}

function createDeterministicNoise(context) {
  const length = context.sampleRate * 2;
  const buffer = context.createBuffer(1, length, context.sampleRate);
  const data = buffer.getChannelData(0);
  let state = 0x6d2b79f5;
  for (let index = 0; index < length; index += 1) {
    state = Math.imul(state ^ (state >>> 15), 1 | state);
    state ^= state + Math.imul(state ^ (state >>> 7), 61 | state);
    data[index] = (((state ^ (state >>> 14)) >>> 0) / 4294967296) * 2 - 1;
  }
  return buffer;
}

function createStereoWidthStage(context) {
  const input = context.createGain();
  input.channelCount = 2;
  input.channelCountMode = "explicit";
  const splitter = context.createChannelSplitter(2);
  const mid = context.createGain();
  const side = context.createGain();
  const midLeft = context.createGain();
  const midRight = context.createGain();
  const sideLeft = context.createGain();
  const sideRight = context.createGain();
  const sideToLeft = context.createGain();
  const sideToRight = context.createGain();
  const merger = context.createChannelMerger(2);

  midLeft.gain.value = 0.5;
  midRight.gain.value = 0.5;
  sideLeft.gain.value = 0.5;
  sideRight.gain.value = -0.5;
  sideToLeft.gain.value = 0.34;
  sideToRight.gain.value = -0.34;

  input.connect(splitter);
  splitter.connect(midLeft, 0).connect(mid);
  splitter.connect(midRight, 1).connect(mid);
  splitter.connect(sideLeft, 0).connect(side);
  splitter.connect(sideRight, 1).connect(side);
  mid.connect(merger, 0, 0);
  mid.connect(merger, 0, 1);
  side.connect(sideToLeft).connect(merger, 0, 0);
  side.connect(sideToRight).connect(merger, 0, 1);

  return { input, output: merger, sideToLeft, sideToRight };
}

function createOscillatorVoice(context, { type, frequency, pan, gain }) {
  const oscillator = context.createOscillator();
  const gainNode = context.createGain();
  const panner = context.createStereoPanner();
  oscillator.type = type;
  oscillator.frequency.value = frequency;
  gainNode.gain.value = gain;
  panner.pan.value = pan;
  oscillator.connect(gainNode).connect(panner);
  return { oscillator, gain: gainNode, panner };
}

export class SpectralForgeAudioEngine {
  constructor(context) {
    this.context = context;
    this.disposed = false;
    this.muted = false;
    this.masterLevel = MASTER_DEFAULT;
    this.lastHealth = "STABLE";
    this.lastDeployEvent = false;
    this.pulseRate = 1.1;
    this.pulseIntensity = 0.24;
    this.nextPulseAt = context.currentTime + 0.15;
    this.pulseCounter = 0;
    this.pulseTimer = null;

    this.dryBus = context.createGain();
    this.dryBus.gain.value = 1;
    this.filter = context.createBiquadFilter();
    this.filter.type = "lowpass";
    this.filter.frequency.value = 3200;
    this.filter.Q.value = 0.72;
    this.tonalGain = context.createGain();
    this.tonalGain.gain.value = 0.38;

    this.primary = createOscillatorVoice(context, { type: "triangle", frequency: 110, pan: 0, gain: 0.28 });
    this.harmonic = createOscillatorVoice(context, { type: "sine", frequency: 165, pan: -0.38, gain: 0.14 });
    this.shimmer = createOscillatorVoice(context, { type: "sine", frequency: 330, pan: 0.38, gain: 0.065 });
    this.primary.panner.connect(this.filter);
    this.harmonic.panner.connect(this.filter);
    this.shimmer.panner.connect(this.filter);
    this.filter.connect(this.tonalGain).connect(this.dryBus);

    this.noiseSource = context.createBufferSource();
    this.noiseSource.buffer = createDeterministicNoise(context);
    this.noiseSource.loop = true;
    this.noiseFilter = context.createBiquadFilter();
    this.noiseFilter.type = "bandpass";
    this.noiseFilter.frequency.value = 820;
    this.noiseFilter.Q.value = 0.8;
    this.noiseGain = context.createGain();
    this.noiseGain.gain.value = 0;
    this.noisePanner = context.createStereoPanner();
    this.noisePanner.pan.value = -0.12;
    this.noiseSource.connect(this.noiseFilter).connect(this.noiseGain).connect(this.noisePanner).connect(this.dryBus);

    this.delay = context.createDelay(0.6);
    this.delay.delayTime.value = 0.24;
    this.delayFeedback = context.createGain();
    this.delayFeedback.gain.value = 0.07;
    this.delayWet = context.createGain();
    this.delayWet.gain.value = 0.035;
    this.dryBus.connect(this.delay);
    this.delay.connect(this.delayFeedback).connect(this.delay);
    this.delay.connect(this.delayWet);

    this.mixBus = context.createGain();
    this.dryBus.connect(this.mixBus);
    this.delayWet.connect(this.mixBus);

    this.compressor = context.createDynamicsCompressor();
    this.compressor.threshold.value = -18;
    this.compressor.knee.value = 12;
    this.compressor.ratio.value = 3.2;
    this.compressor.attack.value = 0.008;
    this.compressor.release.value = 0.18;
    this.mixBus.connect(this.compressor);

    const width = createStereoWidthStage(context);
    this.widthInput = width.input;
    this.widthOutput = width.output;
    this.widthLeft = width.sideToLeft;
    this.widthRight = width.sideToRight;
    this.compressor.connect(this.widthInput);

    this.master = context.createGain();
    this.master.gain.value = 0;
    this.softClipper = context.createWaveShaper();
    this.softClipper.curve = createSoftClipCurve();
    this.softClipper.oversample = "2x";
    this.ceiling = context.createGain();
    this.ceiling.gain.value = OUTPUT_CEILING_LINEAR;
    this.analyser = context.createAnalyser();
    this.analyser.fftSize = 2048;
    this.analyser.smoothingTimeConstant = 0.72;

    this.widthOutput.connect(this.master).connect(this.softClipper).connect(this.ceiling).connect(this.analyser).connect(context.destination);

    this.primary.oscillator.start();
    this.harmonic.oscillator.start();
    this.shimmer.oscillator.start();
    this.noiseSource.start();
    this.pulseTimer = setInterval(() => this.schedulePulse(), 24);
  }

  async activate(level = MASTER_DEFAULT) {
    this.masterLevel = clamp(level, MASTER_MIN, MASTER_MAX);
    await this.context.resume();
    const now = this.context.currentTime;
    this.master.gain.setValueAtTime(0.0001, now);
    this.master.gain.exponentialRampToValueAtTime(this.masterLevel, now + 0.42);
  }

  update(parameters, smoothing, health, deployEvent) {
    if (this.disposed) return;
    const now = this.context.currentTime;
    const seconds = (target) => SMOOTHING_SECONDS[smoothing[target] ?? "MEDIUM"];
    const profile = healthAudioProfile(health);

    ramp(this.filter.frequency, clamp(parameters.filter_cutoff, 180, 8000), now, seconds("filter_cutoff"));

    const brightness = normaliseTarget("harmonic_brightness", parameters.harmonic_brightness);
    ramp(this.harmonic.gain.gain, (0.08 + brightness * 0.16) * profile.brightnessScale, now, seconds("harmonic_brightness"));
    ramp(this.shimmer.gain.gain, (0.025 + brightness * 0.09) * profile.brightnessScale, now, seconds("harmonic_brightness"));
    ramp(this.primary.gain.gain, (0.3 - brightness * 0.075) * profile.tonalScale, now, seconds("harmonic_brightness"));

    const tonalLevel = normaliseTarget("tonal_level", parameters.tonal_level);
    const instabilityNormalised = normaliseTarget("instability", parameters.instability);
    const compensation = 1 - instabilityNormalised * 0.1;
    ramp(this.tonalGain.gain, (0.28 + tonalLevel * 0.42) * compensation * profile.tonalScale, now, seconds("tonal_level"));

    const instability = clamp(parameters.instability, 0, 35);
    ramp(this.primary.oscillator.detune, -instability * 0.45, now, seconds("instability"));
    ramp(this.harmonic.oscillator.detune, instability * 0.62, now, seconds("instability"));
    ramp(this.shimmer.oscillator.detune, instability * -0.81, now, seconds("instability"));

    const density = normaliseTarget("texture_density", parameters.texture_density);
    const errorTexture = normaliseTarget("error_texture", parameters.error_texture);
    ramp(this.noiseGain.gain, (density * 0.024 + errorTexture * 0.065) * profile.textureScale, now, Math.min(seconds("texture_density"), seconds("error_texture")));
    ramp(this.noiseFilter.frequency, (520 + density * 2350) * profile.noiseBandScale, now, seconds("texture_density"));

    const width = normaliseTarget("stereo_width", parameters.stereo_width) * profile.widthScale;
    ramp(this.widthLeft.gain, width, now, seconds("stereo_width"));
    ramp(this.widthRight.gain, -width, now, seconds("stereo_width"));

    const delay = normaliseTarget("delay", parameters.delay);
    ramp(this.delayWet.gain, delay * 0.24, now, seconds("delay"));
    ramp(this.delayFeedback.gain, Math.min(0.38, delay * 0.38), now, seconds("delay"));

    this.pulseRate = clamp(parameters.pulse_rate, 0.25, 8);
    this.pulseIntensity = normaliseTarget("pulse_intensity", parameters.pulse_intensity) * profile.pulseScale;

    if (health !== this.lastHealth) {
      this.setHarmonicState(health);
      this.triggerEvent("health", health);
      this.lastHealth = health;
    }
    if (deployEvent && !this.lastDeployEvent) this.triggerEvent("deploy", health);
    this.lastDeployEvent = deployEvent;
  }

  setHarmonicState(health) {
    const ratios = { STABLE: 1.5, PRESSURED: 1.414, DEGRADED: 1.366, FAILED: 1.2, RECOVERING: 1.48 };
    const ratio = ratios[health] ?? ratios.STABLE;
    const now = this.context.currentTime;
    ramp(this.harmonic.oscillator.frequency, 110 * ratio, now, 0.7);
    ramp(this.shimmer.oscillator.frequency, 220 * ratio, now, 0.9);
  }

  schedulePulse() {
    if (this.disposed || this.context.state !== "running") return;
    const now = this.context.currentTime;
    if (now + 0.04 < this.nextPulseAt) return;
    const oscillator = this.context.createOscillator();
    const filter = this.context.createBiquadFilter();
    const gain = this.context.createGain();
    const panner = this.context.createStereoPanner();
    oscillator.type = "sine";
    oscillator.frequency.value = 220;
    filter.type = "bandpass";
    filter.frequency.value = 780;
    filter.Q.value = 1.1;
    panner.pan.value = this.pulseCounter % 2 === 0 ? -0.22 : 0.22;
    const peak = 0.018 + this.pulseIntensity * 0.075;
    gain.gain.setValueAtTime(0.0001, this.nextPulseAt);
    gain.gain.exponentialRampToValueAtTime(peak, this.nextPulseAt + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, this.nextPulseAt + 0.11);
    oscillator.connect(filter).connect(gain).connect(panner).connect(this.dryBus);
    oscillator.start(this.nextPulseAt);
    oscillator.stop(this.nextPulseAt + 0.13);
    this.pulseCounter += 1;
    this.nextPulseAt += 1 / this.pulseRate;
    if (this.nextPulseAt < now) this.nextPulseAt = now + 1 / this.pulseRate;
  }

  triggerEvent(kind, health) {
    if (this.context.state !== "running") return;
    const now = this.context.currentTime;
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    const panner = this.context.createStereoPanner();
    oscillator.type = kind === "deploy" ? "triangle" : "sine";
    const healthFrequency = { STABLE: 330, PRESSURED: 277, DEGRADED: 233, FAILED: 185, RECOVERING: 294 };
    oscillator.frequency.setValueAtTime(kind === "deploy" ? 440 : (healthFrequency[health] ?? 330), now);
    if (kind === "deploy") oscillator.frequency.exponentialRampToValueAtTime(660, now + 0.18);
    panner.pan.value = kind === "deploy" ? 0.18 : -0.1;
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(kind === "deploy" ? 0.075 : 0.048, now + 0.018);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + (kind === "deploy" ? 0.42 : 0.2));
    oscillator.connect(gain).connect(panner).connect(this.dryBus);
    oscillator.start(now);
    oscillator.stop(now + (kind === "deploy" ? 0.45 : 0.23));
  }

  setMuted(muted) {
    this.muted = Boolean(muted);
    const now = this.context.currentTime;
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setValueAtTime(Math.max(0.0001, this.master.gain.value), now);
    this.master.gain.exponentialRampToValueAtTime(this.muted ? 0.0001 : this.masterLevel, now + 0.035);
  }

  setMasterLevel(level) {
    this.masterLevel = clamp(level, MASTER_MIN, MASTER_MAX);
    if (!this.muted) ramp(this.master.gain, this.masterLevel, this.context.currentTime, 0.08);
  }

  safeReset() {
    if (this.disposed) return;
    const now = this.context.currentTime;
    const target = this.muted ? 0.0001 : this.masterLevel;
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setValueAtTime(Math.max(0.0001, this.master.gain.value), now);
    this.master.gain.exponentialRampToValueAtTime(0.0001, now + 0.07);
    this.master.gain.exponentialRampToValueAtTime(target, now + 0.22);
    this.nextPulseAt = now + 0.28;
    this.lastHealth = "STABLE";
    this.lastDeployEvent = false;
  }

  async dispose() {
    if (this.disposed) return;
    this.disposed = true;
    if (this.pulseTimer) clearInterval(this.pulseTimer);
    const now = this.context.currentTime;
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setTargetAtTime(0.0001, now, 0.02);
    try {
      this.primary.oscillator.stop(now + 0.08);
      this.harmonic.oscillator.stop(now + 0.08);
      this.shimmer.oscillator.stop(now + 0.08);
      this.noiseSource.stop(now + 0.08);
    } catch {
      // Nodes may already have stopped during page teardown.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
    await this.context.close();
  }
}

export function createAudioContext() {
  const Constructor = window.AudioContext ?? window.webkitAudioContext;
  if (!Constructor) throw new Error("Web Audio API is unavailable in this browser.");
  return new Constructor({ latencyHint: "interactive" });
}
