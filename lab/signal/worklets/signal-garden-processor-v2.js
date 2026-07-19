const MAX_GRAINS = 48;
const MIN_ADAPTIVE_GRAINS = 24;
const GRAIN_STATE_STRIDE = 4;
const GRAIN_STATE_LENGTH = MAX_GRAINS * GRAIN_STATE_STRIDE;
const STATE_BUFFER_COUNT = 2;
const TWO_PI = Math.PI * 2;
const SPECTRAL_SIZE = 256;
const SPECTRAL_HOP = 128;
const LAYER_HARMONIC = 0;
const LAYER_RESONATOR = 1;
const LAYER_TRANSIENT = 2;
const LAYER_NOISE = 3;
const LAYER_FM = 4;
const LAYER_SUB = 5;
const LAYER_AIR = 6;
const LAYER_COUNT = 7;

const LIFECYCLES = [
  "DORMANT",
  "GERMINATION",
  "BLOOM",
  "MIGRATION",
  "STORM",
  "DECAY",
  "REGENERATION",
];

const LIFECYCLE_PROFILES = {
  DORMANT: { density: 0.46, brightness: 0.62, event: 0.35, resonance: 0.74, motion: "suspended", layer: [0.9, 0.76, 0.22, 0.48, 0.34, 0.9, 0.36] },
  GERMINATION: { density: 0.72, brightness: 0.86, event: 0.72, resonance: 0.92, motion: "gathering", layer: [1, 0.94, 0.7, 0.62, 0.5, 0.7, 0.62] },
  BLOOM: { density: 1.05, brightness: 1.08, event: 0.9, resonance: 1.16, motion: "expanding", layer: [1.08, 1.18, 0.92, 0.6, 0.58, 0.52, 0.9] },
  MIGRATION: { density: 0.88, brightness: 0.96, event: 0.62, resonance: 0.96, motion: "migrating", layer: [0.9, 0.9, 0.62, 0.66, 0.62, 0.58, 0.72] },
  STORM: { density: 1.18, brightness: 1.12, event: 1.36, resonance: 1.02, motion: "turbulent", layer: [0.82, 1.02, 1.34, 1.18, 1.35, 0.42, 1.1] },
  DECAY: { density: 0.42, brightness: 0.68, event: 0.2, resonance: 1.08, motion: "falling away", layer: [0.62, 1.04, 0.18, 0.52, 0.28, 0.62, 0.58] },
  REGENERATION: { density: 0.76, brightness: 0.92, event: 1.02, resonance: 0.9, motion: "regrowing", layer: [1.02, 0.88, 1.08, 0.68, 0.72, 0.56, 0.76] },
};

class Lcg {
  constructor(seed = 311) {
    this.state = seed >>> 0 || 311;
  }

  next() {
    this.state = (1664525 * this.state + 1013904223) >>> 0;
    return this.state / 4294967296;
  }

  bipolar() {
    return this.next() * 2 - 1;
  }
}

class DelayLine {
  constructor(length) {
    this.buffer = new Float32Array(length);
    this.index = 0;
  }

  read(offset = 0) {
    let position = this.index - offset;
    while (position < 0) position += this.buffer.length;
    while (position >= this.buffer.length) position -= this.buffer.length;
    const index = Math.floor(position);
    const next = (index + 1) % this.buffer.length;
    const fraction = position - index;
    return this.buffer[index] * (1 - fraction) + this.buffer[next] * fraction;
  }

  write(value) {
    this.buffer[this.index] = value;
    this.index = (this.index + 1) % this.buffer.length;
  }
}

class ModalResonator {
  constructor() {
    this.y1 = 0;
    this.y2 = 0;
    this.coefficient = 0;
    this.radiusSquared = 0;
    this.inputScale = 0.01;
  }

  configure(frequency, decaySeconds) {
    const safeFrequency = Math.min(sampleRate * 0.44, Math.max(20, frequency));
    const radius = Math.exp(-1 / Math.max(1, decaySeconds * sampleRate));
    this.coefficient = 2 * radius * Math.cos((TWO_PI * safeFrequency) / sampleRate);
    this.radiusSquared = radius * radius;
    this.inputScale = Math.max(0.0015, 1 - radius) * 8;
  }

  process(input) {
    const output = input * this.inputScale + this.coefficient * this.y1 - this.radiusSquared * this.y2;
    this.y2 = this.y1;
    this.y1 = output;
    return output;
  }

  reset() {
    this.y1 = 0;
    this.y2 = 0;
  }
}

class SpectralVeil {
  constructor() {
    this.size = SPECTRAL_SIZE;
    this.hop = SPECTRAL_HOP;
    this.input = new Float32Array(this.size);
    this.output = new Float32Array(this.size);
    this.real = new Float64Array(this.size);
    this.imag = new Float64Array(this.size);
    this.window = new Float64Array(this.size);
    this.magnitudes = new Float64Array(this.size / 2 + 1);
    this.phases = new Float64Array(this.size / 2 + 1);
    this.frozenMagnitudes = new Float64Array(this.size / 2 + 1);
    this.smoothMagnitudes = new Float64Array(this.size / 2 + 1);
    this.writeIndex = 0;
    this.hopCounter = 0;
    this.freezeCaptured = false;
    this.mode = "off";

    for (let index = 0; index < this.size; index += 1) {
      this.window[index] = Math.sin((Math.PI * index) / this.size) ** 2;
    }
  }

  setMode(mode) {
    this.mode = mode;
    if (mode !== "freeze") this.freezeCaptured = false;
    if (mode === "off") {
      this.output.fill(0);
      this.hopCounter = 0;
    }
  }

  fft(inverse) {
    const size = this.size;
    for (let index = 1, j = 0; index < size; index += 1) {
      let bit = size >> 1;
      for (; j & bit; bit >>= 1) j ^= bit;
      j ^= bit;
      if (index < j) {
        const real = this.real[index];
        const imag = this.imag[index];
        this.real[index] = this.real[j];
        this.imag[index] = this.imag[j];
        this.real[j] = real;
        this.imag[j] = imag;
      }
    }

    for (let length = 2; length <= size; length <<= 1) {
      const angle = (inverse ? TWO_PI : -TWO_PI) / length;
      const stepReal = Math.cos(angle);
      const stepImag = Math.sin(angle);
      for (let start = 0; start < size; start += length) {
        let twiddleReal = 1;
        let twiddleImag = 0;
        const half = length >> 1;
        for (let offset = 0; offset < half; offset += 1) {
          const even = start + offset;
          const odd = even + half;
          const oddReal = this.real[odd] * twiddleReal - this.imag[odd] * twiddleImag;
          const oddImag = this.real[odd] * twiddleImag + this.imag[odd] * twiddleReal;
          const evenReal = this.real[even];
          const evenImag = this.imag[even];
          this.real[even] = evenReal + oddReal;
          this.imag[even] = evenImag + oddImag;
          this.real[odd] = evenReal - oddReal;
          this.imag[odd] = evenImag - oddImag;
          const nextReal = twiddleReal * stepReal - twiddleImag * stepImag;
          twiddleImag = twiddleReal * stepImag + twiddleImag * stepReal;
          twiddleReal = nextReal;
        }
      }
    }

    if (inverse) {
      for (let index = 0; index < size; index += 1) {
        this.real[index] /= size;
        this.imag[index] /= size;
      }
    }
  }

