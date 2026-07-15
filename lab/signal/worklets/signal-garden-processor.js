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
  read() {
    return this.buffer[this.index];
  }
  write(value) {
    this.buffer[this.index] = value;
    this.index += 1;
    if (this.index >= this.buffer.length) this.index = 0;
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
    ];
  }

  constructor() {
    super();
    this.random = new Lcg(311);
    this.source = new Float32Array(Math.floor(sampleRate * 4));
    this.sourceWrite = 0;
    this.phase = [0, 0, 0];
    this.grains = [];
    this.spawnPhase = 0;
    this.sampleCounter = 0;
    this.low = [0, 0];
    this.band = [0, 0];
    this.dcX = [0, 0];
    this.dcY = [0, 0];
    this.delays = [1493, 1601, 1747, 1867].map((length) => new DelayLine(Math.round(length * sampleRate / 48000)));
    this.meterCount = 0;
    this.meterSum = 0;
    this.meterPeak = 0;
    this.port.onmessage = (event) => {
      if (event.data?.type === "seed") {
        this.random = new Lcg(Number(event.data.value) || 311);
        this.grains.length = 0;
      }
    };
  }

  parameter(parameters, name) {
    const value = parameters[name];
    return value.length === 1 ? value[0] : value[0];
  }

  writeSource(tension, texture, evolution) {
    const drift = 0.35 + evolution * 0.9;
    const base = 52 + tension * 34 + Math.sin(this.sampleCounter / sampleRate * drift) * 7;
    const ratios = [1, 1.5 + tension * 0.08, 2.01 + tension * 0.19];
    let value = 0;
    for (let index = 0; index < this.phase.length; index += 1) {
      this.phase[index] += (Math.PI * 2 * base * ratios[index]) / sampleRate;
      if (this.phase[index] > Math.PI * 2) this.phase[index] -= Math.PI * 2;
      value += Math.sin(this.phase[index]) * [0.55, 0.26, 0.16][index];
    }
    value += this.random.bipolar() * texture * 0.22;
    this.source[this.sourceWrite] = Math.tanh(value);
    this.sourceWrite = (this.sourceWrite + 1) % this.source.length;
  }

  spawnGrain(grainSize, spread, tension) {
    if (this.grains.length >= 48) return;
    const length = Math.max(64, Math.floor(grainSize * sampleRate));
    const delay = Math.floor((0.08 + this.random.next() * 3.5) * sampleRate);
    const ratio = 1 + (this.random.bipolar() * spread * 0.14) + tension * 0.035;
    this.grains.push({
      age: 0,
      length,
      position: this.sourceWrite - delay,
      ratio,
      pan: this.random.bipolar() * spread,
      gain: 0.14 + this.random.next() * 0.16,
    });
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

  processGrains(width) {
    let left = 0;
    let right = 0;
    for (let index = this.grains.length - 1; index >= 0; index -= 1) {
      const grain = this.grains[index];
      const phase = grain.age / grain.length;
      if (phase >= 1) {
        this.grains.splice(index, 1);
        continue;
      }
      const window = 0.5 - 0.5 * Math.cos(Math.PI * 2 * phase);
      const sample = this.readSource(grain.position + grain.age * grain.ratio) * window * grain.gain;
      const pan = grain.pan * width;
      left += sample * Math.sqrt((1 - pan) * 0.5);
      right += sample * Math.sqrt((1 + pan) * 0.5);
      grain.age += 1;
    }
    return [left, right];
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

  feedbackNetwork(inputLeft, inputRight, feedback, width) {
    const reads = this.delays.map((delay) => delay.read());
    const mixed = [
      reads[0] + reads[1] + reads[2] + reads[3],
      reads[0] - reads[1] + reads[2] - reads[3],
      reads[0] + reads[1] - reads[2] - reads[3],
      reads[0] - reads[1] - reads[2] + reads[3],
    ].map((value) => value * 0.5);
    const mono = (inputLeft + inputRight) * 0.5;
    this.delays[0].write(mono * 0.32 + mixed[0] * feedback);
    this.delays[1].write(inputLeft * 0.28 + mixed[1] * feedback);
    this.delays[2].write(inputRight * 0.28 + mixed[2] * feedback);
    this.delays[3].write(mono * 0.24 + mixed[3] * feedback);
    const wetLeft = (reads[0] + reads[2] - reads[3]) * 0.28;
    const wetRight = (reads[1] - reads[2] + reads[3]) * 0.28;
    return [
      inputLeft + wetLeft * width,
      inputRight + wetRight * width,
    ];
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

    for (let frame = 0; frame < left.length; frame += 1) {
      this.writeSource(tension, texture, evolution);
      const grainsPerSecond = 1.5 + density * 22;
      this.spawnPhase += grainsPerSecond / sampleRate;
      if (this.spawnPhase >= 1) {
        this.spawnPhase -= 1;
        this.spawnGrain(grainSize, spread, tension);
      }

      let [l, r] = this.processGrains(width);
      l = this.filter(l, 0, tone, tension);
      r = this.filter(r, 1, tone, tension);
      [l, r] = this.feedbackNetwork(l, r, feedback, width);
      l = Math.tanh(this.dcBlock(l, 0) * 1.35) * 0.55;
      r = Math.tanh(this.dcBlock(r, 1) * 1.35) * 0.55;
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
    return true;
  }
}

registerProcessor("signal-garden", SignalGardenProcessor);
