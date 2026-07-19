const MAX_GRAINS = 48;
const GRAIN_STATE_STRIDE = 4;
const GRAIN_STATE_LENGTH = MAX_GRAINS * GRAIN_STATE_STRIDE;
const STATE_BUFFER_COUNT = 2;
const PITCH_RATIOS = new Float32Array([0.25, 0.5, 0.75, 1.0, 1.25, 1.5, 2.0]);

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
    let pos = this.index - offset;
    while (pos < 0) pos += this.buffer.length;
    const index = Math.floor(pos);
    const next = (index + 1) % this.buffer.length;
    const fraction = pos - index;
    return this.buffer[index] * (1 - fraction) + this.buffer[next] * fraction;
  }

  write(value) {
    this.buffer[this.index] = value;
    this.index = (this.index + 1) % this.buffer.length;
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
    this.random = new Lcg(311);
    this.source = new Float32Array(Math.floor(sampleRate * 4));
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
      (length) => new DelayLine(Math.round(length * sampleRate / 48000)),
    );
    this.meterCount = 0;
    this.meterSum = 0;
    this.meterPeak = 0;
    this.stateBufferPool = [];
    this.stateMessageSamples = 0;
    this.stateMessageInterval = Math.max(
      128,
      Math.round(sampleRate / 60 / 128) * 128,
    );

    for (let index = 0; index < MAX_GRAINS; index += 1) {
      this.grainPool.push({
        age: 0,
        length: 0,
        position: 0,
        ratio: 1,
        pan: 0,
        gain: 0,
      });
    }

    this.port.onmessage = (event) => {
      const message = event.data;

      if (message?.type === "seed") {
        this.random = new Lcg(Number(message.value) || 311);
        this.resetGrains();
        return;
      }

      if (
        message?.type === "grain-state-buffer"
        && message.state instanceof Float32Array
        && message.state.length === GRAIN_STATE_LENGTH
        && this.stateBufferPool.length < STATE_BUFFER_COUNT
      ) {
        this.stateBufferPool.push(message.state);
      }
    };
  }

  resetGrains() {
    while (this.grains.length > 0) {
      this.grainPool.push(this.grains.pop());
    }
  }

  parameter(parameters, name) {
    return parameters[name][0];
  }

  writeSource(tension, texture, evolution) {
    const drift = 0.35 + evolution * 0.9;
    const base = 52 + tension * 34 + Math.sin((this.sampleCounter / sampleRate) * drift) * 7;
    const phaseStep = Math.PI * 2 * base / sampleRate;

    this.phase[0] += phaseStep;
    this.phase[1] += phaseStep * (1.5 + tension * 0.08);
    this.phase[2] += phaseStep * (2.01 + tension * 0.19);

    for (let index = 0; index < this.phase.length; index += 1) {
      if (this.phase[index] > Math.PI * 2) this.phase[index] -= Math.PI * 2;
    }

    let value = Math.sin(this.phase[0]) * 0.55;
    value += Math.sin(this.phase[1]) * 0.26;
    value += Math.sin(this.phase[2]) * 0.16;
    value += this.random.bipolar() * texture * 0.22;

    this.source[this.sourceWrite] = Math.tanh(value);
    this.sourceWrite = (this.sourceWrite + 1) % this.source.length;
  }

  spawnGrain(grainSize, spread, tension, quantize) {
    const grain = this.grainPool.pop();
    if (!grain) return;

    const length = Math.max(64, Math.floor(grainSize * sampleRate));
    const delay = Math.floor((0.08 + this.random.next() * 3.5) * sampleRate);
    const rawRatio = 1 + this.random.bipolar() * spread * 0.5 + tension * 0.035;

    let closest = PITCH_RATIOS[0];
    let closestDistance = Math.abs(closest - rawRatio);
    for (let index = 1; index < PITCH_RATIOS.length; index += 1) {
      const candidate = PITCH_RATIOS[index];
      const distance = Math.abs(candidate - rawRatio);
      if (distance < closestDistance) {
        closest = candidate;
        closestDistance = distance;
      }
    }

    grain.age = 0;
    grain.length = length;
    grain.position = this.sourceWrite - delay;
    grain.ratio = rawRatio * (1 - quantize) + closest * quantize;
    grain.pan = this.random.bipolar() * spread;
    grain.gain = 0.14 + this.random.next() * 0.16;
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
    const length = this.source.length;
    let wrapped = position % length;
    if (wrapped < 0) wrapped += length;
    const index = Math.floor(wrapped);
    const next = (index + 1) % length;
    const fraction = wrapped - index;
    return this.source[index] * (1 - fraction) + this.source[next] * fraction;
  }

  processGrains(width, shape) {
    let left = 0;
    let right = 0;

    for (let index = this.grains.length - 1; index >= 0; index -= 1) {
      const grain = this.grains[index];
      const phase = grain.age / grain.length;
      if (phase >= 1) {
        this.releaseGrain(index);
        continue;
      }

      const skew = Math.pow(phase, Math.exp((shape - 0.5) * 4));
      const window = 0.5 - 0.5 * Math.cos(Math.PI * 2 * skew);
      const sample = this.readSource(grain.position + grain.age * grain.ratio) * window * grain.gain;
      const pan = grain.pan * width;

      left += sample * Math.sqrt((1 - pan) * 0.5);
      right += sample * Math.sqrt((1 + pan) * 0.5);
      grain.age += 1;
    }

    this.grainMix[0] = left;
    this.grainMix[1] = right;
  }

  filter(input, channel, tone, tension) {
    const cutoff = 180 + Math.pow(tone, 2.2) * 9200;
    const f = Math.min(0.95, 2 * Math.sin(Math.PI * cutoff / sampleRate));
    const q = 0.35 + (1 - tension) * 1.2;
    this.low[channel] += f * this.band[channel];
    const high = input - this.low[channel] - q * this.band[channel];
    this.band[channel] += f * high;
    return this.low[channel] * 0.7 + this.band[channel] * tension * 0.45;
  }

  feedbackNetwork(inputLeft, inputRight, feedback, width, lushness) {
    const lfo1 = Math.sin(this.sampleCounter * Math.PI * 2 * 0.17 / sampleRate) * lushness * 40;
    const lfo2 = Math.sin(this.sampleCounter * Math.PI * 2 * 0.23 / sampleRate) * lushness * 40;
    const lfo3 = Math.sin(this.sampleCounter * Math.PI * 2 * 0.29 / sampleRate) * lushness * 40;
    const lfo4 = Math.sin(this.sampleCounter * Math.PI * 2 * 0.31 / sampleRate) * lushness * 40;

    const read0 = this.delays[0].read(lfo1 + 40);
    const read1 = this.delays[1].read(lfo2 + 40);
    const read2 = this.delays[2].read(lfo3 + 40);
    const read3 = this.delays[3].read(lfo4 + 40);

    const mixed0 = (read0 + read1 + read2 + read3) * 0.5;
    const mixed1 = (read0 - read1 + read2 - read3) * 0.5;
    const mixed2 = (read0 + read1 - read2 - read3) * 0.5;
    const mixed3 = (read0 - read1 - read2 + read3) * 0.5;

    const mono = (inputLeft + inputRight) * 0.5;
    this.delays[0].write(mono * 0.32 + mixed0 * feedback);
    this.delays[1].write(inputLeft * 0.28 + mixed1 * feedback);
    this.delays[2].write(inputRight * 0.28 + mixed2 * feedback);
    this.delays[3].write(mono * 0.24 + mixed3 * feedback);

    const wetLeft = (read0 + read2 - read3) * 0.28;
    const wetRight = (read1 - read2 + read3) * 0.28;
    this.feedbackMix[0] = inputLeft + wetLeft * width;
    this.feedbackMix[1] = inputRight + wetRight * width;
  }

  publishGrainState(width) {
    const state = this.stateBufferPool.pop();
    if (!state) return;

    state.fill(0);
    const count = Math.min(this.grains.length, MAX_GRAINS);

    for (let index = 0; index < count; index += 1) {
      const grain = this.grains[index];
      const offset = index * GRAIN_STATE_STRIDE;
      state[offset] = 1;
      state[offset + 1] = grain.pan * width;
      state[offset + 2] = grain.ratio;
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

  process(_inputs, outputs, parameters) {
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
    const grainsPerSecond = 1.5 + density * 22;

    for (let frame = 0; frame < left.length; frame += 1) {
      this.writeSource(tension, texture, evolution);
      this.spawnPhase += grainsPerSecond / sampleRate;
      if (this.spawnPhase >= 1) {
        this.spawnPhase -= 1;
        this.spawnGrain(grainSize, spread, tension, quantize);
      }

      this.processGrains(width, shape);
      let l = this.filter(this.grainMix[0], 0, tone, tension);
      let r = this.filter(this.grainMix[1], 1, tone, tension);
      this.feedbackNetwork(l, r, feedback, width, lushness);
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
        });
        this.meterCount = 0;
        this.meterSum = 0;
        this.meterPeak = 0;
      }
    }

    this.stateMessageSamples += left.length;
    if (this.stateMessageSamples >= this.stateMessageInterval) {
      this.stateMessageSamples %= this.stateMessageInterval;
      this.publishGrainState(width);
    }

    return true;
  }
}

registerProcessor("signal-garden", SignalGardenProcessor);