  processFrame() {
    const size = this.size;
    const half = size / 2;
    for (let index = 0; index < size; index += 1) {
      const sourceIndex = (this.writeIndex + index) % size;
      this.real[index] = this.input[sourceIndex] * this.window[index];
      this.imag[index] = 0;
    }
    this.fft(false);

    for (let bin = 0; bin <= half; bin += 1) {
      const real = this.real[bin];
      const imag = this.imag[bin];
      this.magnitudes[bin] = Math.hypot(real, imag);
      this.phases[bin] = Math.atan2(imag, real);
    }

    if (this.mode === "freeze" && !this.freezeCaptured) {
      this.frozenMagnitudes.set(this.magnitudes);
      this.freezeCaptured = true;
    }

    for (let bin = 0; bin <= half; bin += 1) {
      let magnitude = this.magnitudes[bin];
      let phase = this.phases[bin];
      if (this.mode === "freeze") {
        magnitude = this.frozenMagnitudes[bin];
      } else if (this.mode === "blur") {
        const previous = this.smoothMagnitudes[bin];
        const smoothed = previous === 0 ? magnitude : previous * 0.965 + magnitude * 0.035;
        this.smoothMagnitudes[bin] = smoothed;
        magnitude = smoothed;
      } else if (this.mode === "shimmer") {
        const sourceBin = Math.min(half, Math.floor(bin / 1.5));
        magnitude = this.magnitudes[sourceBin] * 0.82;
        phase = this.phases[sourceBin];
      }
      this.real[bin] = magnitude * Math.cos(phase);
      this.imag[bin] = magnitude * Math.sin(phase);
      if (bin > 0 && bin < half) {
        const mirror = size - bin;
        this.real[mirror] = this.real[bin];
        this.imag[mirror] = -this.imag[bin];
      }
    }

    this.fft(true);
    for (let index = 0; index < size; index += 1) {
      const outputIndex = (this.writeIndex + index) % size;
      this.output[outputIndex] += this.real[index] * this.window[index];
    }
  }

  process(input) {
    const output = this.output[this.writeIndex];
    this.output[this.writeIndex] = 0;
    this.input[this.writeIndex] = input;
    this.writeIndex = (this.writeIndex + 1) % this.size;
    if (this.mode !== "off") {
      this.hopCounter += 1;
      if (this.hopCounter >= this.hop) {
        this.hopCounter = 0;
        this.processFrame();
      }
    }
    return output;
  }
}

