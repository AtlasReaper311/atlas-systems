const MAX_GRAINS = 48;
const MIN_ADAPTIVE_GRAINS = 24;
const GRAIN_STATE_STRIDE = 4;
const GRAIN_STATE_LENGTH = MAX_GRAINS * GRAIN_STATE_STRIDE;
const STATE_BUFFER_COUNT = 2;
const TWO_PI = Math.PI * 2;
const SPECTRAL_SIZE = 256;
const SPECTRAL_HOP = 128;

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

class SpectralVeil {
  constructor() {
    this.size = SPECTRAL_SIZE;
    this.hop = SPECTRAL_HOP;
    this.input = new Float32Array(this.size);
    this.output = new Float32Array(this.size);
    this.real = new Float64Array(this.size);
    this.imag = new Float64Array(this.size);
    this.magnitudes = new Float64Array(this.size / 2 + 1);
    this.phases = new Float64Array(this.size / 2 + 1);
    this.smoothMagnitudes = new Float64Array(this.size / 2 + 1);
    this.frozenMagnitudes = new Float64Array(this.size / 2 + 1);
    this.window = new Float64Array(this.size);
    this.writeIndex = 0;
    this.hopCounter = 0;
    this.mode = "off";
    this.freezeCaptured = false;

    for (let index = 0; index < this.size; index += 1) {
      const hann = 0.5 - 0.5 * Math.cos((TWO_PI * index) / this.size);
      this.window[index] = Math.sqrt(hann);
    }
  }

  setMode(mode) {
    if (!["off", "freeze", "blur", "shimmer"].includes(mode)) return;
    if (mode === this.mode) return;
    this.mode = mode;
    this.freezeCaptured = false;
    this.hopCounter = 0;
    this.input.fill(0);
    this.smoothMagnitudes.fill(0);
    this.output.fill(0);
  }

