import {
  HealthState,
  SMOOTHING_SECONDS,
  SmoothingType,
  TARGET_BY_ID,
  TargetId,
} from "./signal-forge";

export type AudioParameters = Record<TargetId, number>;
export type TargetSmoothing = Partial<Record<TargetId, SmoothingType>>;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function normaliseTarget(id: TargetId, value: number) {
  const target = TARGET_BY_ID[id];
  return clamp((value - target.min) / (target.max - target.min), 0, 1);
}

function createDeterministicNoise(context: AudioContext) {
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

function ramp(parameter: AudioParam, value: number, now: number, seconds: number) {
  parameter.cancelScheduledValues(now);
  parameter.setValueAtTime(parameter.value, now);
  parameter.linearRampToValueAtTime(value, now + Math.max(0.025, seconds));
}

export class SignalForgeAudioEngine {
  readonly context: AudioContext;
  readonly analyser: AnalyserNode;

  private master: GainNode;
  private compressor: DynamicsCompressorNode;
  private limiter: DynamicsCompressorNode;
  private filter: BiquadFilterNode;
  private primaryOscillator: OscillatorNode;
  private harmonicOscillator: OscillatorNode;
  private shimmerOscillator: OscillatorNode;
  private primaryGain: GainNode;
  private harmonicGain: GainNode;
  private shimmerGain: GainNode;
  private tonalGain: GainNode;
  private panner: StereoPannerNode;
  private delay: DelayNode;
  private delayFeedback: GainNode;
  private delayWet: GainNode;
  private noiseSource: AudioBufferSourceNode;
  private noiseFilter: BiquadFilterNode;
  private noiseGain: GainNode;
  private pulseTimer: ReturnType<typeof setInterval> | null = null;
  private nextPulseAt = 0;
  private pulseRate = 1;
  private pulseIntensity = 0.2;
  private masterLevel = 0.4;
  private muted = false;
  private lastHealth: HealthState = "STABLE";
  private lastDeployEvent = false;
  private disposed = false;

  constructor(context: AudioContext) {
    this.context = context;

    this.master = context.createGain();
    this.master.gain.value = 0;
    this.compressor = context.createDynamicsCompressor();
    this.compressor.threshold.value = -24;
    this.compressor.knee.value = 18;
    this.compressor.ratio.value = 10;
    this.compressor.attack.value = 0.004;
    this.compressor.release.value = 0.24;
    this.limiter = context.createDynamicsCompressor();
    this.limiter.threshold.value = -2;
    this.limiter.knee.value = 0;
    this.limiter.ratio.value = 20;
    this.limiter.attack.value = 0.001;
    this.limiter.release.value = 0.12;
    this.analyser = context.createAnalyser();
    this.analyser.fftSize = 1024;
    this.analyser.smoothingTimeConstant = 0.74;

    this.filter = context.createBiquadFilter();
    this.filter.type = "lowpass";
    this.filter.frequency.value = 3200;
    this.filter.Q.value = 0.72;
    this.primaryOscillator = context.createOscillator();
    this.primaryOscillator.type = "triangle";
    this.primaryOscillator.frequency.value = 110;
    this.harmonicOscillator = context.createOscillator();
    this.harmonicOscillator.type = "sine";
    this.harmonicOscillator.frequency.value = 165;
    this.shimmerOscillator = context.createOscillator();
    this.shimmerOscillator.type = "sine";
    this.shimmerOscillator.frequency.value = 330;
    this.primaryGain = context.createGain();
    this.primaryGain.gain.value = 0.21;
    this.harmonicGain = context.createGain();
    this.harmonicGain.gain.value = 0.09;
    this.shimmerGain = context.createGain();
    this.shimmerGain.gain.value = 0.035;
    this.tonalGain = context.createGain();
    this.tonalGain.gain.value = 0.26;
    this.panner = context.createStereoPanner();
    this.panner.pan.value = 0;

    this.delay = context.createDelay(0.6);
    this.delay.delayTime.value = 0.24;
    this.delayFeedback = context.createGain();
    this.delayFeedback.gain.value = 0.08;
    this.delayWet = context.createGain();
    this.delayWet.gain.value = 0.04;

    this.noiseSource = context.createBufferSource();
    this.noiseSource.buffer = createDeterministicNoise(context);
    this.noiseSource.loop = true;
    this.noiseFilter = context.createBiquadFilter();
    this.noiseFilter.type = "bandpass";
    this.noiseFilter.frequency.value = 820;
    this.noiseFilter.Q.value = 0.8;
    this.noiseGain = context.createGain();
    this.noiseGain.gain.value = 0;

    this.primaryOscillator.connect(this.primaryGain).connect(this.filter);
    this.harmonicOscillator.connect(this.harmonicGain).connect(this.filter);
    this.shimmerOscillator.connect(this.shimmerGain).connect(this.filter);
    this.filter.connect(this.tonalGain).connect(this.panner);
    this.panner.connect(this.compressor);
    this.panner.connect(this.delay);
    this.delay.connect(this.delayWet).connect(this.compressor);
    this.delay.connect(this.delayFeedback).connect(this.delay);
    this.noiseSource.connect(this.noiseFilter).connect(this.noiseGain).connect(this.compressor);
    this.compressor.connect(this.master).connect(this.limiter).connect(this.analyser).connect(context.destination);

    this.primaryOscillator.start();
    this.harmonicOscillator.start();
    this.shimmerOscillator.start();
    this.noiseSource.start();
    this.nextPulseAt = context.currentTime + 0.15;
    this.pulseTimer = setInterval(() => this.schedulePulse(), 24);
  }

  async activate(level = 0.4) {
    this.masterLevel = clamp(level, 0.18, 0.71);
    await this.context.resume();
    const now = this.context.currentTime;
    this.master.gain.setValueAtTime(0.0001, now);
    this.master.gain.exponentialRampToValueAtTime(this.masterLevel, now + 0.5);
  }

  update(
    parameters: AudioParameters,
    smoothing: TargetSmoothing,
    health: HealthState,
    deployEvent: boolean,
  ) {
    if (this.disposed) return;
    const now = this.context.currentTime;
    const seconds = (target: TargetId) => SMOOTHING_SECONDS[smoothing[target] ?? "MEDIUM"];

    ramp(this.filter.frequency, clamp(parameters.filter_cutoff, 180, 8000), now, seconds("filter_cutoff"));
    const brightness = normaliseTarget("harmonic_brightness", parameters.harmonic_brightness);
    ramp(this.harmonicGain.gain, 0.055 + brightness * 0.13, now, seconds("harmonic_brightness"));
    ramp(this.shimmerGain.gain, 0.018 + brightness * 0.065, now, seconds("harmonic_brightness"));
    ramp(this.primaryGain.gain, 0.22 - brightness * 0.07, now, seconds("harmonic_brightness"));
    const tonalLevel = normaliseTarget("tonal_level", parameters.tonal_level);
    const instabilityNormalised = normaliseTarget("instability", parameters.instability);
    const loudnessCompensation = 1 - instabilityNormalised * 0.14;
    ramp(this.tonalGain.gain, (0.18 + tonalLevel * 0.32) * loudnessCompensation, now, seconds("tonal_level"));

    const instability = clamp(parameters.instability, 0, 35);
    ramp(this.primaryOscillator.detune, -instability * 0.45, now, seconds("instability"));
    ramp(this.harmonicOscillator.detune, instability * 0.62, now, seconds("instability"));
    ramp(this.shimmerOscillator.detune, instability * -0.81, now, seconds("instability"));

    const density = normaliseTarget("texture_density", parameters.texture_density);
    const errorTexture = normaliseTarget("error_texture", parameters.error_texture);
    ramp(this.noiseGain.gain, density * 0.018 + errorTexture * 0.045, now, Math.min(seconds("texture_density"), seconds("error_texture")));
    ramp(this.noiseFilter.frequency, 520 + density * 2100, now, seconds("texture_density"));

    const width = normaliseTarget("stereo_width", parameters.stereo_width);
    const pan = Math.sin(now * 0.31) * width * 0.38;
    ramp(this.panner.pan, pan, now, seconds("stereo_width"));

    const delay = normaliseTarget("delay", parameters.delay);
    ramp(this.delayWet.gain, delay * 0.2, now, seconds("delay"));
    ramp(this.delayFeedback.gain, Math.min(0.42, delay * 0.42), now, seconds("delay"));

    this.pulseRate = clamp(parameters.pulse_rate, 0.25, 8);
    this.pulseIntensity = normaliseTarget("pulse_intensity", parameters.pulse_intensity);

    if (health !== this.lastHealth) {
      this.setHarmonicState(health);
      this.triggerEvent("health", health);
      this.lastHealth = health;
    }
    if (deployEvent && !this.lastDeployEvent) this.triggerEvent("deploy", health);
    this.lastDeployEvent = deployEvent;
  }

  private setHarmonicState(health: HealthState) {
    const ratios: Record<HealthState, number> = {
      STABLE: 1.5,
      PRESSURED: 1.414,
      DEGRADED: 1.366,
      FAILED: 1.2,
      RECOVERING: 1.48,
    };
    const now = this.context.currentTime;
    ramp(this.harmonicOscillator.frequency, 110 * ratios[health], now, 0.7);
    ramp(this.shimmerOscillator.frequency, 220 * ratios[health], now, 0.9);
  }

  private schedulePulse() {
    if (this.disposed || this.context.state !== "running") return;
    const now = this.context.currentTime;
    if (now + 0.04 < this.nextPulseAt) return;
    const oscillator = this.context.createOscillator();
    const filter = this.context.createBiquadFilter();
    const gain = this.context.createGain();
    oscillator.type = "sine";
    oscillator.frequency.value = 220;
    filter.type = "bandpass";
    filter.frequency.value = 750;
    filter.Q.value = 1.1;
    const peak = 0.012 + this.pulseIntensity * 0.055;
    gain.gain.setValueAtTime(0.0001, this.nextPulseAt);
    gain.gain.exponentialRampToValueAtTime(peak, this.nextPulseAt + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, this.nextPulseAt + 0.11);
    oscillator.connect(filter).connect(gain).connect(this.compressor);
    oscillator.start(this.nextPulseAt);
    oscillator.stop(this.nextPulseAt + 0.13);
    this.nextPulseAt += 1 / this.pulseRate;
    if (this.nextPulseAt < now) this.nextPulseAt = now + 1 / this.pulseRate;
  }

  private triggerEvent(kind: "deploy" | "health", health: HealthState) {
    if (this.context.state !== "running") return;
    const now = this.context.currentTime;
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    oscillator.type = kind === "deploy" ? "triangle" : "sine";
    const healthFrequency: Record<HealthState, number> = {
      STABLE: 330,
      PRESSURED: 277,
      DEGRADED: 233,
      FAILED: 185,
      RECOVERING: 294,
    };
    oscillator.frequency.setValueAtTime(kind === "deploy" ? 440 : healthFrequency[health], now);
    if (kind === "deploy") oscillator.frequency.exponentialRampToValueAtTime(660, now + 0.18);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(kind === "deploy" ? 0.06 : 0.035, now + 0.018);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + (kind === "deploy" ? 0.42 : 0.2));
    oscillator.connect(gain).connect(this.compressor);
    oscillator.start(now);
    oscillator.stop(now + (kind === "deploy" ? 0.45 : 0.23));
  }

  setMuted(muted: boolean) {
    this.muted = muted;
    const now = this.context.currentTime;
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setValueAtTime(Math.max(0.0001, this.master.gain.value), now);
    this.master.gain.exponentialRampToValueAtTime(muted ? 0.0001 : this.masterLevel, now + 0.035);
  }

  setMasterLevel(level: number) {
    this.masterLevel = clamp(level, 0.18, 0.71);
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
      this.primaryOscillator.stop(now + 0.08);
      this.harmonicOscillator.stop(now + 0.08);
      this.shimmerOscillator.stop(now + 0.08);
      this.noiseSource.stop(now + 0.08);
    } catch {
      // Nodes may already be stopped during page teardown.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
    await this.context.close();
  }
}

export function createAudioContext() {
  const AudioContextConstructor = window.AudioContext ?? (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextConstructor) throw new Error("Web Audio API is unavailable in this browser.");
  return new AudioContextConstructor({ latencyHint: "interactive" });
}