class SignalGardenProcessorV2 extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: "density", defaultValue: 0.72, minValue: 0.02, maxValue: 1, automationRate: "k-rate" },
      { name: "grainSize", defaultValue: 0.11, minValue: 0.03, maxValue: 0.75, automationRate: "k-rate" },
      { name: "spread", defaultValue: 0.76, minValue: 0, maxValue: 1, automationRate: "k-rate" },
      { name: "tone", defaultValue: 0.82, minValue: 0, maxValue: 1, automationRate: "k-rate" },
      { name: "tension", defaultValue: 0.12, minValue: 0, maxValue: 1, automationRate: "k-rate" },
      { name: "texture", defaultValue: 0.3, minValue: 0, maxValue: 1, automationRate: "k-rate" },
      { name: "width", defaultValue: 0.94, minValue: 0, maxValue: 1, automationRate: "k-rate" },
      { name: "feedback", defaultValue: 0.48, minValue: 0, maxValue: 0.82, automationRate: "k-rate" },
      { name: "evolution", defaultValue: 0.78, minValue: 0, maxValue: 1, automationRate: "k-rate" },
      { name: "quantize", defaultValue: 0.96, minValue: 0, maxValue: 1, automationRate: "k-rate" },
      { name: "lushness", defaultValue: 0.46, minValue: 0, maxValue: 1, automationRate: "k-rate" },
      { name: "shape", defaultValue: 0.24, minValue: 0, maxValue: 1, automationRate: "k-rate" },
    ];
  }

  constructor() {
    super();
    this.seed = 311;
    this.random = new Lcg(this.seed);
    this.evolutionRandom = new Lcg(this.seed ^ 0x9e3779b9);
    this.eventRandom = new Lcg(this.seed ^ 0x85ebca6b);
    this.source = new Float32Array(Math.floor(sampleRate * 8));
    this.externalSource = null;
    this.externalSourceSampleRate = sampleRate;
    this.sourceMode = "procedural";
    this.sourceWrite = 0;
    this.sampleCounter = 0;

    this.harmonicPhase = new Float64Array(7);
    this.harmonicRatios = new Float64Array([1, 1.5, 2, 2.5, 3, 4, 5]);
    this.fmCarrierPhase = 0;
    this.fmModPhase = 0;
    this.subPhase = 0;
    this.noiseLow = 0;
    this.noisePrevious = 0;
    this.noiseBrown = 0;

    this.resonators = [];
    this.modalRatios = new Float32Array([1, 1.498, 2.01, 2.67, 3.76, 5.11]);
    for (let index = 0; index < 6; index += 1) this.resonators.push(new ModalResonator());
    this.resonatorRoot = 110;
    this.resonatorDecay = 2.4;
    this.configureResonators();

    this.eventCountdown = Math.floor(sampleRate * 3);
    this.eventAge = 1;
    this.eventLength = 1;
    this.eventType = 0;
    this.eventFrequency = 900;
    this.eventPhase = 0;
    this.eventStrength = 0;
    this.eventRate = 0.7;

    this.grains = [];
    this.grainPool = [];
    this.spawnPhase = 0;
    this.low = new Float64Array(2);
    this.band = new Float64Array(2);
    this.dcX = new Float64Array(2);
    this.dcY = new Float64Array(2);
    this.grainMix = new Float64Array(2);
    this.feedbackMix = new Float64Array(2);
    this.delays = [1493, 1601, 1747, 1867].map(
      (length) => new DelayLine(Math.round((length * sampleRate) / 48000)),
    );

    this.spectral = new SpectralVeil();
    this.spectralMode = "off";
    this.weatherModDepth = 0.72;
    this.weatherRateScale = 0.82;
    this.weatherWet = 0.72;
    this.weatherFeedbackScale = 0.92;

    this.pitchRatios = new Float32Array([0.5, 0.75, 1, 1.25, 1.5, 2]);
    this.pitchWeights = new Float32Array([0.07, 0.15, 0.29, 0.22, 0.17, 0.1]);
    this.pitchWeightTotal = 1;
    this.motionPanDrift = 0.72;
    this.motionPitchDrift = 0.04;
    this.motionOrbit = 0.34;
    this.motionAttractor = 0.86;
    this.fieldName = "glass pentatonic";

    this.baseLayers = new Float64Array([0.72, 0.92, 0.72, 0.34, 0.28, 0.16, 0.78]);
    this.effectiveLayers = new Float64Array(LAYER_COUNT);
    this.character = 0.3;
    this.mode = "autonomous";
    this.macroX = 0.5;
    this.macroY = 0.5;

    this.lifecycleIndex = 0;
    this.lifecycle = LIFECYCLES[this.lifecycleIndex];
    this.lifecycleSamplesRemaining = this.nextLifecycleDuration();
    this.lifecycleDirty = true;
    this.lifecycleTelemetryCounter = 0;

    this.evolutionPhases = new Float64Array(8);
    this.resetEvolutionPhases();
    this.harmonicRoot = 55;
    this.harmonicTarget = 55;
    this.epochStep = 0;

    this.attractorActive = false;
    this.attractorX = 0.5;
    this.attractorY = 0.5;
    this.attractorStrength = 0;
    this.attractorVelocity = 0;

    this.meterCount = 0;
    this.meterSum = 0;
    this.meterPeak = 0;
    this.stateBufferPool = [];
    this.stateMessageSamples = 0;
    this.stateMessageInterval = Math.max(128, Math.round(sampleRate / 60 / 128) * 128);
    this.adaptiveQuality = true;
    this.voiceLimit = MAX_GRAINS;
    this.renderLoad = 0;
    this.overBudgetCount = 0;
    this.qualityCounter = 0;
    this.timerAvailable = typeof globalThis.performance?.now === "function";

    for (let index = 0; index < MAX_GRAINS; index += 1) {
      this.grainPool.push({
        age: 0,
        length: 0,
        position: 0,
        ratioStart: 1,
        panStart: 0,
        panEnd: 0,
        pitchDrift: 0,
        orbitPhase: 0,
        orbitRate: 0,
        gain: 0,
        sourceRateRatio: 1,
        renderPan: 0,
        renderRatio: 1,
      });
    }

    this.setWeather("clear");

    this.port.onmessage = (event) => {
      const message = event.data;
      if (message?.type === "seed") {
        this.reseed(Number(message.value) || 311);
        return;
      }
      if (
        message?.type === "grain-state-buffer"
        && message.state instanceof Float32Array
        && message.state.length === GRAIN_STATE_LENGTH
        && this.stateBufferPool.length < STATE_BUFFER_COUNT
      ) {
        this.stateBufferPool.push(message.state);
        return;
      }
      if (message?.type === "genome-profile") {
        this.setGenomeProfile(message);
        return;
      }
      if (message?.type === "attractor") {
        this.attractorActive = Boolean(message.active);
        this.attractorX = this.clamp(Number(message.x) || 0, 0, 1);
        this.attractorY = this.clamp(Number(message.y) || 0, 0, 1);
        this.attractorStrength = this.clamp(Number(message.strength) || 0, 0, 1);
        this.attractorVelocity = this.clamp(Number(message.velocity) || 0, 0, 1);
        return;
      }
      if (message?.type === "weather") {
        this.setWeather(message.value);
        return;
      }
      if (message?.type === "spectral-mode") {
        this.setSpectralMode(message.value);
        return;
      }
      if (message?.type === "adaptive-quality") {
        this.adaptiveQuality = Boolean(message.value);
        if (!this.adaptiveQuality) this.voiceLimit = MAX_GRAINS;
        return;
      }
      if (message?.type === "mode") {
        this.mode = message.value === "perform" ? "perform" : "autonomous";
        this.lifecycleDirty = true;
        return;
      }
      if (message?.type === "character") {
        this.character = this.clamp(Number(message.value) || 0, 0, 1);
        return;
      }
      if (message?.type === "macro") {
        this.macroX = this.clamp(Number(message.x) || 0.5, 0, 1);
        this.macroY = this.clamp(Number(message.y) || 0.5, 0, 1);
        return;
      }
      if (
        message?.type === "source-buffer"
        && message.samples instanceof Float32Array
        && message.samples.length >= 128
      ) {
        this.externalSource = message.samples;
        this.externalSourceSampleRate = Math.max(8000, Number(message.sampleRate) || sampleRate);
        this.sourceMode = "sample";
        this.resetGrains();
        this.lifecycleDirty = true;
        return;
      }
      if (message?.type === "source-procedural") {
        this.externalSource = null;
        this.externalSourceSampleRate = sampleRate;
        this.sourceMode = "procedural";
        this.resetGrains();
        this.lifecycleDirty = true;
      }
    };
  }

  clamp(value, minimum, maximum) {
    return Math.min(maximum, Math.max(minimum, value));
  }

  parameter(parameters, name) {
    return parameters[name][0];
  }

  reseed(seed) {
    this.seed = seed >>> 0 || 311;
    this.random = new Lcg(this.seed);
    this.evolutionRandom = new Lcg(this.seed ^ 0x9e3779b9);
    this.eventRandom = new Lcg(this.seed ^ 0x85ebca6b);
    this.resetEvolutionPhases();
    this.resetGrains();
    this.spawnPhase = 0;
    this.lifecycleIndex = 0;
    this.lifecycle = LIFECYCLES[0];
    this.lifecycleSamplesRemaining = this.nextLifecycleDuration();
    this.eventCountdown = Math.floor(sampleRate * (2 + this.eventRandom.next() * 4));
    this.lifecycleDirty = true;
  }

  resetEvolutionPhases() {
    for (let index = 0; index < this.evolutionPhases.length; index += 1) {
      this.evolutionPhases[index] = this.evolutionRandom.next() * TWO_PI;
    }
  }

  resetGrains() {
    while (this.grains.length > 0) this.grainPool.push(this.grains.pop());
  }

  nextLifecycleDuration() {
    const ambientSeconds = 20 + this.evolutionRandom.next() * 42;
    const experimentalSeconds = 9 + this.evolutionRandom.next() * 22;
    const seconds = ambientSeconds * (1 - this.character) + experimentalSeconds * this.character;
    return Math.max(sampleRate * 6, Math.floor(seconds * sampleRate));
  }

  advanceLifecycle() {
    if (this.mode !== "autonomous") return;
    const stepChance = this.evolutionRandom.next();
    if (stepChance < 0.76) {
      this.lifecycleIndex = (this.lifecycleIndex + 1) % LIFECYCLES.length;
    } else if (stepChance < 0.92) {
      this.lifecycleIndex = (this.lifecycleIndex + 2) % LIFECYCLES.length;
    } else {
      this.lifecycleIndex = Math.floor(this.evolutionRandom.next() * LIFECYCLES.length);
    }
    this.lifecycle = LIFECYCLES[this.lifecycleIndex];
    this.lifecycleSamplesRemaining = this.nextLifecycleDuration();
    this.lifecycleDirty = true;

    if (this.lifecycle === "MIGRATION" || this.lifecycle === "REGENERATION") {
      const semitoneChoices = [-5, -2, 0, 2, 5, 7];
      const choice = semitoneChoices[Math.floor(this.evolutionRandom.next() * semitoneChoices.length)];
      this.harmonicTarget = 55 * (2 ** (choice / 12));
    }
  }

  setGenomeProfile(message) {
    const ratios = Array.isArray(message.ratios) ? message.ratios : [];
    const weights = Array.isArray(message.weights) ? message.weights : [];
    if (ratios.length >= 2 && ratios.length === weights.length) {
      this.pitchRatios = new Float32Array(ratios.length);
      this.pitchWeights = new Float32Array(weights.length);
      this.pitchWeightTotal = 0;
      for (let index = 0; index < ratios.length; index += 1) {
        this.pitchRatios[index] = this.clamp(Number(ratios[index]) || 1, 0.25, 2);
        this.pitchWeights[index] = Math.max(0.0001, Number(weights[index]) || 0.0001);
        this.pitchWeightTotal += this.pitchWeights[index];
      }
    }

    const modalRatios = Array.isArray(message.modalRatios) ? message.modalRatios : [];
    if (modalRatios.length >= 3) {
      this.modalRatios = new Float32Array(Math.min(6, modalRatios.length));
      for (let index = 0; index < this.modalRatios.length; index += 1) {
        this.modalRatios[index] = this.clamp(Number(modalRatios[index]) || 1, 0.25, 8);
      }
      this.configureResonators();
    }

    const motion = message.motion || {};
    this.motionPanDrift = this.clamp(Number(motion.panDrift) || 0, 0, 1.25);
    this.motionPitchDrift = this.clamp(Number(motion.pitchDrift) || 0, 0, 0.3);
    this.motionOrbit = this.clamp(Number(motion.orbit) || 0, 0, 1.25);
    this.motionAttractor = this.clamp(Number(motion.attractor) || 0, 0, 1.25);

    const layers = message.layers || {};
    this.baseLayers[LAYER_HARMONIC] = this.clamp(Number(layers.harmonic) || 0, 0, 1);
    this.baseLayers[LAYER_RESONATOR] = this.clamp(Number(layers.resonator) || 0, 0, 1);
    this.baseLayers[LAYER_TRANSIENT] = this.clamp(Number(layers.transient) || 0, 0, 1);
    this.baseLayers[LAYER_NOISE] = this.clamp(Number(layers.noise) || 0, 0, 1);
    this.baseLayers[LAYER_FM] = this.clamp(Number(layers.fm) || 0, 0, 1);
    this.baseLayers[LAYER_SUB] = this.clamp(Number(layers.sub) || 0, 0, 1);
    this.baseLayers[LAYER_AIR] = this.clamp(Number(layers.air) || 0, 0, 1);
    this.eventRate = this.clamp(Number(message.eventRate) || 0.5, 0.05, 2);
    this.fieldName = typeof message.field === "string" ? message.field.slice(0, 80) : this.fieldName;
    this.lifecycleDirty = true;
  }

  configureResonators() {
    for (let index = 0; index < this.resonators.length; index += 1) {
      const ratio = this.modalRatios[index % this.modalRatios.length];
      this.resonators[index].configure(this.resonatorRoot * ratio, this.resonatorDecay + index * 0.23);
    }
  }

  setWeather(name) {
    if (name === "mist") {
      this.weatherModDepth = 1.1;
      this.weatherRateScale = 0.72;
      this.weatherWet = 0.92;
      this.weatherFeedbackScale = 0.98;
    } else if (name === "bloom") {
      this.weatherModDepth = 1.35;
      this.weatherRateScale = 0.9;
      this.weatherWet = 1.08;
      this.weatherFeedbackScale = 1.01;
    } else if (name === "storm") {
      this.weatherModDepth = 1.72;
      this.weatherRateScale = 1.42;
      this.weatherWet = 1.12;
      this.weatherFeedbackScale = 1.035;
    } else if (name === "void") {
      this.weatherModDepth = 0.58;
      this.weatherRateScale = 0.46;
      this.weatherWet = 1.18;
      this.weatherFeedbackScale = 1.02;
    } else {
      this.weatherModDepth = 0.72;
      this.weatherRateScale = 0.82;
      this.weatherWet = 0.72;
      this.weatherFeedbackScale = 0.92;
    }
  }

  setSpectralMode(mode) {
    this.spectralMode = ["off", "freeze", "blur", "shimmer"].includes(mode) ? mode : "off";
    this.spectral.setMode(this.spectralMode);
  }

  weightedPitchRatio() {
    let target = this.random.next() * this.pitchWeightTotal;
    for (let index = 0; index < this.pitchRatios.length; index += 1) {
      target -= this.pitchWeights[index];
      if (target <= 0) return this.pitchRatios[index];
    }
    return this.pitchRatios[this.pitchRatios.length - 1];
  }

  updateEffectiveLayers(time, evolution) {
    const profile = LIFECYCLE_PROFILES[this.lifecycle];
    const autonomy = this.mode === "autonomous" ? 1 : 0.2;
    const micro = Math.sin(time * TWO_PI * 0.083 + this.evolutionPhases[0]);
    const phrase = Math.sin(time * TWO_PI * 0.021 + this.evolutionPhases[1]);
    const ecosystem = Math.sin(time * TWO_PI * 0.0043 + this.evolutionPhases[2]);
    const epoch = Math.sin(time * TWO_PI * 0.0011 + this.evolutionPhases[3]);

    for (let index = 0; index < LAYER_COUNT; index += 1) {
      const stateScale = 1 + (profile.layer[index] - 1) * autonomy;
      let modulation = 1;
      if (index === LAYER_HARMONIC) modulation += phrase * evolution * 0.11;
      else if (index === LAYER_RESONATOR) modulation += ecosystem * evolution * 0.16;
      else if (index === LAYER_TRANSIENT) modulation += micro * evolution * 0.18;
      else if (index === LAYER_NOISE) modulation += phrase * evolution * 0.14;
      else if (index === LAYER_FM) modulation += epoch * evolution * 0.18;
      else if (index === LAYER_SUB) modulation -= ecosystem * evolution * 0.1;
      else if (index === LAYER_AIR) modulation += micro * evolution * 0.1;
      this.effectiveLayers[index] = this.clamp(this.baseLayers[index] * stateScale * modulation, 0, 1.35);
    }

    const experimentalBias = this.character;
    this.effectiveLayers[LAYER_FM] = this.clamp(this.effectiveLayers[LAYER_FM] * (0.72 + experimentalBias * 0.78), 0, 1.35);
    this.effectiveLayers[LAYER_TRANSIENT] = this.clamp(this.effectiveLayers[LAYER_TRANSIENT] * (0.8 + experimentalBias * 0.55), 0, 1.35);
    this.effectiveLayers[LAYER_NOISE] = this.clamp(this.effectiveLayers[LAYER_NOISE] * (0.86 + experimentalBias * 0.42), 0, 1.35);
  }

  triggerEvent(profile, evolution) {
    const experimentalBias = this.character;
    const random = this.eventRandom.next();
    if (random < 0.23) this.eventType = 0;
    else if (random < 0.42) this.eventType = 1;
    else if (random < 0.62) this.eventType = 2;
    else if (random < 0.82) this.eventType = 3;
    else this.eventType = 4;

    const shortSeconds = 0.08 + this.eventRandom.next() * 0.35;
    const longSeconds = 1.4 + this.eventRandom.next() * 5.6;
    this.eventLength = Math.max(64, Math.floor((this.eventType === 2 ? longSeconds : shortSeconds) * sampleRate));
    this.eventAge = 0;
    this.eventStrength = 0.3 + this.eventRandom.next() * (0.55 + experimentalBias * 0.35);
    this.eventFrequency = 180 + this.eventRandom.next() * (2400 + experimentalBias * 3800);
    this.eventPhase = this.eventRandom.next() * TWO_PI;

    const baseGap = 9 + this.eventRandom.next() * 38;
    const profileRate = Math.max(0.15, this.eventRate * profile.event);
    const characterRate = 0.8 + experimentalBias * 1.6;
    const evolutionRate = 0.78 + evolution * 0.55;
    this.eventCountdown = Math.max(
      Math.floor(sampleRate * 1.5),
      Math.floor((baseGap / (profileRate * characterRate * evolutionRate)) * sampleRate),
    );
  }

  processEvent(profile, evolution) {
    this.eventCountdown -= 1;
    if (this.eventCountdown <= 0 && this.eventAge >= this.eventLength) this.triggerEvent(profile, evolution);
    if (this.eventAge >= this.eventLength) return 0;

    const phase = this.eventAge / this.eventLength;
    let envelope = 0;
    let value = 0;
    if (this.eventType === 0) {
      envelope = Math.exp(-phase * 9.5);
      this.eventPhase += (TWO_PI * this.eventFrequency) / sampleRate;
      value = Math.sin(this.eventPhase) + Math.sin(this.eventPhase * 1.498) * 0.42;
    } else if (this.eventType === 1) {
      envelope = Math.exp(-phase * 15);
      this.eventPhase += (TWO_PI * Math.max(42, this.eventFrequency * 0.18)) / sampleRate;
      value = Math.sin(this.eventPhase) * 0.82 + this.eventRandom.bipolar() * 0.18;
    } else if (this.eventType === 2) {
      envelope = Math.sin(Math.PI * phase) ** 2;
      this.eventPhase += (TWO_PI * this.eventFrequency * 0.32) / sampleRate;
      value = Math.sin(this.eventPhase) * 0.55 + this.eventRandom.bipolar() * 0.45;
    } else if (this.eventType === 3) {
      envelope = Math.exp(-phase * 22);
      value = this.eventRandom.bipolar();
    } else {
      envelope = Math.exp(-phase * 7.2);
      this.eventPhase += (TWO_PI * this.eventFrequency) / sampleRate;
      value = Math.sin(this.eventPhase) * 0.62 + Math.sin(this.eventPhase * 2.67) * 0.38;
    }

    this.eventAge += 1;
    return value * envelope * this.eventStrength;
  }

  writeProceduralSource(tension, texture, evolution, tone) {
    const time = this.sampleCounter / sampleRate;
    const profile = LIFECYCLE_PROFILES[this.lifecycle];
    this.updateEffectiveLayers(time, evolution);

    const rootSlew = 0.000002 + evolution * 0.000003;
    this.harmonicRoot += (this.harmonicTarget - this.harmonicRoot) * rootSlew;
    const phraseDrift = Math.sin(time * TWO_PI * 0.019 + this.evolutionPhases[4]) * (0.015 + evolution * 0.028);
    const root = this.harmonicRoot * (1 + phraseDrift);

    let harmonic = 0;
    const brightness = this.clamp(profile.brightness * (0.78 + tone * 0.42), 0.4, 1.4);
    for (let index = 0; index < this.harmonicPhase.length; index += 1) {
      const ratio = this.harmonicRatios[index];
      this.harmonicPhase[index] += (TWO_PI * root * ratio) / sampleRate;
      if (this.harmonicPhase[index] > TWO_PI) this.harmonicPhase[index] -= TWO_PI;
      const amplitude = (1 / (1 + index * 0.78)) * (index < 2 ? 1 : brightness);
      harmonic += Math.sin(this.harmonicPhase[index]) * amplitude;
    }
    harmonic *= 0.26;

    this.fmModPhase += (TWO_PI * root * (1.98 + tension * 0.2)) / sampleRate;
    this.fmCarrierPhase += (TWO_PI * root * (2.52 + Math.sin(this.fmModPhase) * (0.12 + tension * 0.58))) / sampleRate;
    if (this.fmModPhase > TWO_PI) this.fmModPhase -= TWO_PI;
    if (this.fmCarrierPhase > TWO_PI) this.fmCarrierPhase -= TWO_PI;
    const fm = Math.sin(this.fmCarrierPhase) * 0.48;

    this.subPhase += (TWO_PI * root * 0.5) / sampleRate;
    if (this.subPhase > TWO_PI) this.subPhase -= TWO_PI;
    const sub = Math.sin(this.subPhase) * 0.52 + Math.sin(this.subPhase * 0.5) * 0.18;

    const white = this.random.bipolar();
    this.noiseLow += (white - this.noiseLow) * (0.002 + tone * 0.018);
    this.noiseBrown = this.clamp(this.noiseBrown * 0.995 + white * 0.005, -1, 1);
    const noise = this.noiseLow * 0.65 + this.noiseBrown * 0.35;
    const air = white - this.noisePrevious;
    this.noisePrevious = white;

    const event = this.processEvent(profile, evolution);
    const excitation = event * (0.4 + this.effectiveLayers[LAYER_TRANSIENT] * 0.6)
      + white * texture * 0.035
      + (this.lifecycle === "GERMINATION" || this.lifecycle === "REGENERATION" ? this.random.bipolar() * 0.012 : 0);

    let resonant = 0;
    for (let index = 0; index < this.resonators.length; index += 1) {
      resonant += this.resonators[index].process(excitation) * (0.9 / this.resonators.length);
    }

    let value = harmonic * this.effectiveLayers[LAYER_HARMONIC];
    value += resonant * this.effectiveLayers[LAYER_RESONATOR] * profile.resonance * 2.2;
    value += event * this.effectiveLayers[LAYER_TRANSIENT] * 0.38;
    value += noise * this.effectiveLayers[LAYER_NOISE] * texture * 0.42;
    value += fm * this.effectiveLayers[LAYER_FM] * 0.32;
    value += sub * this.effectiveLayers[LAYER_SUB] * 0.36;
    value += air * this.effectiveLayers[LAYER_AIR] * texture * 0.055;

    this.source[this.sourceWrite] = Math.tanh(value * 1.15);
    this.sourceWrite = (this.sourceWrite + 1) % this.source.length;
  }

  spawnGrain(grainSize, spread, tension, quantize, evolution, densityScale) {
    if (this.grains.length >= this.voiceLimit) return;
    const grain = this.grainPool.pop();
    if (!grain) return;

    const gestureSpread = this.attractorActive ? this.attractorVelocity * 0.28 : 0;
    const macroSpread = (this.macroY - 0.5) * 0.16;
    const effectiveSpread = this.clamp(spread + gestureSpread + macroSpread, 0, 1.25);
    const durationScale = this.clamp(1.12 - densityScale * 0.18, 0.78, 1.18);
    const length = Math.max(64, Math.floor(grainSize * durationScale * sampleRate));
    const rawRatio = 2 ** (this.random.bipolar() * effectiveSpread * 0.52);
    const scaleRatio = this.weightedPitchRatio();
    const harmonicGravity = quantize * (1 - tension * 0.92);
    const microtonalChaos = 2 ** (this.random.bipolar() * tension * (0.035 + effectiveSpread * 0.13));
    const ratio = (rawRatio * (1 - harmonicGravity) + scaleRatio * harmonicGravity) * microtonalChaos;

    grain.age = 0;
    grain.length = length;
    grain.ratioStart = this.clamp(ratio, 0.2, 2.4);
    grain.panStart = this.random.bipolar() * Math.min(1, effectiveSpread);
    grain.panEnd = this.clamp(
      grain.panStart + this.random.bipolar() * this.motionPanDrift * (0.25 + evolution * 0.75),
      -1,
      1,
    );
    grain.pitchDrift = this.random.bipolar() * this.motionPitchDrift * (0.35 + evolution * 0.9);
    grain.orbitPhase = this.random.next() * TWO_PI;
    grain.orbitRate = (0.2 + this.random.next() * 1.1) * this.motionOrbit;
    grain.gain = 0.17 + this.random.next() * 0.19;
    grain.renderPan = grain.panStart;
    grain.renderRatio = grain.ratioStart;

    if (this.sourceMode === "sample" && this.externalSource) {
      grain.position = Math.floor(this.random.next() * this.externalSource.length);
      grain.sourceRateRatio = this.externalSourceSampleRate / sampleRate;
    } else {
      const maximumDelay = Math.min(this.source.length - 2, Math.max(1, this.sampleCounter));
      const minimumDelay = Math.min(maximumDelay, Math.floor(sampleRate * 0.02));
      const delayRange = Math.max(0, maximumDelay - minimumDelay);
      const delay = minimumDelay + Math.floor(this.random.next() * delayRange);
      grain.position = this.sourceWrite - delay;
      grain.sourceRateRatio = 1;
    }

    this.grains.push(grain);
  }

  releaseGrain(index) {
    const grain = this.grains[index];
    const finalIndex = this.grains.length - 1;
    for (let moveIndex = index; moveIndex < finalIndex; moveIndex += 1) {
      this.grains[moveIndex] = this.grains[moveIndex + 1];
    }
    this.grains.pop();
    this.grainPool.push(grain);
  }

  readSource(position) {
    const buffer = this.sourceMode === "sample" && this.externalSource ? this.externalSource : this.source;
    const length = buffer.length;
    let wrapped = position % length;
    if (wrapped < 0) wrapped += length;
    const index = Math.floor(wrapped);
    const next = (index + 1) % length;
    const fraction = wrapped - index;
    return buffer[index] * (1 - fraction) + buffer[next] * fraction;
  }

  envelope(phase, shape) {
    const smooth = Math.sin(Math.PI * phase) ** 2;
    if (shape < 0.5) {
      const morph = shape * 2;
      const percussive = Math.min(1, phase * 34) * Math.exp(-phase * 5.2);
      return percussive * (1 - morph) + smooth * morph;
    }
    const morph = (shape - 0.5) * 2;
    const reverse = phase ** 2.7;
    return smooth * (1 - morph) + reverse * morph;
  }

  processGrains(width, shape, evolution) {
    let left = 0;
    let right = 0;
    const attractorPan = this.attractorX * 2 - 1;
    const attractorRatio = 2 - this.attractorY * 1.75;
    for (let index = this.grains.length - 1; index >= 0; index -= 1) {
      const grain = this.grains[index];
      const phase = grain.age / grain.length;
      if (phase >= 1) {
        this.releaseGrain(index);
        continue;
      }
      const window = this.envelope(phase, shape);
      const orbit = Math.sin(grain.orbitPhase + phase * TWO_PI * grain.orbitRate);
      let pan = grain.panStart + (grain.panEnd - grain.panStart) * phase;
      pan += orbit * this.motionOrbit * 0.16 * (0.3 + evolution * 0.7);
      let ratio = grain.ratioStart * (1 + grain.pitchDrift * (phase * 2 - 1));
      if (this.attractorActive) {
        const influence = this.attractorStrength * this.motionAttractor * (0.12 + window * 0.34);
        pan += (attractorPan - pan) * influence;
        ratio += (attractorRatio - ratio) * influence * 0.42;
      }
      pan = this.clamp(pan, -1, 1) * width;
      ratio = this.clamp(ratio, 0.2, 2.4);
      const sourcePosition = grain.position + grain.age * ratio * grain.sourceRateRatio;
      const sample = this.readSource(sourcePosition) * window * grain.gain;
      left += sample * Math.sqrt((1 - pan) * 0.5);
      right += sample * Math.sqrt((1 + pan) * 0.5);
      grain.renderPan = pan;
      grain.renderRatio = ratio;
      grain.age += 1;
    }
    this.grainMix[0] = left;
    this.grainMix[1] = right;
  }

  filter(input, channel, tone, tension) {
    const cutoff = 220 + Math.pow(tone, 2.05) * 10800;
    const frequency = Math.min(0.94, 2 * Math.sin(Math.PI * cutoff / sampleRate));
    const resonance = 0.4 + (1 - tension) * 0.9;
    this.low[channel] += frequency * this.band[channel];
    const high = input - this.low[channel] - resonance * this.band[channel];
    this.band[channel] += frequency * high;
    return this.low[channel] * 0.84 + this.band[channel] * (0.18 + tension * 0.34);
  }

  feedbackNetwork(inputLeft, inputRight, feedback, width, lushness) {
    const time = this.sampleCounter / sampleRate;
    const depth = lushness * 46 * this.weatherModDepth;
    const baseOffset = 96;
    const rateScale = this.weatherRateScale;
    const lfo1 = Math.sin(time * TWO_PI * 0.17 * rateScale + 0.2) * depth;
    const lfo2 = Math.sin(time * TWO_PI * 0.23 * rateScale + 1.7) * depth;
    const lfo3 = Math.sin(time * TWO_PI * 0.29 * rateScale + 3.1) * depth;
    const lfo4 = Math.sin(time * TWO_PI * 0.31 * rateScale + 4.6) * depth;
    const read0 = this.delays[0].read(lfo1 + baseOffset);
    const read1 = this.delays[1].read(lfo2 + baseOffset);
    const read2 = this.delays[2].read(lfo3 + baseOffset);
    const read3 = this.delays[3].read(lfo4 + baseOffset);
    const mixed0 = (read0 + read1 + read2 + read3) * 0.5;
    const mixed1 = (read0 - read1 + read2 - read3) * 0.5;
    const mixed2 = (read0 + read1 - read2 - read3) * 0.5;
    const mixed3 = (read0 - read1 - read2 + read3) * 0.5;
    const boundedFeedback = this.clamp(feedback * this.weatherFeedbackScale, 0, 0.82);
    const mono = (inputLeft + inputRight) * 0.5;
    this.delays[0].write(mono * 0.32 + mixed0 * boundedFeedback);
    this.delays[1].write(inputLeft * 0.28 + mixed1 * boundedFeedback);
    this.delays[2].write(inputRight * 0.28 + mixed2 * boundedFeedback);
    this.delays[3].write(mono * 0.24 + mixed3 * boundedFeedback);
    const wetLeft = (read0 + read2 - read3) * 0.3 * this.weatherWet;
    const wetRight = (read1 - read2 + read3) * 0.3 * this.weatherWet;
    this.feedbackMix[0] = inputLeft + wetLeft * width;
    this.feedbackMix[1] = inputRight + wetRight * width;
  }

  applySpectral(left, right) {
    if (this.spectralMode === "off") {
      this.feedbackMix[0] = left;
      this.feedbackMix[1] = right;
      return;
    }
    const mono = (left + right) * 0.5;
    const spectral = this.spectral.process(mono);
    let mix = 0.28;
    if (this.spectralMode === "freeze") mix = 0.38;
    else if (this.spectralMode === "blur") mix = 0.34;
    else if (this.spectralMode === "shimmer") mix = 0.26;
    this.feedbackMix[0] = left * (1 - mix) + spectral * mix;
    this.feedbackMix[1] = right * (1 - mix) + spectral * mix;
  }

  publishGrainState() {
    const state = this.stateBufferPool.pop();
    if (!state) return;
    state.fill(0);
    const count = Math.min(this.grains.length, MAX_GRAINS);
    for (let index = 0; index < count; index += 1) {
      const grain = this.grains[index];
      const offset = index * GRAIN_STATE_STRIDE;
      state[offset] = 1;
      state[offset + 1] = grain.renderPan;
      state[offset + 2] = grain.renderRatio;
      state[offset + 3] = Math.min(1, grain.age / grain.length);
    }
    this.port.postMessage({ type: "grain-state", state }, [state.buffer]);
  }

  publishLifecycle() {
    const profile = LIFECYCLE_PROFILES[this.lifecycle];
    this.port.postMessage({
      type: "lifecycle",
      lifecycle: this.lifecycle,
      field: this.fieldName,
      motion: profile.motion,
      layers: {
        harmonic: this.effectiveLayers[LAYER_HARMONIC],
        resonator: this.effectiveLayers[LAYER_RESONATOR],
        transient: this.effectiveLayers[LAYER_TRANSIENT],
        noise: this.effectiveLayers[LAYER_NOISE],
        fm: this.effectiveLayers[LAYER_FM],
        sub: this.effectiveLayers[LAYER_SUB],
        air: this.effectiveLayers[LAYER_AIR],
      },
    });
    this.lifecycleDirty = false;
  }

  dcBlock(value, channel) {
    const output = value - this.dcX[channel] + 0.995 * this.dcY[channel];
    this.dcX[channel] = value;
    this.dcY[channel] = output;
    return output;
  }

  updateRenderBudget(renderStart, frameCount) {
    let currentLoad;
    if (this.timerAvailable) {
      const elapsed = globalThis.performance.now() - renderStart;
      const budget = (frameCount / sampleRate) * 1000;
      currentLoad = budget > 0 ? elapsed / budget : 0;
      if (currentLoad > 1) this.overBudgetCount += 1;
    } else {
      const grainPressure = this.grains.length / MAX_GRAINS;
      const spectralPressure = this.spectralMode === "off" ? 0 : 0.18;
      currentLoad = this.clamp(0.14 + grainPressure * 0.54 + spectralPressure, 0, 1.2);
    }
    this.renderLoad = this.renderLoad === 0 ? currentLoad : this.renderLoad * 0.94 + currentLoad * 0.06;
    this.qualityCounter += 1;
    if (!this.adaptiveQuality || this.qualityCounter < 64) return;
    this.qualityCounter = 0;
    if (this.renderLoad > 0.78 && this.voiceLimit > MIN_ADAPTIVE_GRAINS) {
      this.voiceLimit = Math.max(MIN_ADAPTIVE_GRAINS, this.voiceLimit - 4);
    } else if (this.renderLoad < 0.45 && this.voiceLimit < MAX_GRAINS) {
      this.voiceLimit = Math.min(MAX_GRAINS, this.voiceLimit + 2);
    }
  }

  process(_inputs, outputs, parameters) {
    const renderStart = this.timerAvailable ? globalThis.performance.now() : 0;
    const output = outputs[0];
    const left = output[0];
    const right = output[1] || output[0];

    const density = this.parameter(parameters, "density");
    const grainSize = this.parameter(parameters, "grainSize");
    const spread = this.parameter(parameters, "spread");
    const tone = this.parameter(parameters, "tone");
    const tension = this.parameter(parameters, "tension");
    const texture = this.parameter(parameters, "texture");
    const width = this.parameter(parameters, "width");
    const feedback = this.parameter(parameters, "feedback");
    const evolution = this.parameter(parameters, "evolution");
    const quantize = this.parameter(parameters, "quantize");
    const lushness = this.parameter(parameters, "lushness");
    const shape = this.parameter(parameters, "shape");

    const time = this.sampleCounter / sampleRate;
    const profile = LIFECYCLE_PROFILES[this.lifecycle];
    const autonomy = this.mode === "autonomous" ? 1 : 0.18;
    const micro = Math.sin(time * TWO_PI * 0.083 + this.evolutionPhases[0]);
    const phrase = Math.sin(time * TWO_PI * 0.021 + this.evolutionPhases[1]);
    const ecosystem = Math.sin(time * TWO_PI * 0.0043 + this.evolutionPhases[2]);
    const epoch = Math.sin(time * TWO_PI * 0.0011 + this.evolutionPhases[3]);
    const characterTension = this.character * 0.12;
    const macroDensity = (this.macroX - 0.5) * 0.22;
    const macroVolatility = (this.macroY - 0.5) * 0.18;
    const evolvedDensity = this.clamp(
      density * (1 + micro * evolution * 0.18) * (1 + (profile.density - 1) * autonomy) + macroDensity + this.attractorVelocity * 0.08,
      0.02,
      1.2,
    );
    const evolvedTension = this.clamp(tension + phrase * evolution * 0.1 * autonomy + characterTension + macroVolatility, 0, 1);
    const evolvedShape = this.clamp(shape + ecosystem * evolution * 0.12 * autonomy, 0, 1);
    const evolvedFeedback = this.clamp(feedback + epoch * evolution * 0.05 * autonomy, 0, 0.82);
    const evolvedLushness = this.clamp(lushness + ecosystem * evolution * 0.15 * autonomy, 0, 1);
    const grainsPerSecond = 1.4 + evolvedDensity * 24;

    for (let frame = 0; frame < left.length; frame += 1) {
      if (this.mode === "autonomous") {
        this.lifecycleSamplesRemaining -= 1;
        if (this.lifecycleSamplesRemaining <= 0) this.advanceLifecycle();
      }

      if (this.sourceMode === "procedural") {
        this.writeProceduralSource(evolvedTension, texture, evolution, tone);
      }

      this.spawnPhase += grainsPerSecond / sampleRate;
      if (this.spawnPhase >= 1) {
        this.spawnPhase -= 1;
        this.spawnGrain(grainSize, spread, evolvedTension, quantize, evolution, evolvedDensity);
      }

      this.processGrains(width, evolvedShape, evolution);
      let l = this.filter(this.grainMix[0], 0, tone, evolvedTension);
      let r = this.filter(this.grainMix[1], 1, tone, evolvedTension);
      this.applySpectral(l, r);
      l = this.feedbackMix[0];
      r = this.feedbackMix[1];
      this.feedbackNetwork(l, r, evolvedFeedback, width, evolvedLushness);
      l = Math.tanh(this.dcBlock(this.feedbackMix[0], 0) * 1.55) * 0.72;
      r = Math.tanh(this.dcBlock(this.feedbackMix[1], 1) * 1.55) * 0.72;
      left[frame] = l;
      right[frame] = r;

      const absolute = Math.max(Math.abs(l), Math.abs(r));
      this.meterSum += (l * l + r * r) * 0.5;
      this.meterPeak = Math.max(this.meterPeak, absolute);
      this.meterCount += 1;
      this.sampleCounter += 1;

      if (this.meterCount >= 2048) {
        this.port.postMessage({
          type: "meter",
          rms: Math.sqrt(this.meterSum / this.meterCount),
          peak: this.meterPeak,
          grains: this.grains.length,
          voiceLimit: this.voiceLimit,
          renderLoad: this.renderLoad,
          overBudgetCount: this.overBudgetCount,
          loadMode: this.timerAvailable ? "measured" : "estimated",
        });
        this.meterCount = 0;
        this.meterSum = 0;
        this.meterPeak = 0;
      }
    }

    this.stateMessageSamples += left.length;
    if (this.stateMessageSamples >= this.stateMessageInterval) {
      this.stateMessageSamples %= this.stateMessageInterval;
      this.publishGrainState();
    }

    this.lifecycleTelemetryCounter += left.length;
    if (this.lifecycleDirty || this.lifecycleTelemetryCounter >= sampleRate * 2) {
      this.lifecycleTelemetryCounter = 0;
      this.updateEffectiveLayers(this.sampleCounter / sampleRate, evolution);
      this.publishLifecycle();
    }

    this.updateRenderBudget(renderStart, left.length);
    return true;
  }
}

registerProcessor("signal-garden-v2", SignalGardenProcessorV2);