  fft(inverse) {
    const size = this.size;
    let j = 0;

    for (let index = 1; index < size; index += 1) {
      let bit = size >> 1;
      while (j & bit) {
        j ^= bit;
        bit >>= 1;
      }
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
      const magnitude = Math.hypot(real, imag);
      this.magnitudes[bin] = magnitude;
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

class SignalGardenProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: "density", defaultValue: 0.38, minValue: 0.02, maxValue: 1, automationRate: "k-rate" },
      { name: "grainSize", defaultValue: 0.22, minValue: 0.03, maxValue: 0.75, automationRate: "k-rate" },
      { name: "spread", defaultValue: 0.45, minValue: 0, maxValue: 1, automationRate: "k-rate" },
      { name: "tone", defaultValue: 0.48, minValue: 0, maxValue: 1, automationRate: "k-rate" },
      { name: "tension", defaultValue: 0.28, minValue: 0, maxValue: 1, automationRate: "k-rate" },
      { name: "texture", defaultValue: 0.32, minValue: 0, maxValue: 1, automationRate: "k-rate" },
      { name: "width", defaultValue: 0.7, minValue: 0, maxValue: 1, automationRate: "k-rate" },
      { name: "feedback", defaultValue: 0.58, minValue: 0, maxValue: 0.82, automationRate: "k-rate" },
      { name: "evolution", defaultValue: 0.3, minValue: 0, maxValue: 1, automationRate: "k-rate" },
      { name: "quantize", defaultValue: 0.8, minValue: 0, maxValue: 1, automationRate: "k-rate" },
      { name: "lushness", defaultValue: 0.6, minValue: 0, maxValue: 1, automationRate: "k-rate" },
      { name: "shape", defaultValue: 0.5, minValue: 0, maxValue: 1, automationRate: "k-rate" },
    ];
  }

  constructor() {
    super();
    this.seed = 311;
    this.random = new Lcg(this.seed);
    this.evolutionRandom = new Lcg(this.seed ^ 0x9e3779b9);
    this.source = new Float32Array(Math.floor(sampleRate * 4));
    this.externalSource = null;
    this.externalSourceSampleRate = sampleRate;
    this.sourceMode = "procedural";
    this.sourceWrite = 0;
    this.phase = new Float64Array(3);
    this.grains = [];
    this.grainPool = [];
    this.spawnPhase = 0;
    this.sampleCounter = 0;
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
    this.meterCount = 0;
    this.meterSum = 0;
    this.meterPeak = 0;
    this.stateBufferPool = [];
    this.stateMessageSamples = 0;
    this.stateMessageInterval = Math.max(128, Math.round(sampleRate / 60 / 128) * 128);
    this.pitchRatios = new Float32Array([0.5, 0.75, 1, 1.25, 1.5, 2]);
    this.pitchWeights = new Float32Array([0.08, 0.16, 0.27, 0.22, 0.17, 0.1]);
    this.pitchWeightTotal = 1;
    this.motionPanDrift = 0.72;
    this.motionPitchDrift = 0.04;
    this.motionOrbit = 0.34;
    this.motionAttractor = 0.86;
    this.attractorActive = false;
    this.attractorX = 0.5;
    this.attractorY = 0.5;
    this.attractorStrength = 0;
    this.attractorVelocity = 0;
    this.weatherModDepth = 0.72;
    this.weatherRateScale = 0.82;
    this.weatherWet = 0.72;
    this.weatherFeedbackScale = 0.92;
    this.adaptiveQuality = true;
    this.voiceLimit = MAX_GRAINS;
    this.renderLoad = 0;
    this.overBudgetCount = 0;
    this.qualityCounter = 0;
    this.timerAvailable = typeof globalThis.performance?.now === "function";
    this.evolutionPhases = new Float64Array(4);

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

    this.resetEvolutionPhases();
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

      if (
        message?.type === "source-buffer"
        && message.samples instanceof Float32Array
        && message.samples.length >= 128
      ) {
        this.externalSource = message.samples;
        this.externalSourceSampleRate = Math.max(8000, Number(message.sampleRate) || sampleRate);
        this.sourceMode = "sample";
        this.resetGrains();
        return;
      }

      if (message?.type === "source-procedural") {
        this.externalSource = null;
        this.externalSourceSampleRate = sampleRate;
        this.sourceMode = "procedural";
        this.resetGrains();
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
    this.resetEvolutionPhases();
    this.resetGrains();
    this.spawnPhase = 0;
  }

  resetEvolutionPhases() {
    for (let index = 0; index < this.evolutionPhases.length; index += 1) {
      this.evolutionPhases[index] = this.evolutionRandom.next() * TWO_PI;
    }
  }

  resetGrains() {
    while (this.grains.length > 0) {
      this.grainPool.push(this.grains.pop());
    }
  }

  setGenomeProfile(message) {
    const ratios = Array.isArray(message.ratios) ? message.ratios : [];
    const weights = Array.isArray(message.weights) ? message.weights : [];
    if (ratios.length < 2 || ratios.length !== weights.length) return;

    this.pitchRatios = new Float32Array(ratios.length);
    this.pitchWeights = new Float32Array(weights.length);
    this.pitchWeightTotal = 0;

    for (let index = 0; index < ratios.length; index += 1) {
      this.pitchRatios[index] = this.clamp(Number(ratios[index]) || 1, 0.25, 2);
      this.pitchWeights[index] = Math.max(0.0001, Number(weights[index]) || 0.0001);
      this.pitchWeightTotal += this.pitchWeights[index];
    }

    const motion = message.motion || {};
    this.motionPanDrift = this.clamp(Number(motion.panDrift) || 0, 0, 1.25);
    this.motionPitchDrift = this.clamp(Number(motion.pitchDrift) || 0, 0, 0.3);
    this.motionOrbit = this.clamp(Number(motion.orbit) || 0, 0, 1.25);
    this.motionAttractor = this.clamp(Number(motion.attractor) || 0, 0, 1.25);
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

  writeSource(tension, texture, evolution) {
    const time = this.sampleCounter / sampleRate;
    const evolutionDrift = Math.sin(time * TWO_PI * 0.017 + this.evolutionPhases[0]) * evolution;
    const drift = 0.35 + evolution * 0.9 + evolutionDrift * 0.12;
    const base = 52 + tension * 34 + Math.sin(time * drift) * 7;
    const phaseStep = TWO_PI * base / sampleRate;

    this.phase[0] += phaseStep;
    this.phase[1] += phaseStep * (1.5 + tension * 0.08);
    this.phase[2] += phaseStep * (2.01 + tension * 0.19);

    for (let index = 0; index < this.phase.length; index += 1) {
      if (this.phase[index] > TWO_PI) this.phase[index] -= TWO_PI;
    }

    let value = Math.sin(this.phase[0]) * 0.55;
    value += Math.sin(this.phase[1]) * 0.26;
    value += Math.sin(this.phase[2]) * 0.16;
    value += this.random.bipolar() * texture * 0.22;

    this.source[this.sourceWrite] = Math.tanh(value);
    this.sourceWrite = (this.sourceWrite + 1) % this.source.length;
  }

  spawnGrain(grainSize, spread, tension, quantize, evolution) {
    if (this.grains.length >= this.voiceLimit) return;
    const grain = this.grainPool.pop();
    if (!grain) return;

    const gestureSpread = this.attractorActive ? this.attractorVelocity * 0.28 : 0;
    const effectiveSpread = this.clamp(spread + gestureSpread, 0, 1.25);
    const length = Math.max(64, Math.floor(grainSize * sampleRate));
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
    grain.gain = 0.12 + this.random.next() * 0.15;
    grain.renderPan = grain.panStart;
    grain.renderRatio = grain.ratioStart;

    if (this.sourceMode === "sample" && this.externalSource) {
      grain.position = Math.floor(this.random.next() * this.externalSource.length);
      grain.sourceRateRatio = this.externalSourceSampleRate / sampleRate;
    } else {
      const delay = Math.floor((0.08 + this.random.next() * 3.5) * sampleRate);
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
    const cutoff = 180 + Math.pow(tone, 2.2) * 9200;
    const frequency = Math.min(0.95, 2 * Math.sin(Math.PI * cutoff / sampleRate));
    const resonance = 0.35 + (1 - tension) * 1.2;
    this.low[channel] += frequency * this.band[channel];
    const high = input - this.low[channel] - resonance * this.band[channel];
    this.band[channel] += frequency * high;
    return this.low[channel] * 0.7 + this.band[channel] * tension * 0.45;
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

    const wetLeft = (read0 + read2 - read3) * 0.28 * this.weatherWet;
    const wetRight = (read1 - read2 + read3) * 0.28 * this.weatherWet;
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

    this.port.postMessage(
      { type: "grain-state", state },
      [state.buffer],
    );
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
      currentLoad = this.clamp(0.12 + grainPressure * 0.56 + spectralPressure, 0, 1.2);
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
    const evo0 = Math.sin(time * TWO_PI * 0.013 + this.evolutionPhases[0]);
    const evo1 = Math.sin(time * TWO_PI * 0.019 + this.evolutionPhases[1]);
    const evo2 = Math.sin(time * TWO_PI * 0.031 + this.evolutionPhases[2]);
    const evo3 = Math.sin(time * TWO_PI * 0.007 + this.evolutionPhases[3]);
    const evolvedDensity = this.clamp(density * (1 + evo0 * evolution * 0.28) + this.attractorVelocity * 0.08, 0.02, 1.15);
    const evolvedTension = this.clamp(tension + evo1 * evolution * 0.12, 0, 1);
    const evolvedShape = this.clamp(shape + evo2 * evolution * 0.1, 0, 1);
    const evolvedFeedback = this.clamp(feedback + evo3 * evolution * 0.045, 0, 0.82);
    const evolvedLushness = this.clamp(lushness + evo2 * evolution * 0.16, 0, 1);
    const grainsPerSecond = 1.5 + evolvedDensity * 22;

    for (let frame = 0; frame < left.length; frame += 1) {
      if (this.sourceMode === "procedural") {
        this.writeSource(evolvedTension, texture, evolution);
      }

      this.spawnPhase += grainsPerSecond / sampleRate;
      if (this.spawnPhase >= 1) {
        this.spawnPhase -= 1;
        this.spawnGrain(grainSize, spread, evolvedTension, quantize, evolution);
      }

      this.processGrains(width, evolvedShape, evolution);
      let l = this.filter(this.grainMix[0], 0, tone, evolvedTension);
      let r = this.filter(this.grainMix[1], 1, tone, evolvedTension);

      this.applySpectral(l, r);
      l = this.feedbackMix[0];
      r = this.feedbackMix[1];
      this.feedbackNetwork(l, r, evolvedFeedback, width, evolvedLushness);
      l = Math.tanh(this.dcBlock(this.feedbackMix[0], 0) * 1.35) * 0.55;
      r = Math.tanh(this.dcBlock(this.feedbackMix[1], 1) * 1.35) * 0.55;

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

    this.updateRenderBudget(renderStart, left.length);
    return true;
  }
}

registerProcessor("signal-garden", SignalGardenProcessor);
